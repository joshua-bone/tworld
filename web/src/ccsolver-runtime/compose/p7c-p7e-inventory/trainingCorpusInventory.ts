import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { ExpandedSolutionData } from "@content/api/solutionDataCodec";
import type { SeriesLevel } from "@content/api/series";
import type { GameRequest } from "@game-core/api/types";
import type {
  CorpusDonorReferenceV1,
  CorpusMapCaseV1,
  CorpusSourceMemberReferenceV1,
  CorpusTarget,
} from "../p1a-corpus/types";
import type { P1bCorpusOccurrenceV1 } from "../p1b-curriculum/corpusValidityReport";
import type { TworldSolverSourceEligibility } from "../sourceValidity/assertTworldSolverSourceEligibility";

export const P7_TRAINING_MAP_DIFF_LIMITS = Object.freeze({
  maximumCellRecords: 256,
  maximumOtherRecords: 256,
  maximumComparedCells: 65_536,
  maximumComparedOtherNodes: 1_000_000,
});

export const P7_TRAINING_INVENTORY_LIMITS = Object.freeze({
  packCount: 3,
  levelsPerPack: 149,
  levelCount: 447,
  targetCount: 894,
  inputFileCount: 185,
  inputByteLength: 7_028_144,
  maximumMapDiffCellRecords: P7_TRAINING_MAP_DIFF_LIMITS.maximumCellRecords,
  maximumMapDiffOtherRecords: P7_TRAINING_MAP_DIFF_LIMITS.maximumOtherRecords,
});

export type P7TrainingPackId = "cclp1" | "cclp4" | "cclp5";
export type P7TrainingMapRelationship =
  | "official-map"
  | "exact-gameplay-alias"
  | "edited-relative";

export interface P7VotingMapIdentity {
  readonly occurrenceId: string;
  readonly title: string;
  readonly normalizedGameplaySha256: string;
}

export type P7ResolvedVotingMapRelationship<T extends P7VotingMapIdentity = P7VotingMapIdentity> =
  | {
      readonly kind: "exact-gameplay-alias";
      readonly candidates: readonly T[];
    }
  | {
      readonly kind: "edited-relative";
      readonly candidate: T;
      readonly normalizedTitle: string;
    }
  | {
      readonly kind: "none";
      readonly reason: "no-normalized-title-candidate" | "ambiguous-normalized-title";
      readonly normalizedTitle: string;
      readonly ambiguousOccurrenceIds: readonly string[];
    };

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeVotingLevelTitle(title: string): string {
  return title.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}

export function resolveVotingMapRelationship<T extends P7VotingMapIdentity>(
  official: P7VotingMapIdentity,
  votingCandidates: readonly T[],
): P7ResolvedVotingMapRelationship<T> {
  const exact = votingCandidates
    .filter(({ normalizedGameplaySha256 }) => (
      normalizedGameplaySha256 === official.normalizedGameplaySha256
    ))
    .sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
  if (exact.length > 0) {
    return { kind: "exact-gameplay-alias", candidates: exact };
  }

  const normalizedTitle = normalizeVotingLevelTitle(official.title);
  const titleMatches = votingCandidates
    .filter((candidate) => normalizeVotingLevelTitle(candidate.title) === normalizedTitle)
    .sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
  if (titleMatches.length === 1) {
    return {
      kind: "edited-relative",
      candidate: titleMatches[0]!,
      normalizedTitle,
    };
  }
  return {
    kind: "none",
    reason: titleMatches.length === 0
      ? "no-normalized-title-candidate"
      : "ambiguous-normalized-title",
    normalizedTitle,
    ambiguousOccurrenceIds: titleMatches.map(({ occurrenceId }) => occurrenceId),
  };
}

export interface P7CanonicalGameplayCellChange {
  readonly layerIndex: number;
  readonly z: number;
  readonly cellOrdinal: number;
  readonly x: number;
  readonly y: number;
  readonly official: CanonicalJsonValue | null;
  readonly candidate: CanonicalJsonValue | null;
}

export type P7CanonicalValuePresence =
  | { readonly present: false }
  | { readonly present: true; readonly value: CanonicalJsonValue };

export interface P7CanonicalGameplayOtherChange {
  readonly path: string;
  readonly official: P7CanonicalValuePresence;
  readonly candidate: P7CanonicalValuePresence;
}

export interface P7CanonicalGameplayMapDiff {
  readonly algorithm: "canonical-gameplay-layers-cells-diff-v1";
  readonly officialNormalizedGameplaySha256: string;
  readonly candidateNormalizedGameplaySha256: string;
  readonly maximumComparedCells: number;
  readonly maximumComparedOtherNodes: number;
  readonly changedCellCount: number;
  readonly cellChanges: readonly P7CanonicalGameplayCellChange[];
  readonly cellRecordsTruncated: boolean;
  readonly otherDifferenceCount: number;
  readonly otherChanges: readonly P7CanonicalGameplayOtherChange[];
  readonly otherRecordsTruncated: boolean;
}

interface CanonicalGameplayMapShape {
  readonly geometry: {
    readonly width: number;
    readonly height: number;
  };
  readonly layers: readonly {
    readonly z: number;
    readonly cells: readonly CanonicalJsonValue[];
    readonly [key: string]: CanonicalJsonValue;
  }[];
  readonly [key: string]: CanonicalJsonValue;
}

function gameplayMapShape(
  value: CanonicalJsonValue,
  label: string,
): CanonicalGameplayMapShape {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a canonical gameplay-map object`);
  }
  const record = value as { readonly [key: string]: CanonicalJsonValue };
  const geometry = record.geometry;
  const layers = record.layers;
  if (
    record.format !== "ccsolver-normalized-gameplay-map"
    || record.formatVersion !== 1
    || geometry === null
    || typeof geometry !== "object"
    || Array.isArray(geometry)
    || !Number.isSafeInteger((geometry as { readonly [key: string]: CanonicalJsonValue }).width)
    || !Number.isSafeInteger((geometry as { readonly [key: string]: CanonicalJsonValue }).height)
    || !Array.isArray(layers)
  ) {
    throw new Error(`${label} has an unsupported canonical gameplay-map shape`);
  }
  for (const [index, layer] of layers.entries()) {
    if (
      layer === null
      || typeof layer !== "object"
      || Array.isArray(layer)
      || !Number.isSafeInteger(layer.z)
      || !Array.isArray(layer.cells)
    ) {
      throw new Error(`${label} layer ${index} has an unsupported canonical shape`);
    }
  }
  return record as CanonicalGameplayMapShape;
}

function canonicalEqual(left: CanonicalJsonValue, right: CanonicalJsonValue): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function withoutGameplayCells(map: CanonicalGameplayMapShape): CanonicalJsonValue {
  return {
    ...map,
    layers: map.layers.map((layer) => Object.fromEntries(
      Object.entries(layer).filter(([key]) => key !== "cells"),
    ) as { readonly [key: string]: CanonicalJsonValue }),
  };
}

function escapedPointerToken(token: string | number): string {
  return String(token).replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPath(path: string, token: string | number): string {
  return `${path}/${escapedPointerToken(token)}`;
}

function isCanonicalObject(
  value: CanonicalJsonValue,
): value is { readonly [key: string]: CanonicalJsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneCanonical(value: CanonicalJsonValue): CanonicalJsonValue {
  return structuredClone(value);
}

function canonicalPresence(
  value: CanonicalJsonValue | undefined,
): P7CanonicalValuePresence {
  return value === undefined
    ? { present: false }
    : { present: true, value: cloneCanonical(value) };
}

function boundedCanonicalDifferences(input: {
  readonly official: CanonicalJsonValue;
  readonly candidate: CanonicalJsonValue;
  readonly maximumRecords: number;
  readonly maximumComparedNodes: number;
}): { readonly count: number; readonly records: readonly P7CanonicalGameplayOtherChange[] } {
  let comparedNodes = 0;
  let count = 0;
  const records: P7CanonicalGameplayOtherChange[] = [];

  const visit = (
    official: CanonicalJsonValue | undefined,
    candidate: CanonicalJsonValue | undefined,
    path: string,
  ): void => {
    comparedNodes += 1;
    if (comparedNodes > input.maximumComparedNodes) {
      throw new Error(`canonical gameplay diff exceeds ${input.maximumComparedNodes} compared nodes`);
    }
    if (official !== undefined && candidate !== undefined && canonicalEqual(official, candidate)) {
      return;
    }
    if (Array.isArray(official) && Array.isArray(candidate)) {
      const length = Math.max(official.length, candidate.length);
      for (let index = 0; index < length; index += 1) {
        visit(official[index], candidate[index], childPath(path, index));
      }
      return;
    }
    if (
      official !== undefined
      && candidate !== undefined
      && isCanonicalObject(official)
      && isCanonicalObject(candidate)
    ) {
      const keys = [...new Set([...Object.keys(official), ...Object.keys(candidate)])]
        .sort(compareText);
      for (const key of keys) {
        visit(official[key], candidate[key], childPath(path, key));
      }
      return;
    }
    count += 1;
    if (records.length < input.maximumRecords) {
      records.push({
        path,
        official: canonicalPresence(official),
        candidate: canonicalPresence(candidate),
      });
    }
  };

  visit(input.official, input.candidate, "");
  return { count, records };
}

function boundedRecordLimit(value: number | undefined, maximum: number, label: string): number {
  const resolved = value ?? maximum;
  if (!Number.isSafeInteger(resolved) || resolved < 0 || resolved > maximum) {
    throw new Error(`${label} must be a safe integer from zero through ${maximum}`);
  }
  return resolved;
}

export function buildBoundedCanonicalGameplayMapDiff(input: {
  readonly official: CanonicalJsonValue;
  readonly candidate: CanonicalJsonValue;
  readonly officialNormalizedGameplaySha256: string;
  readonly candidateNormalizedGameplaySha256: string;
  readonly maximumCellRecords?: number;
  readonly maximumOtherRecords?: number;
}): P7CanonicalGameplayMapDiff {
  const official = gameplayMapShape(input.official, "official map");
  const candidate = gameplayMapShape(input.candidate, "candidate map");
  const maximumCellRecords = boundedRecordLimit(
    input.maximumCellRecords,
    P7_TRAINING_MAP_DIFF_LIMITS.maximumCellRecords,
    "maximum gameplay cell diff records",
  );
  const maximumOtherRecords = boundedRecordLimit(
    input.maximumOtherRecords,
    P7_TRAINING_MAP_DIFF_LIMITS.maximumOtherRecords,
    "maximum other gameplay diff records",
  );
  const layerCount = Math.max(official.layers.length, candidate.layers.length);
  let comparedCells = 0;
  let changedCellCount = 0;
  const cellChanges: P7CanonicalGameplayCellChange[] = [];
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const officialLayer = official.layers[layerIndex];
    const candidateLayer = candidate.layers[layerIndex];
    const cellCount = Math.max(
      officialLayer?.cells.length ?? 0,
      candidateLayer?.cells.length ?? 0,
    );
    for (let cellOrdinal = 0; cellOrdinal < cellCount; cellOrdinal += 1) {
      comparedCells += 1;
      if (comparedCells > P7_TRAINING_MAP_DIFF_LIMITS.maximumComparedCells) {
        throw new Error(
          `canonical gameplay diff exceeds ${P7_TRAINING_MAP_DIFF_LIMITS.maximumComparedCells} compared cells`,
        );
      }
      const officialCell = officialLayer?.cells[cellOrdinal];
      const candidateCell = candidateLayer?.cells[cellOrdinal];
      if (
        officialCell !== undefined
        && candidateCell !== undefined
        && canonicalEqual(officialCell, candidateCell)
      ) {
        continue;
      }
      changedCellCount += 1;
      if (cellChanges.length < maximumCellRecords) {
        const width = official.geometry.width || candidate.geometry.width;
        cellChanges.push({
          layerIndex,
          z: officialLayer?.z ?? candidateLayer?.z ?? layerIndex,
          cellOrdinal,
          x: cellOrdinal % width,
          y: Math.floor(cellOrdinal / width),
          official: officialCell === undefined ? null : cloneCanonical(officialCell),
          candidate: candidateCell === undefined ? null : cloneCanonical(candidateCell),
        });
      }
    }
  }

  const other = boundedCanonicalDifferences({
    official: withoutGameplayCells(official),
    candidate: withoutGameplayCells(candidate),
    maximumRecords: maximumOtherRecords,
    maximumComparedNodes: P7_TRAINING_MAP_DIFF_LIMITS.maximumComparedOtherNodes,
  });
  return {
    algorithm: "canonical-gameplay-layers-cells-diff-v1",
    officialNormalizedGameplaySha256: input.officialNormalizedGameplaySha256,
    candidateNormalizedGameplaySha256: input.candidateNormalizedGameplaySha256,
    maximumComparedCells: P7_TRAINING_MAP_DIFF_LIMITS.maximumComparedCells,
    maximumComparedOtherNodes: P7_TRAINING_MAP_DIFF_LIMITS.maximumComparedOtherNodes,
    changedCellCount,
    cellChanges,
    cellRecordsTruncated: cellChanges.length < changedCellCount,
    otherDifferenceCount: other.count,
    otherChanges: other.records,
    otherRecordsTruncated: other.records.length < other.count,
  };
}

export interface P7DetachedReplay {
  readonly content: BlobReferenceV1;
  readonly bestTimeTicks: number;
  readonly moveCount: number;
  readonly flags: number;
  readonly randomSlideDirection: number;
  readonly stepping: number;
  readonly randomSeed: number;
}

interface DetachedReplayStorage {
  readonly bytes: Uint8Array;
  readonly expandedSolution: ExpandedSolutionData;
}

const detachedReplayStorage = new WeakMap<P7DetachedReplay, DetachedReplayStorage>();

export function detachCheckedReplay(input: {
  readonly donor: CorpusDonorReferenceV1;
  readonly bytes: Uint8Array;
  readonly expandedSolution: ExpandedSolutionData;
}): P7DetachedReplay {
  const replay = Object.freeze({
    content: Object.freeze({
      digest: `sha256:${input.donor.entrySha256}` as const,
      byteLength: input.donor.entryByteLength,
    }),
    bestTimeTicks: input.donor.bestTimeTicks,
    moveCount: input.donor.moveCount,
    flags: input.donor.flags,
    randomSlideDirection: input.donor.randomSlideDirection,
    stepping: input.donor.stepping,
    randomSeed: input.donor.randomSeed,
  });
  detachedReplayStorage.set(replay, {
    bytes: new Uint8Array(input.bytes),
    expandedSolution: structuredClone(input.expandedSolution),
  });
  return replay;
}

function replayStorage(replay: P7DetachedReplay): DetachedReplayStorage {
  const stored = detachedReplayStorage.get(replay);
  if (stored === undefined) throw new Error("detached replay was not created by the checked inventory");
  return stored;
}

export function materializeDetachedReplayBytes(replay: P7DetachedReplay): Uint8Array {
  return new Uint8Array(replayStorage(replay).bytes);
}

export function materializeDetachedReplaySolution(
  replay: P7DetachedReplay,
): ExpandedSolutionData {
  return structuredClone(replayStorage(replay).expandedSolution);
}

export interface P7DetachedLevelSource {
  readonly containerContent: BlobReferenceV1;
  readonly mapPath: string;
  readonly levelNumber: number;
  readonly sourceMembers: readonly CorpusSourceMemberReferenceV1[];
  readonly normalizedGameplaySha256: string;
}

interface DetachedLevelSourceStorage {
  readonly containerBytes: Uint8Array;
  readonly levelData: Uint8Array;
  readonly layerData: readonly Uint8Array[];
}

const detachedContainerCopies = new WeakMap<Uint8Array, Uint8Array>();
const detachedLevelSourceStorage = new WeakMap<P7DetachedLevelSource, DetachedLevelSourceStorage>();

export function detachCheckedLevelSource(input: {
  readonly containerBytes: Uint8Array;
  readonly containerContent: BlobReferenceV1;
  readonly mapPath: string;
  readonly levelNumber: number;
  readonly levelData: Uint8Array;
  readonly layerData: readonly Uint8Array[];
  readonly sourceMembers: readonly CorpusSourceMemberReferenceV1[];
  readonly normalizedGameplaySha256: string;
}): P7DetachedLevelSource {
  let protectedContainer = detachedContainerCopies.get(input.containerBytes);
  if (protectedContainer === undefined) {
    protectedContainer = new Uint8Array(input.containerBytes);
    detachedContainerCopies.set(input.containerBytes, protectedContainer);
  }
  const source = Object.freeze({
    containerContent: Object.freeze({ ...input.containerContent }),
    mapPath: input.mapPath,
    levelNumber: input.levelNumber,
    sourceMembers: Object.freeze(structuredClone(input.sourceMembers)),
    normalizedGameplaySha256: input.normalizedGameplaySha256,
  });
  detachedLevelSourceStorage.set(source, {
    containerBytes: protectedContainer,
    levelData: new Uint8Array(input.levelData),
    layerData: input.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  return source;
}

export function materializeDetachedLevelSource(source: P7DetachedLevelSource): {
  readonly containerBytes: Uint8Array;
  readonly levelData: Uint8Array;
  readonly layerData: readonly Uint8Array[];
} {
  const stored = detachedLevelSourceStorage.get(source);
  if (stored === undefined) throw new Error("detached level source was not created by the checked inventory");
  return {
    containerBytes: new Uint8Array(stored.containerBytes),
    levelData: new Uint8Array(stored.levelData),
    layerData: stored.layerData.map((bytes) => new Uint8Array(bytes)),
  };
}

export interface P7TrainingVerifiedInput {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface P7TrainingExecutionSource {
  readonly packId: P7TrainingPackId;
  readonly occurrenceId: string;
  readonly levelNumber: number;
  readonly mapPath: string;
  readonly mapContent: BlobReferenceV1;
  readonly seriesConfigPath: string;
  readonly seriesConfigContent: BlobReferenceV1;
  readonly ruleset: "MS" | "Lynx";
  readonly request: GameRequest;
  readonly display: {
    readonly seriesName: string;
    readonly mapFilename: string;
    readonly level: SeriesLevel;
  };
}

export interface P7TrainingDonorSource {
  readonly origin: "official-pack" | "voting-pack";
  readonly packId: string;
  readonly occurrenceId: string;
  readonly levelNumber: number;
  readonly mapPath: string;
  readonly mapContent: BlobReferenceV1;
  readonly normalizedGameplaySha256: string;
  readonly sourceMembers: readonly CorpusSourceMemberReferenceV1[];
  readonly validityOccurrence: P1bCorpusOccurrenceV1;
  readonly eligibility: TworldSolverSourceEligibility;
  readonly seriesConfigPath: string;
  readonly seriesConfigContent: BlobReferenceV1;
  readonly replaySourcePath: string;
  readonly replayFileContent: BlobReferenceV1;
  readonly replayEntryOrdinal: number;
}

export interface P7TrainingVotingMapBinding {
  readonly occurrenceId: string;
  readonly caseId: string;
  readonly mapPath: string;
  readonly levelNumber: number;
  readonly normalizedGameplaySha256: string;
  readonly sourceMembers: readonly CorpusSourceMemberReferenceV1[];
  readonly validityOccurrence: P1bCorpusOccurrenceV1;
  readonly eligibility: TworldSolverSourceEligibility;
}

export interface P7TrainingDonorCandidate {
  readonly candidateId: string;
  readonly priority: 0 | 1 | 2;
  readonly target: CorpusTarget;
  readonly mapRelationship: P7TrainingMapRelationship;
  readonly execution: P7TrainingExecutionSource;
  readonly source: P7TrainingDonorSource;
  readonly donorReference: CorpusDonorReferenceV1;
  readonly replay: P7DetachedReplay;
  readonly mapDiff: P7CanonicalGameplayMapDiff | null;
}

export type P7TrainingVotingRelationship =
  | {
      readonly kind: "exact-gameplay-alias";
      readonly candidateOccurrenceIds: readonly string[];
      readonly officialMap: P7TrainingVotingMapBinding;
      readonly candidateMaps: readonly P7TrainingVotingMapBinding[];
    }
  | {
      readonly kind: "edited-relative";
      readonly candidateOccurrenceId: string;
      readonly normalizedTitle: string;
      readonly officialMap: P7TrainingVotingMapBinding;
      readonly candidateMap: P7TrainingVotingMapBinding;
      readonly mapDiff: P7CanonicalGameplayMapDiff;
    }
  | (Extract<P7ResolvedVotingMapRelationship, { readonly kind: "none" }> & {
      readonly officialMap: P7TrainingVotingMapBinding;
    });

export interface P7TrainingTargetInventory {
  readonly target: CorpusTarget;
  readonly execution: P7TrainingExecutionSource;
  readonly donorCandidates: readonly P7TrainingDonorCandidate[];
}

export interface P7TrainingLevelInventory {
  readonly occurrenceId: string;
  readonly caseId: string;
  readonly packId: P7TrainingPackId;
  readonly levelNumber: number;
  readonly title: string;
  readonly author: string;
  readonly manifestCase: CorpusMapCaseV1;
  readonly validityOccurrence: P1bCorpusOccurrenceV1;
  readonly eligibility: TworldSolverSourceEligibility;
  readonly source: P7DetachedLevelSource;
  readonly targets: readonly [P7TrainingTargetInventory, P7TrainingTargetInventory];
  readonly votingRelationship: P7TrainingVotingRelationship | null;
}

export interface P7TrainingDirectCoverageSummary {
  readonly paired: number;
  readonly msOnly: number;
  readonly lynxOnly: number;
  readonly none: number;
  readonly donorTargets: number;
}

export interface P7TrainingPackInventory {
  readonly packId: P7TrainingPackId;
  readonly displayName: string;
  readonly mapPath: string;
  readonly levels: readonly P7TrainingLevelInventory[];
  readonly summary: {
    readonly directCoverage: P7TrainingDirectCoverageSummary;
  };
}

export interface P7TrainingCorpusInventorySummary {
  readonly packCount: 3;
  readonly levelCount: 447;
  readonly targetCount: 894;
  readonly verifiedInputFileCount: 185;
  readonly verifiedInputByteLength: 7_028_144;
  readonly officialDonorCandidateCount: 827;
  readonly votingDonorCandidateCount: 294;
  readonly cclp5VotingRelationships: {
    readonly exactGameplayAlias: 82;
    readonly editedRelative: 65;
    readonly none: 2;
    readonly ambiguous: 0;
  };
  readonly cclp5MissingOfficialLevels: {
    readonly exactGameplayAlias: 14;
    readonly editedRelative: 19;
    readonly none: 1;
    readonly ambiguous: 0;
  };
  readonly cclp5MissingOfficialTargets: {
    readonly exactGameplayAlias: 28;
    readonly editedRelative: 37;
    readonly uncovered: 2;
  };
}

export interface P7TrainingPackInventoryClosure {
  readonly corpusRevision: string;
  readonly verifiedInputs: readonly P7TrainingVerifiedInput[];
  readonly packs: readonly P7TrainingPackInventory[];
}

export interface P7TrainingCorpusInventory extends P7TrainingPackInventoryClosure {
  readonly packs: readonly [
    P7TrainingPackInventory,
    P7TrainingPackInventory,
    P7TrainingPackInventory,
  ];
  readonly summary: P7TrainingCorpusInventorySummary;
}
