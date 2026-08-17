import { canonicalizeJson, type CanonicalJson } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  indexGroupedDatLevels,
  parseDatFile,
  type IndexedDatLevelGroup,
} from "@content/api/series-file";
import {
  parseSolutionFile,
  type SolutionFileEntry,
} from "@content/api/solutionFileFormat";
import { parseSeriesConfig } from "@content/api/seriesConfig";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import { normalizeDecodedTworldLevel } from "../tworldMsLevelProjection";
import {
  CCSOLVER_CORPUS_SOURCE_REVISION,
  CORPUS_PACK_REGISTRY,
  corpusRegistrySourcePaths,
  isSafeRepositoryRelativePath,
} from "./registry";
import { PINNED_SOURCE_FILES } from "./sourcePins";
import type {
  BuildPinnedCorpusManifestInput,
  CorpusDonorReferenceV1,
  CorpusManifestPackV1,
  CorpusManifestSummaryV1,
  CorpusManifestV1,
  CorpusMapCaseV1,
  CorpusPackSpec,
  CorpusSourceMemberReferenceV1,
  CorpusTarget,
  CorpusTargetRecordV1,
  CorpusTargetSourceSpec,
  NormalizedGameplayReferenceV1,
  PinnedSourceFile,
} from "./types";

const TEXT_DECODER = new TextDecoder();
const ORTHOGONAL_DIRECTIONS = new Set([1, 2, 4, 8]);
const ENCODED_DIRECTIONS = new Set([1, 2, 3, 4, 6, 8, 9, 12]);

export interface IndexedSolutionEntry {
  readonly entryOrdinal: number;
  readonly entry: SolutionFileEntry;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array, sha256: Sha256Port): Promise<string> {
  return bytesToHex(await sha256.digestBytes(bytes));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateRegistry(): string[] {
  if (CORPUS_PACK_REGISTRY.length !== 39) {
    throw new Error(`pinned corpus must declare exactly 39 packs; found ${CORPUS_PACK_REGISTRY.length}`);
  }

  const packIds = new Set<string>();
  for (const pack of CORPUS_PACK_REGISTRY) {
    if (!/^[a-z0-9-]+$/.test(pack.packId) || packIds.has(pack.packId)) {
      throw new Error(`invalid or duplicate corpus pack id: ${pack.packId}`);
    }
    packIds.add(pack.packId);
    if (pack.targets[0].target !== "ms" || pack.targets[1].target !== "lynx") {
      throw new Error(`corpus targets must be ordered ms then lynx: ${pack.packId}`);
    }
  }

  const paths = corpusRegistrySourcePaths(CORPUS_PACK_REGISTRY);
  const pathSet = new Set(paths);
  if (paths.length !== pathSet.size) {
    throw new Error("pinned corpus registry contains a duplicate source path");
  }
  for (const path of paths) {
    if (!isSafeRepositoryRelativePath(path)) {
      throw new Error(`unsafe corpus source path: ${path}`);
    }
    if (path.toLowerCase().includes("cclxp2")) {
      throw new Error(`CCLXP2 is not a CCLP2 Lynx donor and cannot enter this corpus: ${path}`);
    }
  }

  const pinnedPaths = Object.keys(PINNED_SOURCE_FILES).sort(compareText);
  const registeredPaths = [...paths].sort(compareText);
  if (
    pinnedPaths.length !== registeredPaths.length
    || pinnedPaths.some((path, index) => path !== registeredPaths[index])
  ) {
    throw new Error("pinned source table does not exactly match the corpus registry");
  }
  return registeredPaths;
}

export async function verifyPinnedSourceFile(
  path: string,
  bytes: Uint8Array,
  pin: PinnedSourceFile,
  sha256: Sha256Port,
): Promise<void> {
  if (bytes.byteLength !== pin.byteLength) {
    throw new Error(
      `pinned source byte length mismatch: ${path}; expected ${pin.byteLength}, received ${bytes.byteLength}`,
    );
  }
  const actualDigest = await sha256Hex(bytes, sha256);
  if (actualDigest !== pin.sha256) {
    throw new Error(
      `pinned source digest mismatch: ${path}; expected ${pin.sha256}, received ${actualDigest}`,
    );
  }
}

async function loadPinnedSources(
  paths: readonly string[],
  input: BuildPinnedCorpusManifestInput,
): Promise<Map<string, Uint8Array>> {
  const loaded = new Map<string, Uint8Array>();
  for (const path of paths) {
    const pin = PINNED_SOURCE_FILES[path];
    if (pin === undefined) {
      throw new Error(`corpus source has no pin: ${path}`);
    }
    const bytes = new Uint8Array(await input.source.readBytes(path));
    await verifyPinnedSourceFile(path, bytes, pin, input.sha256);
    loaded.set(path, bytes);
  }
  return loaded;
}

function requireLoadedSource(loaded: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = loaded.get(path);
  if (bytes === undefined) {
    throw new Error(`verified corpus source was not loaded: ${path}`);
  }
  return bytes;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function validateSeriesConfig(
  spec: CorpusPackSpec,
  targetSpec: CorpusTargetSourceSpec,
  loaded: ReadonlyMap<string, Uint8Array>,
): void {
  if (targetSpec.donorPath === null && targetSpec.donorSetName !== null) {
    throw new Error(`donor set name without a donor: ${spec.packId}/${targetSpec.target}`);
  }
  if (targetSpec.seriesConfigPath === null) {
    if (targetSpec.donorPath !== null) {
      throw new Error(`donor without a series configuration: ${spec.packId}/${targetSpec.target}`);
    }
    return;
  }
  const config = parseSeriesConfig(TEXT_DECODER.decode(
    requireLoadedSource(loaded, targetSpec.seriesConfigPath),
  ));
  const expectedRuleset = targetSpec.target === "ms" ? "MS" : "Lynx";
  if (config.mapFile !== fileName(spec.mapPath)) {
    throw new Error(
      `series configuration map mismatch: ${targetSpec.seriesConfigPath}; expected ${fileName(spec.mapPath)}`,
    );
  }
  if (config.ruleset !== expectedRuleset) {
    throw new Error(
      `series configuration ruleset mismatch: ${targetSpec.seriesConfigPath}; expected ${expectedRuleset}`,
    );
  }
}

function donorEntriesByLevel(
  pack: CorpusPackSpec,
  targetSpec: CorpusTargetSourceSpec,
  loaded: ReadonlyMap<string, Uint8Array>,
): Map<number, IndexedSolutionEntry> {
  if (targetSpec.donorPath === null) {
    return new Map();
  }
  const parsed = parseSolutionFile(requireLoadedSource(loaded, targetSpec.donorPath));
  const expectedRuleset = targetSpec.target === "ms" ? "MS" : "Lynx";
  if (parsed.ruleset !== expectedRuleset) {
    throw new Error(
      `solution-file ruleset mismatch: ${targetSpec.donorPath}; expected ${expectedRuleset}`,
    );
  }
  verifyDonorSetName(targetSpec.donorPath, targetSpec.donorSetName, parsed.setName);

  return indexDonorEntries(pack.packId, targetSpec.target, parsed.entries);
}

export function verifyDonorSetName(
  sourcePath: string,
  expectedSetName: string | null,
  actualSetName: string | null,
): void {
  if (actualSetName !== expectedSetName) {
    throw new Error(
      `donor set-name mismatch: ${sourcePath}; expected ${expectedSetName ?? "none"}, `
      + `received ${actualSetName ?? "none"}`,
    );
  }
}

export function indexDonorEntries(
  packId: string,
  target: CorpusTarget,
  sourceEntries: readonly SolutionFileEntry[],
): Map<number, IndexedSolutionEntry> {
  const entries = new Map<number, IndexedSolutionEntry>();
  for (let entryOrdinal = 0; entryOrdinal < sourceEntries.length; entryOrdinal += 1) {
    const entry = sourceEntries[entryOrdinal]!;
    if (entries.has(entry.levelNumber)) {
      throw new Error(`duplicate donor entry: ${packId}/${target}/${entry.levelNumber}`);
    }
    entries.set(entry.levelNumber, { entryOrdinal, entry });
  }
  return entries;
}

export function verifyDonorEntryCoverage(
  packId: string,
  target: CorpusTarget,
  donorEntries: ReadonlyMap<number, IndexedSolutionEntry>,
  logicalLevelNumbers: readonly number[],
): void {
  const logicalLevels = new Set(logicalLevelNumbers);
  for (const levelNumber of donorEntries.keys()) {
    if (!logicalLevels.has(levelNumber)) {
      throw new Error(`donor entry has no corpus occurrence: ${packId}/${target}/${levelNumber}`);
    }
  }
}

export function verifyDonorPassword(
  sourcePath: string,
  levelNumber: number,
  expectedPassword: string,
  donorPassword: string,
): void {
  if (donorPassword !== expectedPassword) {
    throw new Error(
      `donor password mismatch: ${sourcePath}/${levelNumber}; expected ${expectedPassword}, received ${donorPassword}`,
    );
  }
}

async function buildDonorReference(
  sourcePath: string,
  indexedEntry: IndexedSolutionEntry | undefined,
  sha256: Sha256Port,
): Promise<CorpusDonorReferenceV1 | null> {
  if (indexedEntry === undefined) {
    return null;
  }
  const entry = indexedEntry.entry;
  if (
    entry.solutionData === null
    || entry.expandedSolution === null
    || entry.bestTimeTicks === null
  ) {
    return null;
  }
  const directions = entry.expandedSolution.moves.map((move) => move.dir);
  return {
    sourcePath,
    entryOrdinal: indexedEntry.entryOrdinal,
    sourceLevelNumber: entry.levelNumber,
    password: entry.password,
    bestTimeTicks: entry.bestTimeTicks,
    entryByteLength: entry.solutionData.byteLength,
    entrySha256: await sha256Hex(entry.solutionData, sha256),
    flags: entry.expandedSolution.flags,
    randomSlideDirection: entry.expandedSolution.randomSlideDirection,
    stepping: entry.expandedSolution.stepping,
    randomSeed: entry.expandedSolution.randomSeed,
    moveCount: entry.expandedSolution.moves.length,
    containsDiagonalInput: directions.some((direction) =>
      ENCODED_DIRECTIONS.has(direction) && !ORTHOGONAL_DIRECTIONS.has(direction),
    ),
    containsMouseInput: directions.some((direction) => !ENCODED_DIRECTIONS.has(direction)),
  };
}

async function buildSourceMembers(
  mapPath: string,
  group: IndexedDatLevelGroup,
  mapBytes: Uint8Array,
  sha256: Sha256Port,
): Promise<CorpusSourceMemberReferenceV1[]> {
  return Promise.all(group.layers.map(async (layer, ordinal) => {
    const bytes = mapBytes.subarray(layer.start, layer.start + layer.size);
    return {
      ordinal,
      sourceLevelNumber: layer.number,
      sourcePath: mapPath,
      byteOffset: layer.start,
      byteLength: layer.size,
      sha256: await sha256Hex(bytes, sha256),
    };
  }));
}

export async function normalizedGameplayReferenceForMembers(
  members: readonly Uint8Array[],
  sha256: Sha256Port,
): Promise<NormalizedGameplayReferenceV1> {
  if (members.length === 0) {
    throw new Error("normalized gameplay identity requires at least one source member");
  }
  const decoded = msElementFamilyRegistration.levelLoadRegistration.decodeLoadedLevel({
    levelData: members[0]!,
    layerData: members,
  });
  const normalizedMap = canonicalizeJson(normalizeDecodedTworldLevel(decoded));
  return {
    status: "available",
    profile: "tworld-legacy-dat-gameplay-v1",
    sha256: bytesToHex(await sha256.digestUtf8(normalizedMap)),
  };
}

async function buildNormalizedGameplayReference(
  group: IndexedDatLevelGroup,
  mapBytes: Uint8Array,
  sha256: Sha256Port,
): Promise<NormalizedGameplayReferenceV1> {
  return normalizedGameplayReferenceForMembers(
    group.layers.map((layer) => mapBytes.subarray(layer.start, layer.start + layer.size)),
    sha256,
  );
}

function occurrenceId(packId: string, levelNumber: number): string {
  return `${packId}/${levelNumber.toString().padStart(3, "0")}`;
}

async function targetRecord(
  targetSpec: CorpusTargetSourceSpec,
  donorEntries: ReadonlyMap<number, IndexedSolutionEntry>,
  levelNumber: number,
  expectedPassword: string,
  sha256: Sha256Port,
): Promise<CorpusTargetRecordV1> {
  const indexedEntry = donorEntries.get(levelNumber);
  if (indexedEntry !== undefined) {
    verifyDonorPassword(
      targetSpec.donorPath ?? "missing-donor-path",
      levelNumber,
      expectedPassword,
      indexedEntry.entry.password,
    );
  }
  return {
    target: targetSpec.target,
    seriesConfigPath: targetSpec.seriesConfigPath,
    donor: targetSpec.donorPath === null
      ? null
      : await buildDonorReference(targetSpec.donorPath, indexedEntry, sha256),
  };
}

async function identifyCase(
  occurrence: string,
  normalized: NormalizedGameplayReferenceV1,
  sha256: Sha256Port,
): Promise<string> {
  const descriptor = canonicalizeJson({
    identityType: "corpus-map-case",
    identityVersion: 1,
    occurrenceId: occurrence,
    normalizationProfile: normalized.profile,
    normalizedGameplaySha256: normalized.sha256,
  });
  return `case:sha256:${bytesToHex(await sha256.digestUtf8(descriptor))}`;
}

async function buildPack(
  pack: CorpusPackSpec,
  loaded: ReadonlyMap<string, Uint8Array>,
  sha256: Sha256Port,
): Promise<{ pack: CorpusManifestPackV1; cases: CorpusMapCaseV1[] }> {
  for (const targetSpec of pack.targets) {
    validateSeriesConfig(pack, targetSpec, loaded);
  }
  const donorEntries: readonly [Map<number, IndexedSolutionEntry>, Map<number, IndexedSolutionEntry>] = [
    donorEntriesByLevel(pack, pack.targets[0], loaded),
    donorEntriesByLevel(pack, pack.targets[1], loaded),
  ];
  const mapBytes = requireLoadedSource(loaded, pack.mapPath);
  const parsed = parseDatFile(mapBytes, { ruleset: "MS" });
  const indexed = indexGroupedDatLevels(mapBytes);
  if (parsed.levels.length !== indexed.levels.length) {
    throw new Error(`parsed and indexed logical level counts disagree: ${pack.packId}`);
  }
  const logicalLevelNumbers = indexed.levels.map((group) => group.number);
  verifyDonorEntryCoverage(pack.packId, pack.targets[0].target, donorEntries[0], logicalLevelNumbers);
  verifyDonorEntryCoverage(pack.packId, pack.targets[1].target, donorEntries[1], logicalLevelNumbers);

  const cases = await Promise.all(indexed.levels.map(async (group, index): Promise<CorpusMapCaseV1> => {
    const metadata = parsed.levels[index];
    if (metadata === undefined || metadata.number !== group.number) {
      throw new Error(`logical level metadata mismatch: ${pack.packId}/${group.number}`);
    }
    const occurrence = occurrenceId(pack.packId, group.number);
    const normalizedGameplayReference = await buildNormalizedGameplayReference(group, mapBytes, sha256);
    const targets = await Promise.all([
      targetRecord(pack.targets[0], donorEntries[0], group.number, metadata.password, sha256),
      targetRecord(pack.targets[1], donorEntries[1], group.number, metadata.password, sha256),
    ]);
    return {
      caseId: await identifyCase(occurrence, normalizedGameplayReference, sha256),
      occurrenceId: occurrence,
      packId: pack.packId,
      levelNumber: group.number,
      title: metadata.name,
      author: metadata.author,
      sourceMembers: await buildSourceMembers(pack.mapPath, group, mapBytes, sha256),
      normalizedGameplayReference,
      targets: [targets[0], targets[1]],
    };
  }));

  return {
    pack: {
      packId: pack.packId,
      displayName: pack.displayName,
      mapPath: pack.mapPath,
      logicalMapCount: cases.length,
      targets: pack.targets,
    },
    cases,
  };
}

function summarize(
  packs: readonly CorpusManifestPackV1[],
  cases: readonly CorpusMapCaseV1[],
): CorpusManifestSummaryV1 {
  let donorBackedTargetRecordCount = 0;
  let pairedDonorCaseCount = 0;
  let msOnlyDonorCaseCount = 0;
  let lynxOnlyDonorCaseCount = 0;
  let noDonorCaseCount = 0;
  for (const entry of cases) {
    const ms = entry.targets[0].donor !== null;
    const lynx = entry.targets[1].donor !== null;
    donorBackedTargetRecordCount += Number(ms) + Number(lynx);
    if (ms && lynx) pairedDonorCaseCount += 1;
    else if (ms) msOnlyDonorCaseCount += 1;
    else if (lynx) lynxOnlyDonorCaseCount += 1;
    else noDonorCaseCount += 1;
  }
  return {
    packCount: packs.length,
    mapCaseCount: cases.length,
    targetRecordCount: cases.length * 2,
    donorBackedTargetRecordCount,
    pairedDonorCaseCount,
    msOnlyDonorCaseCount,
    lynxOnlyDonorCaseCount,
    noDonorCaseCount,
  };
}

function assertPinnedCorpusSummary(summary: CorpusManifestSummaryV1): void {
  const expected: CorpusManifestSummaryV1 = {
    packCount: 39,
    mapCaseCount: 2_440,
    targetRecordCount: 4_880,
    donorBackedTargetRecordCount: 4_664,
    pairedDonorCaseCount: 2_257,
    msOnlyDonorCaseCount: 150,
    lynxOnlyDonorCaseCount: 0,
    noDonorCaseCount: 33,
  };
  for (const key of Object.keys(expected) as Array<keyof CorpusManifestSummaryV1>) {
    if (summary[key] !== expected[key]) {
      throw new Error(`pinned corpus summary mismatch for ${key}: expected ${expected[key]}, received ${summary[key]}`);
    }
  }
}

export async function buildPinnedCorpusManifest(
  input: BuildPinnedCorpusManifestInput,
): Promise<CorpusManifestV1> {
  const paths = validateRegistry();
  const loaded = await loadPinnedSources(paths, input);
  const built = [];
  for (const pack of CORPUS_PACK_REGISTRY) {
    built.push(await buildPack(pack, loaded, input.sha256));
  }
  const packs = built.map((entry) => entry.pack);
  const cases = built.flatMap((entry) => entry.cases);
  if (new Set(cases.map((entry) => entry.occurrenceId)).size !== cases.length) {
    throw new Error("pinned corpus contains duplicate occurrence ids");
  }
  if (new Set(cases.map((entry) => entry.caseId)).size !== cases.length) {
    throw new Error("pinned corpus contains duplicate case ids");
  }
  const summary = summarize(packs, cases);
  assertPinnedCorpusSummary(summary);

  return {
    artifact: "ccsolver-corpus-manifest",
    version: 1,
    source: {
      repository: "joshua-bone/tworld",
      revision: CCSOLVER_CORPUS_SOURCE_REVISION,
    },
    sources: paths.map((path) => ({ path, ...PINNED_SOURCE_FILES[path]! })),
    packs,
    cases,
    summary,
  };
}

export function canonicalCorpusManifestJson(manifest: CorpusManifestV1): CanonicalJson {
  return canonicalizeJson(manifest);
}
