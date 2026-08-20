import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  canonicalizeJson,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  extractIndexedGroupedDatLevel,
  indexGroupedDatLevels,
  parseDatFile,
  type IndexedDatLevelGroup,
  type ParsedDatFile,
} from "@content/api/series-file";
import {
  parseSolutionFile,
  type ParsedSolutionFile,
  type SolutionFileEntry,
} from "@content/api/solutionFileFormat";
import { parseSeriesConfig } from "@content/api/seriesConfig";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import { normalizeDecodedTworldLevel } from "../tworldMsLevelProjection";
import {
  verifyDonorSetName,
  verifyPinnedSourceFile,
} from "../p1a-corpus/corpusManifest";
import {
  CCSOLVER_CORPUS_SOURCE_REVISION,
  CORPUS_PACK_REGISTRY,
} from "../p1a-corpus/registry";
import { PINNED_SOURCE_FILES } from "../p1a-corpus/sourcePins";
import type {
  CorpusDonorReferenceV1,
  CorpusManifestPackV1,
  CorpusManifestV1,
  CorpusMapCaseV1,
  CorpusPackSpec,
  CorpusTarget,
  CorpusTargetSourceSpec,
} from "../p1a-corpus/types";
import type {
  P1bCorpusOccurrenceV1,
  P1bCorpusValidityReportV1,
} from "../p1b-curriculum/corpusValidityReport";
import { assertTworldSolverSourceEligibility } from "../sourceValidity/assertTworldSolverSourceEligibility";
import {
  P7_TRAINING_INVENTORY_LIMITS,
  buildBoundedCanonicalGameplayMapDiff,
  detachCheckedLevelSource,
  detachCheckedReplay,
  resolveVotingMapRelationship,
  type P7CanonicalGameplayMapDiff,
  type P7TrainingCorpusInventory,
  type P7TrainingCorpusInventorySummary,
  type P7TrainingDirectCoverageSummary,
  type P7TrainingDonorCandidate,
  type P7TrainingDonorSource,
  type P7TrainingExecutionSource,
  type P7TrainingLevelInventory,
  type P7TrainingPackId,
  type P7TrainingPackInventory,
  type P7TrainingTargetInventory,
  type P7TrainingVerifiedInput,
  type P7TrainingVotingMapBinding,
  type P7TrainingVotingRelationship,
  type P7DetachedLevelSource,
} from "./trainingCorpusInventory";

const CORPUS_MANIFEST_PATH = "ccsolver/corpus/manifest.v1.json";
const VALIDITY_REPORT_PATH = "ccsolver/corpus/p1b-validity-report.v1.json";
const TEXT_DECODER = new TextDecoder();
const TRAINING_PACK_IDS: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];
const ORTHOGONAL_DIRECTIONS = new Set([1, 2, 4, 8]);
const ENCODED_DIRECTIONS = new Set([1, 2, 3, 4, 6, 8, 9, 12]);

interface CanonicalInput<T> {
  readonly value: T;
  readonly text: string;
}

interface RequiredTargetSpec extends CorpusTargetSourceSpec {
  readonly seriesConfigPath: string;
  readonly donorPath: string;
}

interface LoadedTargetContext {
  readonly spec: RequiredTargetSpec;
  readonly solution: ParsedSolutionFile;
}

interface LoadedPackContext {
  readonly spec: CorpusPackSpec;
  readonly manifest: CorpusManifestPackV1;
  readonly mapBytes: Uint8Array;
  readonly parsedMap: ParsedDatFile;
  readonly indexedByLevel: ReadonlyMap<number, IndexedDatLevelGroup>;
  readonly casesByLevel: ReadonlyMap<number, CorpusMapCaseV1>;
  readonly targets: readonly [LoadedTargetContext, LoadedTargetContext];
}

interface LoadedLevelMaterial {
  readonly context: LoadedPackContext;
  readonly manifestCase: CorpusMapCaseV1;
  readonly validityOccurrence: P1bCorpusOccurrenceV1;
  readonly eligibility: ReturnType<typeof assertTworldSolverSourceEligibility>;
  readonly normalizedMap: CanonicalJsonValue;
  readonly password: string;
  readonly source: P7DetachedLevelSource;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function digestHex(bytes: Uint8Array, sha256: Sha256Port): Promise<string> {
  return bytesToHex(await sha256.digestBytes(bytes));
}

async function digestUtf8(value: CanonicalJson, sha256: Sha256Port): Promise<string> {
  return bytesToHex(await sha256.digestUtf8(value));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fileBase(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function pinnedContent(path: string) {
  const pin = PINNED_SOURCE_FILES[path];
  if (pin === undefined) throw new Error(`P7 training source has no content pin: ${path}`);
  return {
    digest: `sha256:${pin.sha256}` as const,
    byteLength: pin.byteLength,
  };
}

async function readCanonicalJson<T>(repositoryRoot: string, path: string): Promise<CanonicalInput<T>> {
  const text = await readFile(resolve(repositoryRoot, path), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
    throw new Error(`checked P7 training input is not canonical JSON: ${path}`);
  }
  return { value: parsed as T, text };
}

async function assertCheckedRoots(
  manifest: CorpusManifestV1,
  manifestText: string,
  validity: P1bCorpusValidityReportV1,
  sha256: Sha256Port,
): Promise<void> {
  if (
    manifest.artifact !== "ccsolver-corpus-manifest"
    || manifest.version !== 1
    || manifest.source.repository !== "joshua-bone/tworld"
    || manifest.source.revision !== CCSOLVER_CORPUS_SOURCE_REVISION
  ) {
    throw new Error("P7 training inventory requires the pinned corpus manifest v1 revision");
  }
  if (
    validity.reportType !== "ccsolver-p1b-corpus-validity"
    || validity.reportVersion !== 1
    || validity.source.corpusRepository !== manifest.source.repository
    || validity.source.corpusRevision !== manifest.source.revision
  ) {
    throw new Error("P7 training validity is not bound to the pinned corpus revision");
  }
  const manifestBytes = new TextEncoder().encode(manifestText);
  if (
    validity.source.corpusManifest.byteLength !== manifestBytes.byteLength
    || validity.source.corpusManifest.digest
      !== `sha256:${await digestHex(manifestBytes, sha256)}`
  ) {
    throw new Error("P7 training validity content binding to the corpus manifest drifted");
  }
}

function relevantPackSpecs(): readonly CorpusPackSpec[] {
  const selected = CORPUS_PACK_REGISTRY.filter(({ packId }) => (
    TRAINING_PACK_IDS.includes(packId as P7TrainingPackId)
    || packId.startsWith("cclp5-voting-")
  ));
  if (selected.length !== 37) {
    throw new Error(`P7 training inventory requires exactly 37 source packs; found ${selected.length}`);
  }
  return selected;
}

function packSourcePaths(specs: readonly CorpusPackSpec[]): readonly string[] {
  const paths = [...new Set(specs.flatMap((spec) => [
    spec.mapPath,
    ...spec.targets.flatMap(({ seriesConfigPath, donorPath }) => (
      [seriesConfigPath, donorPath].filter((path): path is string => path !== null)
    )),
  ]))].sort(compareText);
  if (paths.length !== P7_TRAINING_INVENTORY_LIMITS.inputFileCount) {
    throw new Error(
      `P7 training source boundary requires ${P7_TRAINING_INVENTORY_LIMITS.inputFileCount} files; found ${paths.length}`,
    );
  }
  const byteLength = paths.reduce((sum, path) => sum + (PINNED_SOURCE_FILES[path]?.byteLength ?? 0), 0);
  if (byteLength !== P7_TRAINING_INVENTORY_LIMITS.inputByteLength) {
    throw new Error(
      `P7 training source boundary requires ${P7_TRAINING_INVENTORY_LIMITS.inputByteLength} bytes; found ${byteLength}`,
    );
  }
  return paths;
}

async function loadVerifiedInputs(
  repositoryRoot: string,
  paths: readonly string[],
  manifest: CorpusManifestV1,
  sha256: Sha256Port,
): Promise<{
  readonly loaded: ReadonlyMap<string, Uint8Array>;
  readonly references: readonly P7TrainingVerifiedInput[];
}> {
  const manifestSources = new Map(manifest.sources.map((source) => [source.path, source]));
  const loaded = new Map<string, Uint8Array>();
  const references: P7TrainingVerifiedInput[] = [];
  for (const path of paths) {
    const pin = PINNED_SOURCE_FILES[path];
    const checked = manifestSources.get(path);
    if (
      pin === undefined
      || checked === undefined
      || pin.byteLength !== checked.byteLength
      || pin.sha256 !== checked.sha256
    ) {
      throw new Error(`P7 training source pin drifted: ${path}`);
    }
    const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, path)));
    await verifyPinnedSourceFile(path, bytes, pin, sha256);
    loaded.set(path, bytes);
    references.push({ path, byteLength: pin.byteLength, sha256: pin.sha256 });
  }
  return { loaded, references };
}

function requiredBytes(loaded: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = loaded.get(path);
  if (bytes === undefined) throw new Error(`verified P7 training input was not loaded: ${path}`);
  return bytes;
}

function assertPackSpec(
  expected: CorpusPackSpec,
  manifestPack: CorpusManifestPackV1 | undefined,
): asserts manifestPack is CorpusManifestPackV1 {
  if (
    manifestPack === undefined
    || manifestPack.displayName !== expected.displayName
    || manifestPack.mapPath !== expected.mapPath
    || manifestPack.targets.length !== 2
    || expected.targets.some((target, index) => {
      const actual = manifestPack.targets[index];
      return actual === undefined
        || actual.target !== target.target
        || actual.seriesConfigPath !== target.seriesConfigPath
        || actual.donorPath !== target.donorPath
        || actual.donorSetName !== target.donorSetName;
    })
  ) {
    throw new Error(`P7 training pack source configuration drifted: ${expected.packId}`);
  }
}

function requiredTargetSpec(
  spec: CorpusTargetSourceSpec,
  packId: string,
): RequiredTargetSpec {
  if (spec.seriesConfigPath === null || spec.donorPath === null) {
    throw new Error(`P7 training source pack lacks target inputs: ${packId}/${spec.target}`);
  }
  return spec as RequiredTargetSpec;
}

function loadTargetContext(
  pack: CorpusPackSpec,
  targetSpec: CorpusTargetSourceSpec,
  loaded: ReadonlyMap<string, Uint8Array>,
): LoadedTargetContext {
  const spec = requiredTargetSpec(targetSpec, pack.packId);
  const ruleset = spec.target === "ms" ? "MS" : "Lynx";
  const series = parseSeriesConfig(TEXT_DECODER.decode(requiredBytes(loaded, spec.seriesConfigPath)));
  if (series.mapFile !== fileBase(pack.mapPath) || series.ruleset !== ruleset) {
    throw new Error(`P7 training series configuration drifted: ${spec.seriesConfigPath}`);
  }
  const solution = parseSolutionFile(requiredBytes(loaded, spec.donorPath));
  if (solution.ruleset !== ruleset) {
    throw new Error(`P7 training donor ruleset drifted: ${spec.donorPath}`);
  }
  verifyDonorSetName(spec.donorPath, spec.donorSetName, solution.setName);
  return { spec, solution };
}

function buildPackContext(
  spec: CorpusPackSpec,
  manifest: CorpusManifestV1,
  loaded: ReadonlyMap<string, Uint8Array>,
): LoadedPackContext {
  const manifestPack = manifest.packs.find(({ packId }) => packId === spec.packId);
  assertPackSpec(spec, manifestPack);
  const mapBytes = requiredBytes(loaded, spec.mapPath);
  const parsedMap = parseDatFile(mapBytes, { ruleset: "MS" });
  const indexed = indexGroupedDatLevels(mapBytes);
  const cases = manifest.cases
    .filter(({ packId }) => packId === spec.packId)
    .sort((left, right) => left.levelNumber - right.levelNumber);
  if (
    parsedMap.levels.length !== indexed.levels.length
    || indexed.levels.length !== manifestPack.logicalMapCount
    || cases.length !== manifestPack.logicalMapCount
  ) {
    throw new Error(`P7 training map denominator drifted: ${spec.packId}`);
  }
  for (let index = 0; index < cases.length; index += 1) {
    if (
      cases[index]?.levelNumber !== index + 1
      || indexed.levels[index]?.number !== index + 1
      || parsedMap.levels[index]?.number !== index + 1
    ) {
      throw new Error(`P7 training map level order drifted: ${spec.packId}/${index + 1}`);
    }
  }
  return {
    spec,
    manifest: manifestPack,
    mapBytes,
    parsedMap,
    indexedByLevel: new Map(indexed.levels.map((level) => [level.number, level])),
    casesByLevel: new Map(cases.map((entry) => [entry.levelNumber, entry])),
    targets: [
      loadTargetContext(spec, spec.targets[0], loaded),
      loadTargetContext(spec, spec.targets[1], loaded),
    ],
  };
}

function exactValidity(
  validityByOccurrence: ReadonlyMap<string, P1bCorpusOccurrenceV1>,
  entry: CorpusMapCaseV1,
): P1bCorpusOccurrenceV1 {
  const occurrence = validityByOccurrence.get(entry.occurrenceId);
  if (
    occurrence === undefined
    || occurrence.caseId !== entry.caseId
    || occurrence.packId !== entry.packId
    || occurrence.levelNumber !== entry.levelNumber
    || occurrence.title !== entry.title
    || occurrence.author !== entry.author
    || occurrence.normalizedGameplaySha256 !== entry.normalizedGameplayReference.sha256
    || occurrence.validity.status !== "valid"
    || occurrence.validity.issueCount !== 0
    || occurrence.validity.invalidCellCount !== 0
    || canonicalizeJson(occurrence.sourceMembers) !== canonicalizeJson(entry.sourceMembers)
  ) {
    throw new Error(`P7 training occurrence is not exactly bound and valid: ${entry.occurrenceId}`);
  }
  return occurrence;
}

async function loadLevelMaterial(
  context: LoadedPackContext,
  entry: CorpusMapCaseV1,
  validityByOccurrence: ReadonlyMap<string, P1bCorpusOccurrenceV1>,
  sha256: Sha256Port,
): Promise<LoadedLevelMaterial> {
  const indexed = context.indexedByLevel.get(entry.levelNumber);
  const metadata = context.parsedMap.levels[entry.levelNumber - 1];
  if (
    indexed === undefined
    || metadata === undefined
    || metadata.number !== entry.levelNumber
    || metadata.name !== entry.title
    || metadata.author !== entry.author
  ) {
    throw new Error(`P7 training source metadata drifted: ${entry.occurrenceId}`);
  }
  const extracted = extractIndexedGroupedDatLevel(context.mapBytes, indexed);
  if (entry.sourceMembers.length !== indexed.layers.length) {
    throw new Error(`P7 training source-member count drifted: ${entry.occurrenceId}`);
  }
  for (let ordinal = 0; ordinal < indexed.layers.length; ordinal += 1) {
    const layer = indexed.layers[ordinal]!;
    const member = entry.sourceMembers[ordinal];
    const bytes = context.mapBytes.subarray(layer.start, layer.start + layer.size);
    if (
      member === undefined
      || member.ordinal !== ordinal
      || member.sourceLevelNumber !== layer.number
      || member.sourcePath !== context.spec.mapPath
      || member.byteOffset !== layer.start
      || member.byteLength !== layer.size
      || member.sha256 !== await digestHex(bytes, sha256)
    ) {
      throw new Error(`P7 training exact source member drifted: ${entry.occurrenceId}/${ordinal}`);
    }
  }
  const layerData = extracted.layerData.map((bytes) => new Uint8Array(bytes));
  const eligibility = assertTworldSolverSourceEligibility({ layerData });
  const decoded = msElementFamilyRegistration.levelLoadRegistration.decodeLoadedLevel({
    levelData: new Uint8Array(extracted.levelData),
    layerData,
  });
  const normalizedMap = normalizeDecodedTworldLevel(decoded);
  const normalizedDigest = await digestUtf8(canonicalizeJson(normalizedMap), sha256);
  if (
    entry.normalizedGameplayReference.status !== "available"
    || entry.normalizedGameplayReference.profile !== "tworld-legacy-dat-gameplay-v1"
    || entry.normalizedGameplayReference.sha256 !== normalizedDigest
  ) {
    throw new Error(`P7 training normalized gameplay map drifted: ${entry.occurrenceId}`);
  }
  return {
    context,
    manifestCase: entry,
    validityOccurrence: exactValidity(validityByOccurrence, entry),
    eligibility,
    normalizedMap,
    password: metadata.password,
    source: detachCheckedLevelSource({
      containerBytes: context.mapBytes,
      containerContent: pinnedContent(context.spec.mapPath),
      mapPath: context.spec.mapPath,
      levelNumber: entry.levelNumber,
      levelData: extracted.levelData,
      layerData,
      sourceMembers: entry.sourceMembers,
      normalizedGameplaySha256: normalizedDigest,
    }),
  };
}

function targetContext(
  context: LoadedPackContext,
  target: CorpusTarget,
): LoadedTargetContext {
  const resolved = context.targets.find(({ spec }) => spec.target === target);
  if (resolved === undefined) throw new Error(`P7 training target context is missing: ${context.spec.packId}/${target}`);
  return resolved;
}

async function exactDetachedReplay(
  context: LoadedPackContext,
  entry: CorpusMapCaseV1,
  target: CorpusTarget,
  password: string,
  sha256: Sha256Port,
): Promise<{
  readonly donor: CorpusDonorReferenceV1;
  readonly replay: ReturnType<typeof detachCheckedReplay>;
} | null> {
  const targetRecord = entry.targets.find((record) => record.target === target);
  if (targetRecord === undefined) {
    throw new Error(`P7 training target record is missing: ${entry.occurrenceId}/${target}`);
  }
  const donor = targetRecord.donor;
  if (donor === null) return null;
  const source = targetContext(context, target);
  if (
    targetRecord.seriesConfigPath !== source.spec.seriesConfigPath
    || donor.sourcePath !== source.spec.donorPath
  ) {
    throw new Error(`P7 training donor source binding drifted: ${entry.occurrenceId}/${target}`);
  }
  const solutionEntry: SolutionFileEntry | undefined = source.solution.entries[donor.entryOrdinal];
  if (
    solutionEntry === undefined
    || solutionEntry.levelNumber !== entry.levelNumber
    || solutionEntry.password !== password
    || solutionEntry.bestTimeTicks === null
    || solutionEntry.solutionData === null
    || solutionEntry.expandedSolution === null
  ) {
    throw new Error(`P7 training donor entry is absent or incomplete: ${entry.occurrenceId}/${target}`);
  }
  const directions = solutionEntry.expandedSolution.moves.map(({ dir }) => dir);
  if (
    donor.sourceLevelNumber !== solutionEntry.levelNumber
    || donor.password !== solutionEntry.password
    || donor.bestTimeTicks !== solutionEntry.bestTimeTicks
    || donor.entryByteLength !== solutionEntry.solutionData.byteLength
    || donor.entrySha256 !== await digestHex(solutionEntry.solutionData, sha256)
    || donor.flags !== solutionEntry.expandedSolution.flags
    || donor.randomSlideDirection !== solutionEntry.expandedSolution.randomSlideDirection
    || donor.stepping !== solutionEntry.expandedSolution.stepping
    || donor.randomSeed !== solutionEntry.expandedSolution.randomSeed
    || donor.moveCount !== solutionEntry.expandedSolution.moves.length
    || donor.containsDiagonalInput !== directions.some((direction) => (
      ENCODED_DIRECTIONS.has(direction) && !ORTHOGONAL_DIRECTIONS.has(direction)
    ))
    || donor.containsMouseInput !== directions.some((direction) => !ENCODED_DIRECTIONS.has(direction))
  ) {
    throw new Error(`P7 training donor facts drifted: ${entry.occurrenceId}/${target}`);
  }
  return {
    donor,
    replay: detachCheckedReplay({
      donor,
      bytes: solutionEntry.solutionData,
      expandedSolution: solutionEntry.expandedSolution,
    }),
  };
}

function executionSource(
  level: LoadedLevelMaterial,
  target: CorpusTarget,
): P7TrainingExecutionSource {
  const source = targetContext(level.context, target);
  if (!TRAINING_PACK_IDS.includes(level.manifestCase.packId as P7TrainingPackId)) {
    throw new Error(`P7 execution source must be an official training pack: ${level.manifestCase.occurrenceId}`);
  }
  return {
    packId: level.manifestCase.packId as P7TrainingPackId,
    occurrenceId: level.manifestCase.occurrenceId,
    levelNumber: level.manifestCase.levelNumber,
    mapPath: level.context.spec.mapPath,
    mapContent: pinnedContent(level.context.spec.mapPath),
    seriesConfigPath: source.spec.seriesConfigPath,
    seriesConfigContent: pinnedContent(source.spec.seriesConfigPath),
    ruleset: target === "ms" ? "MS" : "Lynx",
    request: {
      seriesFile: fileBase(source.spec.seriesConfigPath),
      levelNumber: level.manifestCase.levelNumber,
      ruleset: target === "ms" ? "MS" : "Lynx",
    },
    display: {
      seriesName: `${level.context.manifest.displayName} — ${target === "ms" ? "MS" : "Lynx"}`,
      mapFilename: fileBase(level.context.spec.mapPath),
      level: structuredClone(level.context.parsedMap.levels[level.manifestCase.levelNumber - 1]!),
    },
  };
}

function donorSource(
  level: LoadedLevelMaterial,
  target: CorpusTarget,
  donor: CorpusDonorReferenceV1,
  origin: "official-pack" | "voting-pack",
): P7TrainingDonorSource {
  const source = targetContext(level.context, target);
  return {
    origin,
    packId: level.manifestCase.packId,
    occurrenceId: level.manifestCase.occurrenceId,
    levelNumber: level.manifestCase.levelNumber,
    mapPath: level.context.spec.mapPath,
    mapContent: pinnedContent(level.context.spec.mapPath),
    normalizedGameplaySha256: level.manifestCase.normalizedGameplayReference.sha256,
    sourceMembers: level.manifestCase.sourceMembers,
    validityOccurrence: level.validityOccurrence,
    eligibility: level.eligibility,
    seriesConfigPath: source.spec.seriesConfigPath,
    seriesConfigContent: pinnedContent(source.spec.seriesConfigPath),
    replaySourcePath: donor.sourcePath,
    replayFileContent: pinnedContent(donor.sourcePath),
    replayEntryOrdinal: donor.entryOrdinal,
  };
}

async function donorCandidate(input: {
  readonly executionLevel: LoadedLevelMaterial;
  readonly sourceLevel: LoadedLevelMaterial;
  readonly target: CorpusTarget;
  readonly mapRelationship: P7TrainingDonorCandidate["mapRelationship"];
  readonly priority: P7TrainingDonorCandidate["priority"];
  readonly mapDiff: P7CanonicalGameplayMapDiff | null;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingDonorCandidate | null> {
  const detached = await exactDetachedReplay(
    input.sourceLevel.context,
    input.sourceLevel.manifestCase,
    input.target,
    input.sourceLevel.password,
    input.sha256,
  );
  if (detached === null) return null;
  const execution = executionSource(input.executionLevel, input.target);
  const source = donorSource(
    input.sourceLevel,
    input.target,
    detached.donor,
    input.mapRelationship === "official-map" ? "official-pack" : "voting-pack",
  );
  return {
    candidateId: [
      "p7-training-donor",
      execution.occurrenceId,
      input.target,
      input.mapRelationship,
      source.occurrenceId,
    ].join(":"),
    priority: input.priority,
    target: input.target,
    mapRelationship: input.mapRelationship,
    execution,
    source,
    donorReference: detached.donor,
    replay: detached.replay,
    mapDiff: input.mapDiff,
  };
}

function votingMapBinding(level: LoadedLevelMaterial): P7TrainingVotingMapBinding {
  return {
    occurrenceId: level.manifestCase.occurrenceId,
    caseId: level.manifestCase.caseId,
    mapPath: level.context.spec.mapPath,
    levelNumber: level.manifestCase.levelNumber,
    normalizedGameplaySha256: level.manifestCase.normalizedGameplayReference.sha256,
    sourceMembers: level.manifestCase.sourceMembers,
    validityOccurrence: level.validityOccurrence,
    eligibility: level.eligibility,
  };
}

function directCoverage(levels: readonly P7TrainingLevelInventory[]): P7TrainingDirectCoverageSummary {
  let paired = 0;
  let msOnly = 0;
  let lynxOnly = 0;
  let none = 0;
  let donorTargets = 0;
  for (const level of levels) {
    const ms = level.targets[0].donorCandidates.some(({ mapRelationship }) => mapRelationship === "official-map");
    const lynx = level.targets[1].donorCandidates.some(({ mapRelationship }) => mapRelationship === "official-map");
    donorTargets += Number(ms) + Number(lynx);
    if (ms && lynx) paired += 1;
    else if (ms) msOnly += 1;
    else if (lynx) lynxOnly += 1;
    else none += 1;
  }
  return { paired, msOnly, lynxOnly, none, donorTargets };
}

function assertDirectCoverage(packId: P7TrainingPackId, summary: P7TrainingDirectCoverageSummary): void {
  const expected: Record<P7TrainingPackId, P7TrainingDirectCoverageSummary> = {
    cclp1: { paired: 149, msOnly: 0, lynxOnly: 0, none: 0, donorTargets: 298 },
    cclp4: { paired: 149, msOnly: 0, lynxOnly: 0, none: 0, donorTargets: 298 },
    cclp5: { paired: 115, msOnly: 1, lynxOnly: 0, none: 33, donorTargets: 231 },
  };
  if (canonicalizeJson(summary) !== canonicalizeJson(expected[packId])) {
    throw new Error(`P7 training direct donor denominators drifted: ${packId}`);
  }
}

function assertInventorySummary(summary: P7TrainingCorpusInventorySummary): void {
  const expected: P7TrainingCorpusInventorySummary = {
    packCount: 3,
    levelCount: 447,
    targetCount: 894,
    verifiedInputFileCount: 185,
    verifiedInputByteLength: 7_028_144,
    officialDonorCandidateCount: 827,
    votingDonorCandidateCount: 294,
    cclp5VotingRelationships: {
      exactGameplayAlias: 82,
      editedRelative: 65,
      none: 2,
      ambiguous: 0,
    },
    cclp5MissingOfficialLevels: {
      exactGameplayAlias: 14,
      editedRelative: 19,
      none: 1,
      ambiguous: 0,
    },
    cclp5MissingOfficialTargets: {
      exactGameplayAlias: 28,
      editedRelative: 37,
      uncovered: 2,
    },
  };
  if (canonicalizeJson(summary) !== canonicalizeJson(expected)) {
    throw new Error("P7 training inventory denominators or CCLP5 relationship counts drifted");
  }
}

export async function loadCheckedTrainingCorpusInventory(
  repositoryRoot: string,
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<P7TrainingCorpusInventory> {
  const [manifestInput, validityInput] = await Promise.all([
    readCanonicalJson<CorpusManifestV1>(repositoryRoot, CORPUS_MANIFEST_PATH),
    readCanonicalJson<P1bCorpusValidityReportV1>(repositoryRoot, VALIDITY_REPORT_PATH),
  ]);
  const manifest = manifestInput.value;
  const validity = validityInput.value;
  await assertCheckedRoots(manifest, manifestInput.text, validity, sha256);

  const specs = relevantPackSpecs();
  const { loaded, references } = await loadVerifiedInputs(
    repositoryRoot,
    packSourcePaths(specs),
    manifest,
    sha256,
  );
  const contexts = new Map(specs.map((spec) => [
    spec.packId,
    buildPackContext(spec, manifest, loaded),
  ] as const));
  const validityByOccurrence = new Map<string, P1bCorpusOccurrenceV1>();
  for (const occurrence of validity.occurrences) {
    if (validityByOccurrence.has(occurrence.occurrenceId)) {
      throw new Error(`duplicate P7 validity occurrence: ${occurrence.occurrenceId}`);
    }
    validityByOccurrence.set(occurrence.occurrenceId, occurrence);
  }
  const levelCache = new Map<string, Promise<LoadedLevelMaterial>>();
  const materialFor = (entry: CorpusMapCaseV1): Promise<LoadedLevelMaterial> => {
    let pending = levelCache.get(entry.occurrenceId);
    if (pending === undefined) {
      const context = contexts.get(entry.packId);
      if (context === undefined) throw new Error(`P7 training source context is missing: ${entry.packId}`);
      pending = loadLevelMaterial(context, entry, validityByOccurrence, sha256);
      levelCache.set(entry.occurrenceId, pending);
    }
    return pending;
  };

  const votingCases = manifest.cases
    .filter(({ packId }) => packId.startsWith("cclp5-voting-"))
    .sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
  const packs: P7TrainingPackInventory[] = [];
  for (const packId of TRAINING_PACK_IDS) {
    const context = contexts.get(packId)!;
    if (context.manifest.logicalMapCount !== P7_TRAINING_INVENTORY_LIMITS.levelsPerPack) {
      throw new Error(`P7 training official pack must contain exactly 149 levels: ${packId}`);
    }
    const levels: P7TrainingLevelInventory[] = [];
    for (let levelNumber = 1; levelNumber <= P7_TRAINING_INVENTORY_LIMITS.levelsPerPack; levelNumber += 1) {
      const manifestCase = context.casesByLevel.get(levelNumber);
      if (manifestCase === undefined) throw new Error(`P7 official level is missing: ${packId}/${levelNumber}`);
      const official = await materialFor(manifestCase);
      let votingRelationship: P7TrainingVotingRelationship | null = null;
      let votingLevels: readonly LoadedLevelMaterial[] = [];
      let votingMapDiff: P7CanonicalGameplayMapDiff | null = null;
      if (packId === "cclp5") {
        const resolved = resolveVotingMapRelationship({
          occurrenceId: manifestCase.occurrenceId,
          title: manifestCase.title,
          normalizedGameplaySha256: manifestCase.normalizedGameplayReference.sha256,
        }, votingCases.map((candidate) => ({
          ...candidate,
          normalizedGameplaySha256: candidate.normalizedGameplayReference.sha256,
        })));
        if (resolved.kind === "exact-gameplay-alias") {
          votingLevels = await Promise.all(resolved.candidates.map((candidate) => materialFor(candidate)));
          for (const candidate of votingLevels) {
            if (canonicalizeJson(candidate.normalizedMap) !== canonicalizeJson(official.normalizedMap)) {
              throw new Error(`P7 exact gameplay alias maps disagree: ${manifestCase.occurrenceId}/${candidate.manifestCase.occurrenceId}`);
            }
          }
          votingRelationship = {
            kind: "exact-gameplay-alias",
            candidateOccurrenceIds: votingLevels.map(({ manifestCase: entry }) => entry.occurrenceId),
            officialMap: votingMapBinding(official),
            candidateMaps: votingLevels.map(votingMapBinding),
          };
        } else if (resolved.kind === "edited-relative") {
          const candidate = await materialFor(resolved.candidate);
          votingLevels = [candidate];
          votingMapDiff = buildBoundedCanonicalGameplayMapDiff({
            official: official.normalizedMap,
            candidate: candidate.normalizedMap,
            officialNormalizedGameplaySha256: manifestCase.normalizedGameplayReference.sha256,
            candidateNormalizedGameplaySha256: candidate.manifestCase.normalizedGameplayReference.sha256,
          });
          if (votingMapDiff.changedCellCount + votingMapDiff.otherDifferenceCount === 0) {
            throw new Error(`P7 edited voting relative has no canonical gameplay diff: ${manifestCase.occurrenceId}`);
          }
          votingRelationship = {
            kind: "edited-relative",
            candidateOccurrenceId: candidate.manifestCase.occurrenceId,
            normalizedTitle: resolved.normalizedTitle,
            officialMap: votingMapBinding(official),
            candidateMap: votingMapBinding(candidate),
            mapDiff: votingMapDiff,
          };
        } else {
          votingRelationship = {
            ...resolved,
            officialMap: votingMapBinding(official),
          };
        }
      }

      const targets = await Promise.all((["ms", "lynx"] as const).map(async (target) => {
        const candidates: P7TrainingDonorCandidate[] = [];
        const direct = await donorCandidate({
          executionLevel: official,
          sourceLevel: official,
          target,
          mapRelationship: "official-map",
          priority: 0,
          mapDiff: null,
          sha256,
        });
        if (direct !== null) candidates.push(direct);
        for (const candidateLevel of votingLevels) {
          const candidate = await donorCandidate({
            executionLevel: official,
            sourceLevel: candidateLevel,
            target,
            mapRelationship: votingRelationship?.kind === "exact-gameplay-alias"
              ? "exact-gameplay-alias"
              : "edited-relative",
            priority: votingRelationship?.kind === "exact-gameplay-alias" ? 1 : 2,
            mapDiff: votingMapDiff,
            sha256,
          });
          if (candidate !== null) candidates.push(candidate);
        }
        return {
          target,
          execution: executionSource(official, target),
          donorCandidates: candidates,
        } satisfies P7TrainingTargetInventory;
      }));
      levels.push({
        occurrenceId: manifestCase.occurrenceId,
        caseId: manifestCase.caseId,
        packId,
        levelNumber,
        title: manifestCase.title,
        author: manifestCase.author,
        manifestCase,
        validityOccurrence: official.validityOccurrence,
        eligibility: official.eligibility,
        source: official.source,
        targets: [targets[0], targets[1]],
        votingRelationship,
      });
    }
    const coverage = directCoverage(levels);
    assertDirectCoverage(packId, coverage);
    packs.push({
      packId,
      displayName: context.manifest.displayName,
      mapPath: context.spec.mapPath,
      levels,
      summary: { directCoverage: coverage },
    });
  }

  const cclp5 = packs[2]!;
  const cclp5VotingRelationships = {
    exactGameplayAlias: cclp5.levels.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "exact-gameplay-alias"
    )).length,
    editedRelative: cclp5.levels.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "edited-relative"
    )).length,
    none: cclp5.levels.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "none"
      && votingRelationship.reason === "no-normalized-title-candidate"
    )).length,
    ambiguous: cclp5.levels.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "none"
      && votingRelationship.reason === "ambiguous-normalized-title"
    )).length,
  } as const;
  const missingOfficial = cclp5.levels.filter(({ targets }) => targets.some(({ donorCandidates }) => (
    !donorCandidates.some(({ mapRelationship }) => mapRelationship === "official-map")
  )));
  const cclp5MissingOfficialLevels = {
    exactGameplayAlias: missingOfficial.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "exact-gameplay-alias"
    )).length,
    editedRelative: missingOfficial.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "edited-relative"
    )).length,
    none: missingOfficial.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "none"
      && votingRelationship.reason === "no-normalized-title-candidate"
    )).length,
    ambiguous: missingOfficial.filter(({ votingRelationship }) => (
      votingRelationship?.kind === "none"
      && votingRelationship.reason === "ambiguous-normalized-title"
    )).length,
  } as const;
  const missingTargets = missingOfficial.flatMap(({ targets }) => targets.filter(({ donorCandidates }) => (
    !donorCandidates.some(({ mapRelationship }) => mapRelationship === "official-map")
  )));
  const cclp5MissingOfficialTargets = {
    exactGameplayAlias: missingTargets.filter(({ donorCandidates }) => donorCandidates.some(({ mapRelationship }) => (
      mapRelationship === "exact-gameplay-alias"
    ))).length,
    editedRelative: missingTargets.filter(({ donorCandidates }) => donorCandidates.some(({ mapRelationship }) => (
      mapRelationship === "edited-relative"
    ))).length,
    uncovered: missingTargets.filter(({ donorCandidates }) => donorCandidates.length === 0).length,
  } as const;
  const summary = {
    packCount: 3,
    levelCount: packs.reduce<number>((sum, pack) => sum + pack.levels.length, 0),
    targetCount: packs.reduce<number>((sum, pack) => (
      sum + pack.levels.reduce<number>((levelSum, level) => levelSum + level.targets.length, 0)
    ), 0),
    verifiedInputFileCount: references.length,
    verifiedInputByteLength: references.reduce<number>((sum, input) => sum + input.byteLength, 0),
    officialDonorCandidateCount: packs.reduce<number>((sum, pack) => (
      sum + pack.levels.reduce<number>((levelSum, level) => (
        levelSum + level.targets.reduce<number>((targetSum, target) => (
          targetSum + target.donorCandidates.filter(({ mapRelationship }) => (
            mapRelationship === "official-map"
          )).length
        ), 0)
      ), 0)
    ), 0),
    votingDonorCandidateCount: cclp5.levels.reduce<number>((levelSum, level) => (
      levelSum + level.targets.reduce<number>((targetSum, target) => (
        targetSum + target.donorCandidates.filter(({ mapRelationship }) => (
          mapRelationship !== "official-map"
        )).length
      ), 0)
    ), 0),
    cclp5VotingRelationships,
    cclp5MissingOfficialLevels,
    cclp5MissingOfficialTargets,
  } as P7TrainingCorpusInventorySummary;
  assertInventorySummary(summary);

  return {
    corpusRevision: CCSOLVER_CORPUS_SOURCE_REVISION,
    verifiedInputs: references,
    packs: [packs[0]!, packs[1]!, packs[2]!],
    summary,
  };
}
