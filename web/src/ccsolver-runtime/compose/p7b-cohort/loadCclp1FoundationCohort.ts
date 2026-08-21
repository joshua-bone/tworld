import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  extractIndexedGroupedDatLevel,
  indexGroupedDatLevels,
} from "@content/api/series-file";
import {
  parseSolutionFile,
} from "@content/api/solutionFileFormat";
import type { ExpandedSolutionData } from "@content/api/solutionDataCodec";
import { parseSeriesConfig } from "@content/api/seriesConfig";
import {
  verifyDonorSetName,
  verifyPinnedSourceFile,
} from "../p1a-corpus/corpusManifest";
import { CCSOLVER_CORPUS_SOURCE_REVISION } from "../p1a-corpus/registry";
import { PINNED_SOURCE_FILES } from "../p1a-corpus/sourcePins";
import type {
  CorpusDonorReferenceV1,
  CorpusManifestV1,
  CorpusMapCaseV1,
  CorpusTarget,
  CorpusTargetRecordV1,
} from "../p1a-corpus/types";
import type {
  P1bCorpusOccurrenceV1,
  P1bCorpusValidityReportV1,
} from "../p1b-curriculum/corpusValidityReport";
import {
  assertTworldSolverSourceEligibility,
  type TworldSolverSourceEligibility,
} from "../sourceValidity/assertTworldSolverSourceEligibility";
import {
  CCLP1_FOUNDATION_COHORT,
  CCLP1_FOUNDATION_LIMITS,
  CCLP1_FOUNDATION_SOURCE_PATHS,
  type Cclp1FoundationSelection,
} from "./cclp1FoundationCohort";

const CORPUS_MANIFEST_PATH = "ccsolver/corpus/manifest.v1.json";
const VALIDITY_REPORT_PATH = "ccsolver/corpus/p1b-validity-report.v1.json";
const TEXT_DECODER = new TextDecoder();

export interface LoadedCclp1FoundationTarget {
  readonly target: CorpusTarget;
  /** Stable corpus candidate identity when sourced through the P7 inventory. */
  readonly donorId?: string;
  readonly seriesConfigPath: string;
  readonly seriesFile: string;
  readonly seriesConfigBytes?: Uint8Array;
  readonly donor: CorpusDonorReferenceV1;
  /** Detached exact TWS entry payload. It is never re-encoded by this loader. */
  readonly rawReplayBytes: Uint8Array;
  readonly expandedSolution: ExpandedSolutionData;
  readonly bestTimeTicks: number;
}

export interface LoadedCclp1FoundationLevel {
  readonly selection: Cclp1FoundationSelection;
  readonly manifestCase: CorpusMapCaseV1;
  readonly validityOccurrence: P1bCorpusOccurrenceV1;
  readonly eligibility: TworldSolverSourceEligibility;
  readonly source: {
    readonly mapPath: string;
    readonly containerBytes: Uint8Array;
    readonly levelData: Uint8Array;
    readonly layerData: readonly Uint8Array[];
  };
  readonly targets: readonly LoadedCclp1FoundationTarget[];
}

export interface LoadedCclp1FoundationCohort {
  readonly cohortId: "p7b-cclp1-foundation";
  readonly packId: "cclp1";
  readonly levels: readonly LoadedCclp1FoundationLevel[];
  readonly summary: {
    readonly levelCount: 12;
    readonly targetCount: 24;
    readonly rawReplayByteLength: 4_240;
    readonly donorTicks: 20_196;
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function digestHex(bytes: Uint8Array, sha256: Sha256Port): Promise<string> {
  return bytesToHex(await sha256.digestBytes(bytes));
}

interface CanonicalInput<T> {
  readonly value: T;
  readonly text: string;
}

async function readCanonicalJson<T>(repositoryRoot: string, path: string): Promise<CanonicalInput<T>> {
  const text = await readFile(resolve(repositoryRoot, path), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
    throw new Error(`checked P7B input is not canonical JSON: ${path}`);
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
    throw new Error("P7B requires the pinned corpus manifest v1 source revision");
  }
  if (
    validity.reportType !== "ccsolver-p1b-corpus-validity"
    || validity.reportVersion !== 1
    || validity.source.corpusRepository !== manifest.source.repository
    || validity.source.corpusRevision !== manifest.source.revision
  ) {
    throw new Error("P7B validity report is not bound to the pinned corpus manifest");
  }
  const manifestBytes = new TextEncoder().encode(manifestText);
  if (
    validity.source.corpusManifest.byteLength !== manifestBytes.byteLength
    || validity.source.corpusManifest.digest !== `sha256:${await digestHex(manifestBytes, sha256)}`
  ) {
    throw new Error("P7B validity report content binding to the corpus manifest drifted");
  }
}

function requireCclp1Pack(manifest: CorpusManifestV1) {
  const pack = manifest.packs.find(({ packId }) => packId === "cclp1");
  if (
    pack === undefined
    || pack.displayName !== "CCLP1"
    || pack.mapPath !== "data/CCLP1.dat"
    || pack.logicalMapCount !== 149
    || pack.targets[0].target !== "ms"
    || pack.targets[0].seriesConfigPath !== "sets/CCLP1-MS.dac"
    || pack.targets[0].donorPath !== "save/CCLP1.dac.tws"
    || pack.targets[0].donorSetName !== "public_CCLP1.dac"
    || pack.targets[1].target !== "lynx"
    || pack.targets[1].seriesConfigPath !== "sets/CCLP1-Lynx.dac"
    || pack.targets[1].donorPath !== "save/CCLP1-lynx.dac.tws"
    || pack.targets[1].donorSetName !== "public_CCLP1-lynx.dac"
  ) {
    throw new Error("P7B CCLP1 pack source configuration drifted");
  }
  return pack;
}

async function loadPinnedInputs(
  repositoryRoot: string,
  manifest: CorpusManifestV1,
  sha256: Sha256Port,
): Promise<Map<string, Uint8Array>> {
  const manifestSources = new Map(manifest.sources.map((source) => [source.path, source]));
  const loaded = new Map<string, Uint8Array>();
  await Promise.all(CCLP1_FOUNDATION_SOURCE_PATHS.map(async (path) => {
    const pin = PINNED_SOURCE_FILES[path];
    const checked = manifestSources.get(path);
    if (
      pin === undefined
      || checked === undefined
      || pin.byteLength !== checked.byteLength
      || pin.sha256 !== checked.sha256
    ) {
      throw new Error(`P7B source pin drifted: ${path}`);
    }
    const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, path)));
    await verifyPinnedSourceFile(path, bytes, pin, sha256);
    loaded.set(path, bytes);
  }));
  if (loaded.size !== CCLP1_FOUNDATION_LIMITS.sourceFileCount) {
    throw new Error("P7B source loader exceeded or missed its fixed five-file boundary");
  }
  return loaded;
}

function requireLoaded(loaded: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = loaded.get(path);
  if (bytes === undefined) throw new Error(`P7B pinned source was not loaded: ${path}`);
  return bytes;
}

function exactCase(
  manifest: CorpusManifestV1,
  selection: Cclp1FoundationSelection,
): CorpusMapCaseV1 {
  const matches = manifest.cases.filter(({ occurrenceId }) => occurrenceId === selection.occurrenceId);
  const entry = matches[0];
  if (
    matches.length !== 1
    || entry === undefined
    || entry.packId !== "cclp1"
    || entry.levelNumber !== selection.levelNumber
    || entry.title !== selection.title
    || entry.caseId !== selection.caseId
    || entry.normalizedGameplayReference.status !== "available"
    || entry.normalizedGameplayReference.profile !== "tworld-legacy-dat-gameplay-v1"
    || entry.normalizedGameplayReference.sha256 !== selection.normalizedGameplaySha256
    || entry.sourceMembers.length === 0
    || entry.sourceMembers.some(({ sourcePath }) => sourcePath !== "data/CCLP1.dat")
    || entry.targets[0].target !== "ms"
    || entry.targets[1].target !== "lynx"
    || entry.targets.some(({ donor }) => donor === null)
  ) {
    throw new Error(`P7B cohort case identity or donor coverage drifted: ${selection.occurrenceId}`);
  }
  return entry;
}

function exactValidity(
  report: P1bCorpusValidityReportV1,
  entry: CorpusMapCaseV1,
): P1bCorpusOccurrenceV1 {
  const matches = report.occurrences.filter(({ occurrenceId }) => occurrenceId === entry.occurrenceId);
  const occurrence = matches[0];
  if (
    matches.length !== 1
    || occurrence === undefined
    || occurrence.caseId !== entry.caseId
    || occurrence.packId !== "cclp1"
    || occurrence.levelNumber !== entry.levelNumber
    || occurrence.title !== entry.title
    || occurrence.normalizedGameplaySha256 !== entry.normalizedGameplayReference.sha256
    || occurrence.paired !== true
    || occurrence.validity.status !== "valid"
    || occurrence.validity.issueCount !== 0
    || occurrence.validity.invalidCellCount !== 0
  ) {
    throw new Error(`P7B cohort source is not exact, valid, and paired: ${entry.occurrenceId}`);
  }
  return occurrence;
}

function fileBase(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

async function loadTarget(
  targetRecord: CorpusTargetRecordV1,
  levelNumber: number,
  expectedPassword: string,
  loaded: ReadonlyMap<string, Uint8Array>,
  sha256: Sha256Port,
): Promise<LoadedCclp1FoundationTarget> {
  const donor = targetRecord.donor;
  const seriesConfigPath = targetRecord.seriesConfigPath;
  if (donor === null || seriesConfigPath === null) {
    throw new Error(`P7B CCLP1 target lacks a donor or series: ${targetRecord.target}/${levelNumber}`);
  }
  const donorBytes = requireLoaded(loaded, donor.sourcePath);
  const parsed = parseSolutionFile(donorBytes);
  const expectedRuleset = targetRecord.target === "ms" ? "MS" : "Lynx";
  const expectedSetName = targetRecord.target === "ms"
    ? "public_CCLP1.dac"
    : "public_CCLP1-lynx.dac";
  if (parsed.ruleset !== expectedRuleset) {
    throw new Error(`P7B donor ruleset drifted: ${donor.sourcePath}`);
  }
  verifyDonorSetName(donor.sourcePath, expectedSetName, parsed.setName);
  const donorEntry = parsed.entries[donor.entryOrdinal];
  if (
    donorEntry === undefined
    || donorEntry.levelNumber !== levelNumber
    || donorEntry.password !== expectedPassword
    || donorEntry.bestTimeTicks === null
    || donorEntry.solutionData === null
    || donorEntry.expandedSolution === null
    || donor.sourceLevelNumber !== levelNumber
    || donor.entryByteLength !== donorEntry.solutionData.byteLength
    || donor.entrySha256 !== await digestHex(donorEntry.solutionData, sha256)
    || donor.bestTimeTicks !== donorEntry.bestTimeTicks
    || donor.moveCount !== donorEntry.expandedSolution.moves.length
    || donor.flags !== donorEntry.expandedSolution.flags
    || donor.randomSlideDirection !== donorEntry.expandedSolution.randomSlideDirection
    || donor.stepping !== donorEntry.expandedSolution.stepping
    || donor.randomSeed !== donorEntry.expandedSolution.randomSeed
  ) {
    throw new Error(`P7B raw donor entry drifted: ${targetRecord.target}/${levelNumber}`);
  }
  const seriesConfigBytes = requireLoaded(loaded, seriesConfigPath);
  const series = parseSeriesConfig(TEXT_DECODER.decode(seriesConfigBytes));
  const seriesFile = fileBase(seriesConfigPath);
  if (
    series.mapFile !== "CCLP1.dat"
    || series.ruleset !== expectedRuleset
    || (seriesFile !== "CCLP1-MS.dac" && seriesFile !== "CCLP1-Lynx.dac")
  ) {
    throw new Error(`P7B target series configuration drifted: ${seriesConfigPath}`);
  }
  return {
    target: targetRecord.target,
    seriesConfigPath,
    seriesFile,
    seriesConfigBytes: new Uint8Array(seriesConfigBytes),
    donor,
    rawReplayBytes: new Uint8Array(donorEntry.solutionData),
    expandedSolution: structuredClone(donorEntry.expandedSolution),
    bestTimeTicks: donorEntry.bestTimeTicks,
  };
}

export async function loadCclp1FoundationCohort(
  repositoryRoot: string,
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<LoadedCclp1FoundationCohort> {
  const [manifestInput, validityInput] = await Promise.all([
    readCanonicalJson<CorpusManifestV1>(repositoryRoot, CORPUS_MANIFEST_PATH),
    readCanonicalJson<P1bCorpusValidityReportV1>(repositoryRoot, VALIDITY_REPORT_PATH),
  ]);
  const manifest = manifestInput.value;
  const validity = validityInput.value;
  await assertCheckedRoots(manifest, manifestInput.text, validity, sha256);
  const pack = requireCclp1Pack(manifest);
  const loaded = await loadPinnedInputs(repositoryRoot, manifest, sha256);
  const mapBytes = requireLoaded(loaded, pack.mapPath);
  const indexedLevels = new Map(indexGroupedDatLevels(mapBytes).levels.map((level) => [level.number, level]));

  const levels = await Promise.all(CCLP1_FOUNDATION_COHORT.map(async (selection) => {
    const manifestCase = exactCase(manifest, selection);
    const validityOccurrence = exactValidity(validity, manifestCase);
    const indexed = indexedLevels.get(selection.levelNumber);
    if (indexed === undefined) {
      throw new Error(`P7B real level is absent from data/CCLP1.dat: ${selection.occurrenceId}`);
    }
    const extracted = extractIndexedGroupedDatLevel(mapBytes, indexed);
    const layerData = extracted.layerData.map((bytes) => new Uint8Array(bytes));
    const eligibility = assertTworldSolverSourceEligibility({ layerData });
    const password = manifestCase.targets[0].donor!.password;
    if (manifestCase.targets[1].donor!.password !== password) {
      throw new Error(`P7B paired donor passwords disagree: ${selection.occurrenceId}`);
    }
    const targets = await Promise.all([
      loadTarget(manifestCase.targets[0], selection.levelNumber, password, loaded, sha256),
      loadTarget(manifestCase.targets[1], selection.levelNumber, password, loaded, sha256),
    ]);
    return {
      selection,
      manifestCase,
      validityOccurrence,
      eligibility,
      source: {
        mapPath: "data/CCLP1.dat" as const,
        containerBytes: new Uint8Array(mapBytes),
        levelData: new Uint8Array(extracted.levelData),
        layerData,
      },
      targets: [targets[0], targets[1]] as const,
    } satisfies LoadedCclp1FoundationLevel;
  }));

  const rawReplayByteLength = levels.reduce((sum, level) => (
    sum + level.targets.reduce((targetSum, target) => targetSum + target.rawReplayBytes.byteLength, 0)
  ), 0);
  const donorTicks = levels.reduce((sum, level) => (
    sum + level.targets.reduce((targetSum, target) => targetSum + target.bestTimeTicks, 0)
  ), 0);
  if (
    levels.length !== CCLP1_FOUNDATION_LIMITS.levelCount
    || levels.reduce((sum, level) => sum + level.targets.length, 0)
      !== CCLP1_FOUNDATION_LIMITS.targetCount
    || rawReplayByteLength !== CCLP1_FOUNDATION_LIMITS.maximumSelectedReplayBytes
    || donorTicks !== CCLP1_FOUNDATION_LIMITS.maximumDonorTicks
  ) {
    throw new Error("P7B loaded cohort exceeded or drifted from its fixed processing budget");
  }
  return {
    cohortId: "p7b-cclp1-foundation",
    packId: "cclp1",
    levels,
    summary: {
      levelCount: CCLP1_FOUNDATION_LIMITS.levelCount,
      targetCount: CCLP1_FOUNDATION_LIMITS.targetCount,
      rawReplayByteLength: CCLP1_FOUNDATION_LIMITS.maximumSelectedReplayBytes,
      donorTicks: CCLP1_FOUNDATION_LIMITS.maximumDonorTicks,
    },
  };
}
