import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { SeriesLevel } from "@content/api/series";
import type { GameRequest } from "@game-core/api/types";
import {
  buildP7bTrainingReplayLevel,
  type P7bTrainingReplayLevelV1,
} from "../p7b-training/trainingReplayContract";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
  parseP7bPortableDecisionTrace,
} from "../p7b-training/portableReplayProfile";
import { loadCheckedTrainingCorpusInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import type {
  P7TrainingLevelInventory,
  P7TrainingPackId,
  P7TrainingPackInventoryClosure,
  P7TrainingPackInventory,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import type {
  P7TrainingBrowserReplayInputV1,
} from "./p7TrainingBrowserReplay";
import {
  P7_TRAINING_MAX_BROWSER_INPUTS,
  canonicalizeP7TrainingBrowserReplay,
  parseP7TrainingBrowserReplay,
} from "./p7TrainingBrowserReplay";
import {
  P7GeneratedEvidenceStore,
  type P7GeneratedEvidenceBundleV1,
} from "./p7GeneratedEvidenceStore";
import {
  buildP7GeneratedEvidenceSidecar,
  canonicalizeP7GeneratedEvidenceSidecarIndex,
  materializeP7GeneratedEvidenceSidecar,
  parseP7GeneratedEvidenceSidecarIndex,
  type P7GeneratedEvidenceSidecarIndexV1,
  type P7GeneratedEvidenceSidecarV1,
} from "./p7GeneratedEvidenceSidecar";

export const P7_TRAINING_SHARD_COUNT = 8 as const;
export const P7_TRAINING_LEVELS_PER_PACK = 149 as const;
export const P7_TRAINING_PARTITION_IDENTITY =
  "official-level-number-contiguous-balanced-remainder-first-v1" as const;
export const P7_TRAINING_PROCESSOR_REVISION =
  "p7-training-direct-native-portable-v2" as const;
export const P7_TRAINING_SHARD_REQUEST_ARTIFACT =
  "ccsolver-p7-training-shard-request" as const;
export const P7_TRAINING_SHARD_RESULT_ARTIFACT =
  "ccsolver-p7-training-shard-result" as const;
export const P7_TRAINING_SHARD_LIMITS = Object.freeze({
  maximumRequestBytes: 128 * 1024,
  maximumResultBytes: 32 * 1024 * 1024,
  maximumLevelResultBytes: 4 * 1024 * 1024,
  maximumBrowserReplayCountPerLevel: 4,
  maximumPortableTraceCountPerLevel: 1,
  maximumEvidenceBlobCountPerLevel: 2_048,
  maximumEvidenceBlobBytes: 2 * 1024 * 1024,
  maximumEvidenceBytesPerLevel: 8 * 1024 * 1024,
});

export interface P7TrainingShardOccurrenceIdentityV1 {
  readonly caseId: string;
  readonly levelNumber: number;
  readonly normalizedGameplaySha256: string;
  readonly occurrenceId: string;
  readonly sourceContainerContent: BlobReferenceV1;
  readonly sourceLevelContent: BlobReferenceV1;
  readonly title: string;
}

export interface P7TrainingShardPartitionV1 {
  readonly identity: typeof P7_TRAINING_PARTITION_IDENTITY;
  readonly shardCount: typeof P7_TRAINING_SHARD_COUNT;
  readonly shardIndex: number;
  readonly startLevelNumber: number;
  readonly endLevelNumber: number;
}

export interface P7TrainingShardRequestV1 {
  readonly artifact: typeof P7_TRAINING_SHARD_REQUEST_ARTIFACT;
  readonly version: 1;
  readonly processorRevision: typeof P7_TRAINING_PROCESSOR_REVISION;
  readonly inventory: {
    readonly corpusRevision: string;
    readonly packId: P7TrainingPackId;
    readonly packContent: BlobReferenceV1;
  };
  readonly partition: P7TrainingShardPartitionV1;
  readonly occurrences: readonly P7TrainingShardOccurrenceIdentityV1[];
}

export interface P7TrainingCanonicalArtifact<T> {
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
  readonly value: T;
}

export interface P7TrainingShardRequestArtifact
  extends Omit<P7TrainingCanonicalArtifact<P7TrainingShardRequestV1>, "value"> {
  readonly request: P7TrainingShardRequestV1;
}

export interface P7TrainingShardPlan {
  readonly packId: P7TrainingPackId;
  readonly packContent: BlobReferenceV1;
  readonly requests: readonly P7TrainingShardRequestArtifact[];
}

export interface P7TrainingBrowserTargetV1 {
  readonly request: GameRequest;
  readonly display: {
    readonly seriesName: string;
    readonly mapFilename: string;
    readonly level: SeriesLevel;
  };
}

export interface P7TrainingPortableDecisionTraceAssetV1 {
  readonly content: BlobReferenceV1;
  readonly canonicalJson: CanonicalJson;
}

export interface P7TrainingLevelProcessOutputV1 {
  /** Closed terminal classification; expected engine failures remain data. */
  readonly status:
    | "complete"
    | "ineligible"
    | "missing-donor"
    | "no-certified-replay";
  readonly detail: string;
  readonly trainingReplayLevel: P7bTrainingReplayLevelV1;
  readonly browserTargets: Readonly<Record<"ms" | "lynx", P7TrainingBrowserTargetV1>>;
  readonly browserReplays: readonly P7TrainingBrowserReplayInputV1[];
  readonly portableDecisionTraces: readonly P7TrainingPortableDecisionTraceAssetV1[];
  readonly generatedEvidence: P7GeneratedEvidenceBundleV1;
}

export interface P7TrainingShardBrowserReplayAssetV1 {
  readonly variantId: P7TrainingBrowserReplayInputV1["variantId"];
  readonly target: P7TrainingBrowserReplayInputV1["target"];
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
  readonly parity: P7TrainingBrowserReplayInputV1["parity"];
}

export interface P7TrainingShardLevelProcessingV1
  extends Omit<P7TrainingLevelProcessOutputV1, "browserReplays" | "generatedEvidence"> {
  readonly browserReplays: readonly P7TrainingShardBrowserReplayAssetV1[];
  readonly evidence: {
    readonly index: P7GeneratedEvidenceSidecarIndexV1;
    readonly indexContent: BlobReferenceV1;
  };
}

export interface P7TrainingShardLevelResultV1 {
  readonly occurrenceId: string;
  readonly caseId: string;
  readonly levelNumber: number;
  readonly processing: P7TrainingShardLevelProcessingV1;
}

export interface P7TrainingShardResultV1 {
  readonly artifact: typeof P7_TRAINING_SHARD_RESULT_ARTIFACT;
  readonly version: 1;
  readonly processorRevision: typeof P7_TRAINING_PROCESSOR_REVISION;
  readonly inventory: P7TrainingShardRequestV1["inventory"];
  readonly requestContent: BlobReferenceV1;
  readonly partition: P7TrainingShardPartitionV1;
  readonly levels: readonly P7TrainingShardLevelResultV1[];
}

export interface P7TrainingShardResultArtifact
  extends Omit<P7TrainingCanonicalArtifact<P7TrainingShardResultV1>, "value"> {
  readonly result: P7TrainingShardResultV1;
}

export interface P7TrainingReducedPack {
  readonly packId: P7TrainingPackId;
  readonly packContent: BlobReferenceV1;
  readonly levels: readonly P7TrainingShardLevelResultV1[];
}

export type P7TrainingPersistEvidence = (input: {
  readonly occurrenceId: string;
  readonly sidecar: P7GeneratedEvidenceSidecarV1;
}) => Promise<void>;

export type P7TrainingVerifyPersistedEvidence = (input: {
  readonly occurrenceId: string;
  readonly index: P7GeneratedEvidenceSidecarIndexV1;
  readonly indexContent: BlobReferenceV1;
  readonly sha256: Sha256Port;
}) => Promise<{
  readonly indexCanonicalJson: CanonicalJson;
  readonly payload: Uint8Array;
}>;

export type P7TrainingInventoryLoader = (
  repositoryRoot: string,
  sha256: Sha256Port,
) => Promise<P7TrainingPackInventoryClosure>;

export type P7TrainingLevelProcessor = (
  row: P7TrainingLevelInventory,
  sha256: Sha256Port,
) => Promise<P7TrainingLevelProcessOutputV1>;

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function sourceMemberContent(input: {
  readonly occurrenceId: string;
  readonly levelNumber: number;
  readonly mapPath: string;
  readonly sourceMembers: P7TrainingLevelInventory["source"]["sourceMembers"];
}): BlobReferenceV1 {
  const member = input.sourceMembers.find(({ ordinal }) => ordinal === 0);
  if (
    member === undefined
    || member.sourcePath !== input.mapPath
    || member.sourceLevelNumber !== input.levelNumber
  ) throw new Error(`${input.occurrenceId} has no exact ordinal-zero level member`);
  return { digest: `sha256:${member.sha256}`, byteLength: member.byteLength };
}

export function buildP7TrainingMapComparisonEvidenceValue(
  row: P7TrainingLevelInventory,
  candidate: P7TrainingLevelInventory["targets"][number]["donorCandidates"][number],
): CanonicalJsonValue | null {
  if (candidate.mapRelationship === "official-map") return null;
  return {
    artifact: "ccsolver-p7-training-map-comparison-evidence",
    version: 1,
    algorithmRevision: "normalized-gameplay-sha256-plus-bounded-canonical-diff-v1",
    relationship: candidate.mapRelationship,
    official: {
      occurrenceId: row.occurrenceId,
      levelContent: sourceMemberContent({
        occurrenceId: row.occurrenceId,
        levelNumber: row.levelNumber,
        mapPath: row.source.mapPath,
        sourceMembers: row.source.sourceMembers,
      }),
      normalizedGameplaySha256: row.source.normalizedGameplaySha256,
    },
    candidate: {
      occurrenceId: candidate.source.occurrenceId,
      levelContent: sourceMemberContent({
        occurrenceId: candidate.source.occurrenceId,
        levelNumber: candidate.source.levelNumber,
        mapPath: candidate.source.mapPath,
        sourceMembers: candidate.source.sourceMembers,
      }),
      normalizedGameplaySha256: candidate.source.normalizedGameplaySha256,
    },
    equality: candidate.mapRelationship === "exact-gameplay-alias",
    mapDiff: candidate.mapDiff,
  } as unknown as CanonicalJsonValue;
}

async function expectedMapComparisonEvidence(
  row: P7TrainingLevelInventory,
  candidate: P7TrainingLevelInventory["targets"][number]["donorCandidates"][number],
  sha256: Sha256Port,
): Promise<BlobReferenceV1 | null> {
  const value = buildP7TrainingMapComparisonEvidenceValue(row, candidate);
  return value === null ? null : referenceCanonicalJson(canonicalizeJson(value), sha256);
}

async function assertProcessedLevelAgainstInventory(input: {
  readonly row: P7TrainingLevelInventory;
  readonly level: P7bTrainingReplayLevelV1;
  readonly evidence: P7GeneratedEvidenceBundleV1;
  readonly sha256: Sha256Port;
}): Promise<void> {
  const { row, level } = input;
  const evidenceDigests = new Set(input.evidence.blobs.map(({ content }) => content.digest));
  const levelContent = sourceMemberContent({
    occurrenceId: row.occurrenceId,
    levelNumber: row.levelNumber,
    mapPath: row.source.mapPath,
    sourceMembers: row.source.sourceMembers,
  });
  const eligibilityPolicy = `${row.eligibility.sourceScope.policyRevision}+${row.eligibility.legacyValidity.policyRevision}`;
  const sourceEligible = row.eligibility.sourceScope.status === "eligible"
    && row.eligibility.legacyValidity.status === "valid";
  const eligibilityEvidence = await referenceCanonicalJson(
    canonicalizeJson(row.eligibility as unknown as CanonicalJsonValue),
    input.sha256,
  );
  if (
    level.source.packId !== row.packId
    || level.source.levelNumber !== row.levelNumber
    || level.source.title !== row.title
    || level.source.normalizedGameplaySha256 !== row.source.normalizedGameplaySha256
    || !sameReference(level.source.levelContent, levelContent)
    || level.source.eligibility.status !== (sourceEligible ? "eligible" : "ineligible")
    || level.source.eligibility.standardOnly !== sourceEligible
    || level.source.eligibility.policyRevision !== eligibilityPolicy
    || !sameReference(level.source.eligibility.evidence, eligibilityEvidence)
    || !evidenceDigests.has(eligibilityEvidence.digest)
  ) throw new Error(`${row.occurrenceId} contract source provenance drifted`);

  const selected = (["ms", "lynx"] as const).map((target) => ({
    target,
    candidate: row.targets.find((entry) => entry.target === target)!.donorCandidates[0] ?? null,
  }));
  const expectedDonorIds = new Set(selected.flatMap(({ candidate }) => (
    candidate === null ? [] : [candidate.candidateId]
  )));
  if (
    level.rawDonors.length !== expectedDonorIds.size
    || level.rawDonors.some(({ donorId }) => !expectedDonorIds.has(donorId))
  ) throw new Error(`${row.occurrenceId} contract donor set drifted`);
  for (const { target, candidate } of selected) {
    const coverage = level.donorCoverage[target];
    if (candidate === null) {
      if (coverage.status !== "missing" || coverage.rawDonorId !== null) {
        throw new Error(`${row.occurrenceId}/${target} missing donor coverage drifted`);
      }
      continue;
    }
    if (coverage.status !== "bound" || coverage.rawDonorId !== candidate.candidateId) {
      throw new Error(`${row.occurrenceId}/${target} selected donor coverage drifted`);
    }
    const donor = level.rawDonors.find(({ donorId }) => donorId === candidate.candidateId);
    const candidateLevelContent = sourceMemberContent({
      occurrenceId: candidate.source.occurrenceId,
      levelNumber: candidate.source.levelNumber,
      mapPath: candidate.source.mapPath,
      sourceMembers: candidate.source.sourceMembers,
    });
    const comparison = await expectedMapComparisonEvidence(row, candidate, input.sha256);
    if (
      donor === undefined
      || donor.target !== target
      || donor.origin !== candidate.source.origin
      || donor.sourcePackId !== candidate.source.packId
      || donor.sourceLevelNumber !== candidate.source.levelNumber
      || donor.sourceNormalizedGameplaySha256 !== candidate.source.normalizedGameplaySha256
      || !sameReference(donor.sourceLevelContent, candidateLevelContent)
      || !sameReference(donor.replayContent, candidate.replay.content)
      || donor.mapRelationship !== candidate.mapRelationship
      || (comparison === null
        ? donor.mapComparisonEvidence !== null
        : donor.mapComparisonEvidence === null
          || !sameReference(donor.mapComparisonEvidence, comparison)
          || !evidenceDigests.has(comparison.digest))
    ) throw new Error(`${row.occurrenceId}/${target} contract donor provenance drifted`);
  }
  const rawVariants = level.variants.filter(({ kind }) => kind === "raw");
  if (
    (rawVariants.length !== 0 && rawVariants.length !== expectedDonorIds.size)
    || (level.processing.status === "complete" && rawVariants.length !== expectedDonorIds.size)
    || rawVariants.some((variant) => (
      variant.lineage.kind !== "raw-donor"
      || variant.lineage.rawDonorId === null
      || !expectedDonorIds.has(variant.lineage.rawDonorId)
      || !sameReference(
        variant.replayContent,
        level.rawDonors.find(({ donorId }) => donorId === variant.lineage.rawDonorId)!.replayContent,
      )
    ))
  ) throw new Error(`${row.occurrenceId} raw variant lineage drifted`);
  for (const variant of level.variants.filter(({ kind }) => kind === "portable")) {
    if (
      variant.lineage.rawDonorId === null
      || !expectedDonorIds.has(variant.lineage.rawDonorId)
    ) throw new Error(`${row.occurrenceId} portable lineage is not selected inventory provenance`);
  }
  const sharedProfileContent = await referenceCanonicalJson(
    canonicalizeJson(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1 as unknown as CanonicalJsonValue),
    input.sha256,
  );
  assertGeneratedEvidenceClosure(row, level, input.evidence, sharedProfileContent);
}

function evidenceJson(
  bundle: P7GeneratedEvidenceBundleV1,
  content: BlobReferenceV1,
  label: string,
): unknown {
  const blob = bundle.blobs.find((entry) => sameReference(entry.content, content));
  if (blob === undefined || blob.mediaType !== "application/json") {
    throw new Error(`${label} is absent from generated JSON evidence`);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(blob.bytes);
  const parsed: unknown = JSON.parse(text);
  if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
    throw new Error(`${label} is not canonical JSON evidence`);
  }
  return parsed;
}

function certificationBoundaries(
  certification: P7bTrainingReplayLevelV1["variants"][number]["certifications"]["ms"],
) {
  return certification.segmentSpans.map((span) => ({
    segmentId: span.segmentId,
    index: span.index,
    startNativeTick: span.startNativeTick,
    endNativeTick: span.endNativeTick,
    startBoundaryEvidence: span.startBoundaryEvidence,
    endBoundaryEvidence: span.endBoundaryEvidence,
  }));
}

function assertGeneratedEvidenceClosure(
  row: P7TrainingLevelInventory,
  level: P7bTrainingReplayLevelV1,
  bundle: P7GeneratedEvidenceBundleV1,
  sharedProfileContent: BlobReferenceV1,
): void {
  const digests = new Set(bundle.blobs.map(({ content }) => content.digest));
  const requireGenerated = (content: BlobReferenceV1 | null, label: string): void => {
    if (content !== null && !digests.has(content.digest)) {
      throw new Error(`${row.occurrenceId} generated evidence closure omits ${label}`);
    }
  };
  requireGenerated(level.source.eligibility.evidence, "eligibility evidence");
  level.rawDonors.forEach((donor) => {
    requireGenerated(donor.mapComparisonEvidence, `${donor.donorId} map comparison`);
  });
  for (const variant of level.variants) {
    if (variant.kind === "portable") {
      requireGenerated(variant.replayContent, `${variant.variantId} portable trace`);
      if (!sameReference(variant.portableProfile!.profileContent, sharedProfileContent)) {
        throw new Error(`${row.occurrenceId} portable profile is not the frozen pack-shared profile`);
      }
      requireGenerated(
        variant.portableProfile!.decisionTraceContent,
        `${variant.variantId} profile trace`,
      );
    }
    requireGenerated(variant.lineage.evidence, `${variant.variantId} lineage`);
    variant.transforms.forEach((transform) => {
      requireGenerated(transform.evidence, `${variant.variantId} transform ${transform.ordinal}`);
    });
    for (const target of ["ms", "lynx"] as const) {
      const certification = variant.certifications[target];
      if (
        certification.execution.decisionProfile?.profileContent !== null
        && certification.execution.decisionProfile?.profileContent !== undefined
        && !sameReference(
          certification.execution.decisionProfile.profileContent,
          sharedProfileContent,
        )
      ) throw new Error(`${row.occurrenceId}/${variant.variantId}/${target} profile drifted`);
      requireGenerated(certification.evidence, `${variant.variantId}/${target} certification`);
      requireGenerated(
        certification.execution.browserReplayContent,
        `${variant.variantId}/${target} browser replay`,
      );
      requireGenerated(
        certification.execution.browserReplayParityReceipt,
        `${variant.variantId}/${target} browser parity`,
      );
      requireGenerated(
        certification.execution.compilationReceipt,
        `${variant.variantId}/${target} compilation receipt`,
      );
      certification.segmentSpans.forEach((span) => {
        requireGenerated(span.startBoundaryEvidence, `${variant.variantId}/${target} start boundary`);
        requireGenerated(span.endBoundaryEvidence, `${variant.variantId}/${target} end boundary`);
      });
      if (certification.evidence === null) continue;
      const receipt = evidenceJson(
        bundle,
        certification.evidence,
        `${row.occurrenceId}/${variant.variantId}/${target} certification receipt`,
      );
      if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
        throw new Error(`${row.occurrenceId}/${variant.variantId}/${target} certification receipt is invalid`);
      }
      const record = receipt as Record<string, unknown>;
      const expectedBoundaries = canonicalizeJson(
        certificationBoundaries(certification) as unknown as CanonicalJsonValue,
      );
      if (
        record.occurrenceId !== row.occurrenceId
        || record.target !== target
        || record.terminalNativeTick !== certification.terminalNativeTick
        || canonicalizeJson(record.segmentBoundaries as CanonicalJsonValue) !== expectedBoundaries
        || (
          certification.execution.status === "native"
          && record.decisionCount !== certification.execution.executedDecisionCount
        )
        || (
          certification.execution.status === "compiled"
          && record.decisionsBeforeTerminal !== certification.execution.executedDecisionCount
        )
      ) throw new Error(`${row.occurrenceId}/${variant.variantId}/${target} certification evidence drifted`);
    }
  }
}

async function canonicalArtifact<T>(
  value: T,
  sha256: Sha256Port,
  maximumBytes?: number,
  label = "canonical artifact",
): Promise<P7TrainingCanonicalArtifact<T>> {
  const canonicalJson = canonicalizeJson(value as unknown as CanonicalJsonValue);
  const byteLength = new TextEncoder().encode(canonicalJson).byteLength;
  if (maximumBytes !== undefined && byteLength > maximumBytes) {
    throw new Error(`${label} exceeds its ${maximumBytes}-byte cap`);
  }
  return {
    value,
    canonicalJson,
    content: await referenceCanonicalJson(canonicalJson, sha256),
  };
}

async function assertCanonicalArtifact<T>(input: {
  readonly value: T;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
  readonly label: string;
  readonly sha256: Sha256Port;
  readonly maximumBytes?: number;
}): Promise<void> {
  const canonicalJson = canonicalizeJson(input.value as unknown as CanonicalJsonValue);
  if (canonicalJson !== input.canonicalJson) {
    throw new Error(`${input.label} canonical JSON does not match its value`);
  }
  if (
    input.maximumBytes !== undefined
    && new TextEncoder().encode(canonicalJson).byteLength > input.maximumBytes
  ) throw new Error(`${input.label} exceeds its ${input.maximumBytes}-byte cap`);
  const content = await referenceCanonicalJson(canonicalJson, input.sha256);
  if (!sameReference(content, input.content)) {
    throw new Error(`${input.label} content digest does not match its canonical JSON`);
  }
}

function requiredPack(
  inventory: P7TrainingPackInventoryClosure,
  packId: P7TrainingPackId,
): P7TrainingPackInventory {
  const pack = inventory.packs.find((entry) => entry.packId === packId);
  if (pack === undefined || pack.levels.length !== P7_TRAINING_LEVELS_PER_PACK) {
    throw new Error(`${packId} must contain exactly 149 official inventory rows`);
  }
  for (const [index, row] of pack.levels.entries()) {
    if (
      row.packId !== packId
      || row.levelNumber !== index + 1
      || row.occurrenceId !== `${packId}/${String(index + 1).padStart(3, "0")}`
    ) {
      throw new Error(`${packId} official inventory order drifted at level ${index + 1}`);
    }
  }
  return pack;
}

async function packContentReference(
  inventory: P7TrainingPackInventoryClosure,
  pack: P7TrainingPackInventory,
  sha256: Sha256Port,
): Promise<BlobReferenceV1> {
  const paths = new Set<string>([pack.mapPath]);
  const selectedDonors = pack.levels.flatMap((level) => level.targets.map((target) => {
    paths.add(target.execution.seriesConfigPath);
    const selected = target.donorCandidates[0] ?? null;
    if (selected !== null) {
      paths.add(selected.source.mapPath);
      paths.add(selected.source.seriesConfigPath);
      paths.add(selected.source.replaySourcePath);
    }
    return {
      occurrenceId: level.occurrenceId,
      target: target.target,
      selected: selected === null ? null : {
        candidateId: selected.candidateId,
        priority: selected.priority,
        mapRelationship: selected.mapRelationship,
        sourceOccurrenceId: selected.source.occurrenceId,
        mapContent: selected.source.mapContent,
        seriesConfigContent: selected.source.seriesConfigContent,
        replayFileContent: selected.source.replayFileContent,
        replayContent: selected.replay.content,
      },
    };
  }));
  const verifiedByPath = new Map(inventory.verifiedInputs.map((entry) => [entry.path, entry]));
  const verifiedInputs = [...paths].sort().map((path) => {
    const entry = verifiedByPath.get(path);
    if (entry === undefined) throw new Error(`${pack.packId} pack closure lacks checked input ${path}`);
    return entry;
  });
  const value = {
    corpusRevision: inventory.corpusRevision,
    closurePolicy: "pack-official-plus-deterministically-selected-donor-inputs-v1",
    pack: {
      packId: pack.packId,
      displayName: pack.displayName,
      mapPath: pack.mapPath,
      summary: pack.summary,
      occurrences: pack.levels.map(occurrenceIdentity),
    },
    verifiedInputs,
    selectedDonors,
  };
  return (await canonicalArtifact(value, sha256)).content;
}

function partitionBounds(shardIndex: number): { readonly start: number; readonly end: number } {
  if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= P7_TRAINING_SHARD_COUNT) {
    throw new Error(`P7 training shard index must be from zero through ${P7_TRAINING_SHARD_COUNT - 1}`);
  }
  const base = Math.floor(P7_TRAINING_LEVELS_PER_PACK / P7_TRAINING_SHARD_COUNT);
  const remainder = P7_TRAINING_LEVELS_PER_PACK % P7_TRAINING_SHARD_COUNT;
  const start = shardIndex * base + Math.min(shardIndex, remainder);
  const length = base + Number(shardIndex < remainder);
  return { start, end: start + length };
}

function occurrenceIdentity(row: P7TrainingLevelInventory): P7TrainingShardOccurrenceIdentityV1 {
  const levelMember = row.source.sourceMembers.find(({ ordinal }) => ordinal === 0);
  if (
    levelMember === undefined
    || levelMember.sourcePath !== row.source.mapPath
    || levelMember.sourceLevelNumber !== row.levelNumber
  ) throw new Error(`${row.occurrenceId} source level member identity is missing`);
  return {
    caseId: row.caseId,
    levelNumber: row.levelNumber,
    normalizedGameplaySha256: row.source.normalizedGameplaySha256,
    occurrenceId: row.occurrenceId,
    sourceContainerContent: { ...row.source.containerContent },
    sourceLevelContent: {
      digest: `sha256:${levelMember.sha256}`,
      byteLength: levelMember.byteLength,
    },
    title: row.title,
  };
}

export async function buildP7TrainingShardPlan(input: {
  readonly inventory: P7TrainingPackInventoryClosure;
  readonly packId: P7TrainingPackId;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingShardPlan> {
  const pack = requiredPack(input.inventory, input.packId);
  const packContent = await packContentReference(input.inventory, pack, input.sha256);
  const requests: P7TrainingShardRequestArtifact[] = [];
  for (let shardIndex = 0; shardIndex < P7_TRAINING_SHARD_COUNT; shardIndex += 1) {
    const { start, end } = partitionBounds(shardIndex);
    const request: P7TrainingShardRequestV1 = {
      artifact: P7_TRAINING_SHARD_REQUEST_ARTIFACT,
      version: 1,
      processorRevision: P7_TRAINING_PROCESSOR_REVISION,
      inventory: {
        corpusRevision: input.inventory.corpusRevision,
        packId: input.packId,
        packContent,
      },
      partition: {
        identity: P7_TRAINING_PARTITION_IDENTITY,
        shardCount: P7_TRAINING_SHARD_COUNT,
        shardIndex,
        startLevelNumber: start + 1,
        endLevelNumber: end,
      },
      occurrences: pack.levels.slice(start, end).map(occurrenceIdentity),
    };
    const artifact = await canonicalArtifact(
      request,
      input.sha256,
      P7_TRAINING_SHARD_LIMITS.maximumRequestBytes,
      `P7 training shard ${shardIndex} request`,
    );
    requests.push({
      request,
      canonicalJson: artifact.canonicalJson,
      content: artifact.content,
    });
  }
  return { packId: input.packId, packContent, requests };
}

export async function buildP7TrainingShardRequest(input: {
  readonly inventory: P7TrainingPackInventoryClosure;
  readonly packId: P7TrainingPackId;
  readonly shardIndex: number;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingShardRequestArtifact> {
  partitionBounds(input.shardIndex);
  return (await buildP7TrainingShardPlan(input)).requests[input.shardIndex]!;
}

function copyBrowserTarget(value: P7TrainingBrowserTargetV1): P7TrainingBrowserTargetV1 {
  return {
    request: structuredClone(value.request),
    display: structuredClone(value.display),
  };
}

function browserTargetForRow(
  row: P7TrainingLevelInventory,
  target: "ms" | "lynx",
): P7TrainingBrowserTargetV1 {
  const execution = row.targets.find((entry) => entry.target === target)!.execution;
  return {
    request: structuredClone(execution.request),
    display: structuredClone(execution.display),
  };
}

async function copyPortableTrace(
  value: P7TrainingPortableDecisionTraceAssetV1,
  sha256: Sha256Port,
): Promise<P7TrainingPortableDecisionTraceAssetV1> {
  parseP7bPortableDecisionTrace(value.canonicalJson);
  const content = await referenceCanonicalJson(value.canonicalJson, sha256);
  if (!sameReference(content, value.content)) {
    throw new Error("portable decision trace digest does not match its canonical bytes");
  }
  return { content: { ...value.content }, canonicalJson: value.canonicalJson };
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) throw new Error(`${label} has an unsupported shape`);
  return record;
}

function copiedReference(value: unknown, label: string): BlobReferenceV1 {
  const record = exactRecord(value, ["byteLength", "digest"], label);
  if (
    typeof record.digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(record.digest)
    || !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 0
  ) throw new Error(`${label} is invalid`);
  return {
    digest: record.digest as `sha256:${string}`,
    byteLength: record.byteLength as number,
  };
}

function copiedInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function copiedParityReceipt(
  value: unknown,
): P7TrainingBrowserReplayInputV1["parity"]["receipt"] {
  const receipt = exactRecord(value, [
    "artifact",
    "browserReplayContent",
    "expected",
    "nativeBoundaryClock",
    "observed",
    "occurrenceId",
    "portableScheduleProjection",
    "sourceReplayContent",
    "status",
    "target",
    "transport",
    "variantId",
    "version",
  ], "P7 browser parity receipt");
  const outcome = (value: unknown, label: string) => {
    const record = exactRecord(
      value,
      ["outcome", "segmentBoundaries", "terminalNativeTick"],
      label,
    );
    if (
      record.outcome !== "won"
      && record.outcome !== "loss"
      && record.outcome !== "diverged"
      && record.outcome !== "timeout"
    ) throw new Error(`${label} outcome is invalid`);
    if (!Array.isArray(record.segmentBoundaries) || record.segmentBoundaries.length > 8_192) {
      throw new Error(`${label} segment boundary count is invalid`);
    }
    const segmentBoundaries = record.segmentBoundaries.map((value, ordinal) => {
      const boundary = exactRecord(value, [
        "endBoundaryEvidence",
        "endNativeTick",
        "index",
        "segmentId",
        "startBoundaryEvidence",
        "startNativeTick",
      ], `${label} segment boundary ${ordinal}`);
      const startNativeTick = copiedInteger(
        boundary.startNativeTick,
        `${label} segment boundary ${ordinal} start tick`,
      );
      const endNativeTick = copiedInteger(
        boundary.endNativeTick,
        `${label} segment boundary ${ordinal} end tick`,
      );
      if (
        boundary.index !== ordinal
        || typeof boundary.segmentId !== "string"
        || boundary.segmentId.trim() === ""
        || new TextEncoder().encode(boundary.segmentId).byteLength > 512
        || endNativeTick <= startNativeTick
      ) throw new Error(`${label} segment boundary ${ordinal} identity is invalid`);
      return {
        segmentId: boundary.segmentId,
        index: ordinal,
        startNativeTick,
        endNativeTick,
        startBoundaryEvidence: copiedReference(
          boundary.startBoundaryEvidence,
          `${label} segment boundary ${ordinal} start evidence`,
        ),
        endBoundaryEvidence: copiedReference(
          boundary.endBoundaryEvidence,
          `${label} segment boundary ${ordinal} end evidence`,
        ),
      };
    });
    return {
      outcome: record.outcome as "won" | "loss" | "diverged" | "timeout",
      terminalNativeTick: copiedInteger(record.terminalNativeTick, `${label} terminal tick`),
      segmentBoundaries,
    };
  };
  const expected = outcome(receipt.expected, "P7 parity expected result");
  const observed = outcome(receipt.observed, "P7 parity observed result");
  let portableScheduleProjection: P7TrainingBrowserReplayInputV1["parity"]["receipt"]["portableScheduleProjection"] = null;
  if (receipt.portableScheduleProjection !== null) {
    const projection = exactRecord(receipt.portableScheduleProjection, [
      "authoredChangeCount",
      "executedChangeCount",
      "omittedPostTerminalChanges",
    ], "P7 portable schedule projection");
    const authoredChangeCount = copiedInteger(
      projection.authoredChangeCount,
      "P7 authored portable change count",
    );
    const executedChangeCount = copiedInteger(
      projection.executedChangeCount,
      "P7 executed portable change count",
    );
    if (
      !Array.isArray(projection.omittedPostTerminalChanges)
      || projection.omittedPostTerminalChanges.length > P7_TRAINING_MAX_BROWSER_INPUTS
      || authoredChangeCount < executedChangeCount
      || projection.omittedPostTerminalChanges.length
        !== authoredChangeCount - executedChangeCount
    ) throw new Error("P7 portable schedule projection counts drifted");
    const omittedPostTerminalChanges = projection.omittedPostTerminalChanges.map((value, index) => {
      const change = exactRecord(value, [
        "inputCode",
        "modifierMask",
        "nativeTick",
        "ordinal",
      ], `P7 omitted portable change ${index}`);
      const ordinal = copiedInteger(change.ordinal, `P7 omitted portable change ${index} ordinal`);
      if (ordinal !== executedChangeCount + index || change.modifierMask !== 0) {
        throw new Error("P7 omitted portable changes are not the exact authored suffix");
      }
      return {
        ordinal,
        nativeTick: copiedInteger(change.nativeTick, `P7 omitted portable change ${index} tick`),
        inputCode: copiedInteger(change.inputCode, `P7 omitted portable change ${index} input`),
        modifierMask: 0 as const,
      };
    });
    portableScheduleProjection = {
      authoredChangeCount,
      executedChangeCount,
      omittedPostTerminalChanges,
    };
  }
  if (
    receipt.artifact !== "ccsolver-p7-browser-replay-parity-receipt"
    || receipt.version !== 1
    || typeof receipt.occurrenceId !== "string"
    || receipt.occurrenceId.trim() === ""
    || (receipt.variantId !== "raw-ms"
      && receipt.variantId !== "raw-lynx"
      && receipt.variantId !== "portable")
    || (receipt.target !== "ms" && receipt.target !== "lynx")
    || (receipt.transport !== "native-replay-pulses"
      && receipt.transport !== "manual-held-schedule")
    || receipt.nativeBoundaryClock !== "exclusive-advance-count-v1"
    || receipt.status !== "matched"
  ) throw new Error("P7 browser parity receipt identity is invalid");
  return {
    artifact: "ccsolver-p7-browser-replay-parity-receipt",
    version: 1,
    occurrenceId: receipt.occurrenceId,
    variantId: receipt.variantId,
    target: receipt.target,
    transport: receipt.transport,
    sourceReplayContent: copiedReference(receipt.sourceReplayContent, "P7 parity source replay"),
    browserReplayContent: copiedReference(receipt.browserReplayContent, "P7 parity browser replay"),
    nativeBoundaryClock: "exclusive-advance-count-v1",
    portableScheduleProjection,
    expected,
    observed,
    status: "matched",
  };
}

function assertNoPrivatePaths(value: unknown, repositoryRoot: string, label: string): void {
  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      if (
        entry.includes(repositoryRoot)
        || /^\/(?:Users|home|tmp|var|private)(?:\/|$)/u.test(entry)
        || /^[A-Za-z]:[\\/]/u.test(entry)
        || entry.startsWith("file://")
      ) throw new Error(`${label} contains a private absolute path`);
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (entry !== null && typeof entry === "object") Object.values(entry).forEach(visit);
  };
  visit(value);
}

async function checkedEvidenceSidecar(input: {
  readonly occurrenceId: string;
  readonly bundle: P7GeneratedEvidenceBundleV1;
  readonly repositoryRoot: string;
  readonly sha256: Sha256Port;
}): Promise<{
  readonly bundle: P7GeneratedEvidenceBundleV1;
  readonly sidecar: P7GeneratedEvidenceSidecarV1;
}> {
  if (
    input.bundle.totals.blobCount > P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobCountPerLevel
    || input.bundle.totals.byteLength > P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel
    || input.bundle.blobs.some(({ content, bytes }) => (
      content.byteLength > P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobBytes
      || bytes.byteLength > P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobBytes
    ))
  ) throw new Error(`${input.occurrenceId} generated evidence exceeds its per-level cap`);
  if (!input.bundle.scopeId.startsWith(`${input.occurrenceId}/`)) {
    throw new Error(`${input.occurrenceId} generated evidence scope is not occurrence-local`);
  }
  for (const blob of input.bundle.blobs) {
    if (blob.mediaType === "application/json") {
      const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(blob.bytes));
      assertNoPrivatePaths(parsed, input.repositoryRoot, `${input.occurrenceId} JSON evidence`);
    } else {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(blob.bytes);
        if (
          text.includes(input.repositoryRoot)
          || /(?:^|\s)\/Users\//u.test(text)
          || /(?:^|\s)[A-Za-z]:[\\/]/u.test(text)
        ) throw new Error(`${input.occurrenceId} binary evidence contains a private absolute path`);
      } catch (error) {
        if (error instanceof Error && error.message.includes("private absolute path")) throw error;
      }
    }
  }
  const store = new P7GeneratedEvidenceStore({
    scopeId: input.bundle.scopeId,
    sha256: input.sha256,
    limits: {
      maximumBlobCount: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobCountPerLevel,
      maximumBlobBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobBytes,
      maximumTotalBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
    },
  });
  await store.importBundle(input.bundle);
  const bundle = store.bundle();
  return { bundle, sidecar: await buildP7GeneratedEvidenceSidecar({ bundle, sha256: input.sha256 }) };
}

function copyBrowserReplayInput(
  value: P7TrainingBrowserReplayInputV1,
  sha256: Sha256Port,
): Promise<P7TrainingShardBrowserReplayAssetV1> {
  return (async () => {
    const wrapper = exactRecord(value, [
      "canonicalJson",
      "content",
      "parity",
      "replay",
      "target",
      "variantId",
    ], "P7 shard browser replay wrapper");
    if (typeof wrapper.canonicalJson !== "string") {
      throw new Error("P7 shard browser replay canonical JSON is invalid");
    }
    const replay = parseP7TrainingBrowserReplay(wrapper.canonicalJson);
    if (
      canonicalizeP7TrainingBrowserReplay(wrapper.replay) !== wrapper.canonicalJson
      || wrapper.variantId !== replay.variantId
      || wrapper.target !== replay.target
    ) throw new Error("P7 shard browser replay wrapper identity drifted");
    const content = await referenceCanonicalJson(
      wrapper.canonicalJson as CanonicalJson,
      sha256,
    );
    const declaredContent = copiedReference(wrapper.content, "P7 shard browser replay content");
    if (!sameReference(content, declaredContent)) {
      throw new Error("P7 shard browser replay digest does not match its exact canonical bytes");
    }
    const parity = exactRecord(wrapper.parity, ["evidence", "receipt"], "P7 browser parity");
    const receipt = copiedParityReceipt(parity.receipt);
    if (
      receipt.artifact !== "ccsolver-p7-browser-replay-parity-receipt"
      || receipt.version !== 1
      || receipt.status !== "matched"
      || receipt.variantId !== replay.variantId
      || receipt.target !== replay.target
      || receipt.transport !== replay.transport
      || receipt.nativeBoundaryClock !== "exclusive-advance-count-v1"
      || !sameReference(
        copiedReference(receipt.browserReplayContent, "P7 parity browser content"),
        content,
      )
      || !sameReference(
        copiedReference(receipt.sourceReplayContent, "P7 parity source replay content"),
        replay.sourceReplayContent,
      )
    ) throw new Error("P7 browser parity receipt identity drifted");
    const receiptCanonical = canonicalizeJson(receipt as unknown as CanonicalJsonValue);
    const evidence = copiedReference(parity.evidence, "P7 browser parity evidence");
    const actualEvidence = await referenceCanonicalJson(receiptCanonical, sha256);
    if (!sameReference(evidence, actualEvidence)) {
      throw new Error("P7 browser parity evidence does not bind its canonical receipt");
    }
    return {
      variantId: replay.variantId,
      target: replay.target,
      canonicalJson: wrapper.canonicalJson as CanonicalJson,
      content,
      parity: { receipt, evidence },
    };
  })();
}

function expectedBrowserSegmentBoundaries(
  level: P7bTrainingReplayLevelV1,
  variantId: string,
  target: "ms" | "lynx",
) {
  const variant = level.variants.find((entry) => entry.variantId === variantId);
  if (variant === undefined) throw new Error(`unknown browser variant ${variantId}`);
  return variant.certifications[target].segmentSpans.map((span) => ({
    segmentId: span.segmentId,
    index: span.index,
    startNativeTick: span.startNativeTick,
    endNativeTick: span.endNativeTick,
    startBoundaryEvidence: span.startBoundaryEvidence,
    endBoundaryEvidence: span.endBoundaryEvidence,
  }));
}

function assertBrowserAssetsBoundToLevel(
  row: P7TrainingLevelInventory,
  level: P7bTrainingReplayLevelV1,
  browserReplays: readonly P7TrainingShardBrowserReplayAssetV1[],
): void {
  const expectedBrowserCells = new Map(level.variants.flatMap((variant) => (
    (["ms", "lynx"] as const).flatMap((target) => {
      const certification = variant.certifications[target];
      return certification.execution.status === "native"
        || certification.execution.status === "compiled"
        ? [[`${variant.variantId}:${target}`, { variant, target, certification }] as const] : [];
    })
  )));
  const actualBrowserCells = new Map<string, P7TrainingShardBrowserReplayAssetV1>(
    browserReplays.map((entry) => [`${entry.variantId}:${entry.target}`, entry] as const),
  );
  if (
    actualBrowserCells.size !== browserReplays.length
    || actualBrowserCells.size !== expectedBrowserCells.size
  ) throw new Error(`${row.occurrenceId} browser assets do not match the certified execution matrix`);
  for (const [key, expected] of expectedBrowserCells) {
    const asset = actualBrowserCells.get(key);
    if (asset === undefined) {
      throw new Error(`${row.occurrenceId} browser assets omit certified cell ${key}`);
    }
    const replay = parseP7TrainingBrowserReplay(asset.canonicalJson);
    const execution = expected.certification.execution;
    const receipt = asset.parity.receipt;
    const executedDecisionCount = replay.transport === "native-replay-pulses"
      ? replay.decisions.length
      : replay.changes.length;
    const expectedBoundaries = expectedBrowserSegmentBoundaries(
      level,
      expected.variant.variantId,
      expected.target,
    );
    const expectedBoundaryJson = canonicalizeJson(
      expectedBoundaries as unknown as CanonicalJsonValue,
    );
    if (
      execution.replayContent === null
      || execution.browserReplayContent === null
      || execution.browserReplayParityReceipt === null
      || execution.browserReplayTransport !== replay.transport
      || execution.executedDecisionCount !== executedDecisionCount
      || !sameReference(execution.replayContent, replay.sourceReplayContent)
      || !sameReference(receipt.sourceReplayContent, replay.sourceReplayContent)
      || !sameReference(execution.browserReplayContent, asset.content)
      || !sameReference(execution.browserReplayParityReceipt, asset.parity.evidence)
      || expected.certification.terminalNativeTick !== replay.terminalNativeTick
      || receipt.occurrenceId !== row.occurrenceId
      || receipt.variantId !== replay.variantId
      || receipt.target !== replay.target
      || receipt.transport !== replay.transport
      || receipt.expected.terminalNativeTick !== replay.terminalNativeTick
      || receipt.observed.terminalNativeTick !== replay.terminalNativeTick
      || receipt.expected.outcome !== expected.certification.outcome
      || receipt.observed.outcome !== expected.certification.outcome
      || canonicalizeJson(
        receipt.expected.segmentBoundaries as unknown as CanonicalJsonValue,
      ) !== expectedBoundaryJson
      || canonicalizeJson(
        receipt.observed.segmentBoundaries as unknown as CanonicalJsonValue,
      ) !== expectedBoundaryJson
    ) throw new Error(`${row.occurrenceId} browser asset ${key} is not bound to its certification`);
    if (replay.transport === "manual-held-schedule") {
      const projection = receipt.portableScheduleProjection;
      if (
        projection === null
        || projection.executedChangeCount !== replay.changes.length
        || projection.authoredChangeCount < projection.executedChangeCount
        || projection.omittedPostTerminalChanges.length
          !== projection.authoredChangeCount - projection.executedChangeCount
      ) throw new Error(`${row.occurrenceId} browser asset ${key} portable prefix drifted`);
    } else if (receipt.portableScheduleProjection !== null) {
      throw new Error(`${row.occurrenceId} browser asset ${key} has a portable projection`);
    }
  }
}

export async function validateAndPersistP7TrainingLevelProcessOutput(
  row: P7TrainingLevelInventory,
  output: P7TrainingLevelProcessOutputV1,
  sha256: Sha256Port,
  repositoryRoot: string,
  persistEvidence: P7TrainingPersistEvidence,
): Promise<P7TrainingShardLevelProcessingV1> {
  const level = buildP7bTrainingReplayLevel(output.trainingReplayLevel);
  if (
    level.source.packId !== row.packId
    || level.source.levelNumber !== row.levelNumber
    || level.source.title !== row.title
    || level.source.normalizedGameplaySha256 !== row.source.normalizedGameplaySha256
  ) {
    throw new Error(`${row.occurrenceId} processed training level identity drifted`);
  }
  const expectedProcessing = output.status === "complete" ? "complete" : "blocked";
  if (
    level.processing.status !== expectedProcessing
    || (output.status === "complete" && level.source.eligibility.status !== "eligible")
    || (output.status === "ineligible" && level.source.eligibility.status !== "ineligible")
  ) throw new Error(`${row.occurrenceId} process status disagrees with its training contract`);
  if (
    typeof output.detail !== "string"
    || output.detail.trim() === ""
    || new TextEncoder().encode(output.detail).byteLength > 4_096
    || output.detail.includes(repositoryRoot)
    || /(?:^|[\s"'(])(?:\/[A-Za-z0-9_.-]+){2,}|[A-Za-z]:\\/u.test(output.detail)
  ) throw new Error(`${row.occurrenceId} process detail contains a private or unbounded path`);
  const browserTargets = {
    ms: copyBrowserTarget(output.browserTargets.ms),
    lynx: copyBrowserTarget(output.browserTargets.lynx),
  };
  for (const target of ["ms", "lynx"] as const) {
    if (canonicalizeJson(browserTargets[target]) !== canonicalizeJson(
      browserTargetForRow(row, target),
    )) {
      throw new Error(`${row.occurrenceId}/${target} browser target is not the official execution source`);
    }
  }
  if (
    output.browserReplays.length > P7_TRAINING_SHARD_LIMITS.maximumBrowserReplayCountPerLevel
    || output.portableDecisionTraces.length
      > P7_TRAINING_SHARD_LIMITS.maximumPortableTraceCountPerLevel
  ) throw new Error(`${row.occurrenceId} processed assets exceed their per-level count caps`);
  const browserReplays = await Promise.all(
    output.browserReplays.map((entry) => copyBrowserReplayInput(entry, sha256)),
  );
  assertBrowserAssetsBoundToLevel(row, level, browserReplays);
  const portableDecisionTraces = await Promise.all(
    output.portableDecisionTraces.map((entry) => copyPortableTrace(entry, sha256)),
  );
  const expectedPortable = level.variants.filter(({ kind }) => kind === "portable");
  if (portableDecisionTraces.length !== expectedPortable.length) {
    throw new Error(`${row.occurrenceId} portable trace set does not match its contract`);
  }
  for (const [index, variant] of expectedPortable.entries()) {
    const trace = portableDecisionTraces[index]!;
    if (
      variant.portableProfile === null
      || !sameReference(trace.content, variant.replayContent)
      || !sameReference(trace.content, variant.portableProfile.decisionTraceContent)
    ) throw new Error(`${row.occurrenceId} portable trace content drifted`);
  }
  const sidecar = await checkedEvidenceSidecar({
    occurrenceId: row.occurrenceId,
    bundle: output.generatedEvidence,
    repositoryRoot,
    sha256,
  });
  await assertProcessedLevelAgainstInventory({
    row,
    level,
    evidence: sidecar.bundle,
    sha256,
  });
  await persistEvidence({
    occurrenceId: row.occurrenceId,
    sidecar: sidecar.sidecar,
  });
  const processing: P7TrainingShardLevelProcessingV1 = {
    status: output.status,
    detail: output.detail,
    trainingReplayLevel: level,
    browserTargets,
    browserReplays,
    portableDecisionTraces,
    evidence: {
      index: sidecar.sidecar.index,
      indexContent: sidecar.sidecar.indexContent,
    },
  };
  const processingByteLength = new TextEncoder().encode(
    canonicalizeJson(processing as unknown as CanonicalJsonValue),
  ).byteLength;
  if (processingByteLength > P7_TRAINING_SHARD_LIMITS.maximumLevelResultBytes) {
    const componentByteLength = (value: unknown) => new TextEncoder().encode(
      canonicalizeJson(value as CanonicalJsonValue),
    ).byteLength;
    const componentByteLengths = {
      trainingReplayLevel: componentByteLength(processing.trainingReplayLevel),
      browserTargets: componentByteLength(processing.browserTargets),
      browserReplays: componentByteLength(processing.browserReplays),
      portableDecisionTraces: componentByteLength(processing.portableDecisionTraces),
      evidenceIndex: componentByteLength(processing.evidence),
    };
    throw new Error(
      `${row.occurrenceId} canonical level result is ${processingByteLength} bytes, exceeding `
      + `its ${P7_TRAINING_SHARD_LIMITS.maximumLevelResultBytes}-byte cap; `
      + `component bytes=${canonicalizeJson(componentByteLengths)}`,
    );
  }
  return processing;
}

export async function runP7TrainingShard(input: {
  readonly repositoryRoot: string;
  readonly request: P7TrainingShardRequestArtifact;
  readonly sha256: Sha256Port;
  readonly processLevel: P7TrainingLevelProcessor;
  readonly persistEvidence: P7TrainingPersistEvidence;
  readonly loadInventory?: P7TrainingInventoryLoader;
}): Promise<P7TrainingShardResultArtifact> {
  await assertCanonicalArtifact({
    value: input.request.request,
    canonicalJson: input.request.canonicalJson,
    content: input.request.content,
    label: "P7 training shard request",
    sha256: input.sha256,
    maximumBytes: P7_TRAINING_SHARD_LIMITS.maximumRequestBytes,
  });
  const loadInventory = input.loadInventory ?? loadCheckedTrainingCorpusInventory;
  // WeakMap-backed level/replay material is deliberately reconstructed inside
  // each shard. Requests contain only stable identities and content digests.
  const inventory = await loadInventory(input.repositoryRoot, input.sha256);
  const expectedPlan = await buildP7TrainingShardPlan({
    inventory,
    packId: input.request.request.inventory.packId,
    sha256: input.sha256,
  });
  const shardIndex = input.request.request.partition.shardIndex;
  const expected = expectedPlan.requests[shardIndex];
  if (expected === undefined || expected.canonicalJson !== input.request.canonicalJson) {
    throw new Error(`P7 training shard ${shardIndex} request does not match freshly checked inventory`);
  }
  const pack = requiredPack(inventory, input.request.request.inventory.packId);
  const rows = input.request.request.occurrences.map((identity) => {
    const row = pack.levels[identity.levelNumber - 1];
    if (
      row === undefined
      || canonicalizeJson(occurrenceIdentity(row)) !== canonicalizeJson(identity)
    ) {
      throw new Error(`P7 training shard occurrence drifted: ${identity.occurrenceId}`);
    }
    return row;
  });
  const levels: P7TrainingShardLevelResultV1[] = [];
  for (const row of rows) {
    // Expected engine outcomes are validated contract data. Programming,
    // invariant, and IO errors remain shard-fatal and are never serialized.
    const processing = await validateAndPersistP7TrainingLevelProcessOutput(
      row,
      await input.processLevel(row, input.sha256),
      input.sha256,
      input.repositoryRoot,
      input.persistEvidence,
    );
    levels.push({
      occurrenceId: row.occurrenceId,
      caseId: row.caseId,
      levelNumber: row.levelNumber,
      processing,
    });
  }
  const result: P7TrainingShardResultV1 = {
    artifact: P7_TRAINING_SHARD_RESULT_ARTIFACT,
    version: 1,
    processorRevision: P7_TRAINING_PROCESSOR_REVISION,
    inventory: structuredClone(input.request.request.inventory),
    requestContent: { ...input.request.content },
    partition: structuredClone(input.request.request.partition),
    levels,
  };
  const artifact = await canonicalArtifact(
    result,
    input.sha256,
    P7_TRAINING_SHARD_LIMITS.maximumResultBytes,
    `P7 training shard ${shardIndex} result`,
  );
  return { result, canonicalJson: artifact.canonicalJson, content: artifact.content };
}

async function verifyLevelEvidenceIndex(input: {
  readonly occurrenceId: string;
  readonly evidence: P7TrainingShardLevelProcessingV1["evidence"];
  readonly repositoryRoot: string;
  readonly sha256: Sha256Port;
  readonly verifyEvidence: P7TrainingVerifyPersistedEvidence;
}): Promise<P7GeneratedEvidenceBundleV1> {
  const index = parseP7GeneratedEvidenceSidecarIndex(input.evidence.index);
  if (!index.scopeId.startsWith(`${input.occurrenceId}/`)) {
    throw new Error(`${input.occurrenceId} persisted evidence scope is not occurrence-local`);
  }
  const indexCanonicalJson = canonicalizeP7GeneratedEvidenceSidecarIndex(index);
  const expectedContent = await referenceCanonicalJson(indexCanonicalJson, input.sha256);
  if (!sameReference(expectedContent, input.evidence.indexContent)) {
    throw new Error(`${input.occurrenceId} persisted evidence index digest drifted`);
  }
  const loaded = await input.verifyEvidence({
    occurrenceId: input.occurrenceId,
    index,
    indexContent: input.evidence.indexContent,
    sha256: input.sha256,
  });
  let bundle: P7GeneratedEvidenceBundleV1;
  try {
    bundle = await materializeP7GeneratedEvidenceSidecar({
      index,
      indexCanonicalJson: loaded.indexCanonicalJson,
      indexContent: input.evidence.indexContent,
      payload: loaded.payload,
      sha256: input.sha256,
      limits: {
        maximumBlobCount: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobCountPerLevel,
        maximumBlobBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobBytes,
        maximumTotalBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
      },
    });
  } catch (error) {
    throw new Error(`${input.occurrenceId} persisted evidence container drifted from its index`, {
      cause: error,
    });
  }
  for (const blob of bundle.blobs) {
    if (blob.mediaType === "application/json") {
      assertNoPrivatePaths(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(blob.bytes)),
        input.repositoryRoot,
        `${input.occurrenceId} persisted JSON evidence`,
      );
    }
  }
  return bundle;
}

async function verifySerializedProcessing(input: {
  readonly row: P7TrainingLevelInventory;
  readonly processing: P7TrainingShardLevelProcessingV1;
  readonly repositoryRoot: string;
  readonly sha256: Sha256Port;
  readonly verifyEvidence: P7TrainingVerifyPersistedEvidence;
}): Promise<void> {
  const { row, processing } = input;
  const level = buildP7bTrainingReplayLevel(processing.trainingReplayLevel);
  if (
    level.source.packId !== row.packId
    || level.source.levelNumber !== row.levelNumber
    || level.source.title !== row.title
    || level.source.normalizedGameplaySha256 !== row.source.normalizedGameplaySha256
    || level.processing.status !== (processing.status === "complete" ? "complete" : "blocked")
  ) throw new Error(`${row.occurrenceId} reduced training contract is not bound to fresh inventory`);
  assertNoPrivatePaths(processing.detail, input.repositoryRoot, `${row.occurrenceId} process detail`);
  for (const target of ["ms", "lynx"] as const) {
    const expected = browserTargetForRow(row, target);
    if (canonicalizeJson(processing.browserTargets[target]) !== canonicalizeJson(expected)) {
      throw new Error(`${row.occurrenceId}/${target} reduced browser target drifted`);
    }
  }
  if (
    processing.browserReplays.length > P7_TRAINING_SHARD_LIMITS.maximumBrowserReplayCountPerLevel
    || processing.portableDecisionTraces.length
      > P7_TRAINING_SHARD_LIMITS.maximumPortableTraceCountPerLevel
  ) throw new Error(`${row.occurrenceId} reduced asset count exceeds its cap`);
  const copiedBrowserReplays = await Promise.all(processing.browserReplays.map(async (asset) => {
    const replay = parseP7TrainingBrowserReplay(asset.canonicalJson);
    return copyBrowserReplayInput({ ...asset, replay }, input.sha256);
  }));
  if (canonicalizeJson(copiedBrowserReplays) !== canonicalizeJson(processing.browserReplays)) {
    throw new Error(`${row.occurrenceId} reduced browser assets are not canonical`);
  }
  const expectedKeys = new Set(level.variants.flatMap((variant) => (
    (["ms", "lynx"] as const).flatMap((target) => {
      const certification = variant.certifications[target];
      return certification.execution.status === "native"
        || certification.execution.status === "compiled"
        ? [`${variant.variantId}:${target}`] : [];
    })
  )));
  const actualKeys = processing.browserReplays.map(({ variantId, target }) => (
    `${variantId}:${target}`
  ));
  if (
    new Set(actualKeys).size !== actualKeys.length
    || actualKeys.length !== expectedKeys.size
    || actualKeys.some((key) => !expectedKeys.has(key))
  ) throw new Error(`${row.occurrenceId} reduced browser matrix drifted`);
  assertBrowserAssetsBoundToLevel(row, level, copiedBrowserReplays);
  await Promise.all(processing.portableDecisionTraces.map((trace) => (
    copyPortableTrace(trace, input.sha256)
  )));
  const expectedPortable = level.variants.filter(({ kind }) => kind === "portable");
  if (processing.portableDecisionTraces.length !== expectedPortable.length) {
    throw new Error(`${row.occurrenceId} reduced portable trace set drifted`);
  }
  const evidence = await verifyLevelEvidenceIndex({
    occurrenceId: row.occurrenceId,
    evidence: processing.evidence,
    repositoryRoot: input.repositoryRoot,
    sha256: input.sha256,
    verifyEvidence: input.verifyEvidence,
  });
  await assertProcessedLevelAgainstInventory({
    row,
    level,
    evidence,
    sha256: input.sha256,
  });
  if (
    new TextEncoder().encode(canonicalizeJson(processing as unknown as CanonicalJsonValue)).byteLength
      > P7_TRAINING_SHARD_LIMITS.maximumLevelResultBytes
  ) throw new Error(`${row.occurrenceId} reduced level exceeds its canonical byte cap`);
}

async function verifyResult(
  result: P7TrainingShardResultArtifact,
  request: P7TrainingShardRequestArtifact,
  packContent: BlobReferenceV1,
  rows: readonly P7TrainingLevelInventory[],
  repositoryRoot: string,
  sha256: Sha256Port,
  verifyEvidence: P7TrainingVerifyPersistedEvidence,
): Promise<void> {
  await assertCanonicalArtifact({
    value: result.result,
    canonicalJson: result.canonicalJson,
    content: result.content,
    label: `P7 training shard ${request.request.partition.shardIndex} result`,
    sha256,
    maximumBytes: P7_TRAINING_SHARD_LIMITS.maximumResultBytes,
  });
  if (
    result.result.artifact !== P7_TRAINING_SHARD_RESULT_ARTIFACT
    || result.result.version !== 1
    || result.result.processorRevision !== P7_TRAINING_PROCESSOR_REVISION
    || !sameReference(result.result.requestContent, request.content)
    || !sameReference(result.result.inventory.packContent, packContent)
    || result.result.inventory.packId !== request.request.inventory.packId
    || canonicalizeJson(result.result.partition) !== canonicalizeJson(request.request.partition)
    || result.result.levels.length !== request.request.occurrences.length
  ) {
    throw new Error(`P7 training shard ${request.request.partition.shardIndex} result binding drifted`);
  }
  for (const [index, identity] of request.request.occurrences.entries()) {
    const level = result.result.levels[index];
    if (
      level === undefined
      || level.occurrenceId !== identity.occurrenceId
      || level.caseId !== identity.caseId
      || level.levelNumber !== identity.levelNumber
    ) {
      throw new Error(`P7 training shard ${request.request.partition.shardIndex} level order drifted`);
    }
    const row = rows[index];
    if (row === undefined || row.occurrenceId !== identity.occurrenceId) {
      throw new Error(`P7 training shard ${request.request.partition.shardIndex} fresh row drifted`);
    }
    await verifySerializedProcessing({
      row,
      processing: level.processing,
      repositoryRoot,
      sha256,
      verifyEvidence,
    });
  }
}

export async function reduceP7TrainingShards(input: {
  readonly repositoryRoot: string;
  readonly plan: P7TrainingShardPlan;
  readonly results: readonly P7TrainingShardResultArtifact[];
  readonly sha256: Sha256Port;
  readonly verifyEvidence: P7TrainingVerifyPersistedEvidence;
  readonly loadInventory?: P7TrainingInventoryLoader;
}): Promise<P7TrainingReducedPack> {
  if (input.plan.requests.length !== P7_TRAINING_SHARD_COUNT) {
    throw new Error("P7 training plan must contain exactly eight shard requests");
  }
  if (input.results.length !== P7_TRAINING_SHARD_COUNT) {
    throw new Error("P7 training reduction requires exactly eight shard results");
  }
  const inventory = await (input.loadInventory ?? loadCheckedTrainingCorpusInventory)(
    input.repositoryRoot,
    input.sha256,
  );
  const freshPlan = await buildP7TrainingShardPlan({
    inventory,
    packId: input.plan.packId,
    sha256: input.sha256,
  });
  if (
    !sameReference(freshPlan.packContent, input.plan.packContent)
    || freshPlan.requests.some((request, index) => (
      request.canonicalJson !== input.plan.requests[index]?.canonicalJson
    ))
  ) throw new Error("P7 training reduction plan does not match freshly checked inventory");
  const pack = requiredPack(inventory, input.plan.packId);
  const byShard = new Map<number, P7TrainingShardResultArtifact>();
  for (const result of input.results) {
    const shardIndex = result.result.partition.shardIndex;
    if (byShard.has(shardIndex)) {
      throw new Error(`duplicate shard result ${shardIndex}`);
    }
    byShard.set(shardIndex, result);
  }
  const levels: P7TrainingShardLevelResultV1[] = [];
  for (const request of freshPlan.requests) {
    const shardIndex = request.request.partition.shardIndex;
    const result = byShard.get(shardIndex);
    if (result === undefined) throw new Error(`missing shard result ${shardIndex}`);
    const start = request.request.partition.startLevelNumber - 1;
    const end = request.request.partition.endLevelNumber;
    await verifyResult(
      result,
      request,
      freshPlan.packContent,
      pack.levels.slice(start, end),
      input.repositoryRoot,
      input.sha256,
      input.verifyEvidence,
    );
    levels.push(...result.result.levels);
  }
  if (
    levels.length !== P7_TRAINING_LEVELS_PER_PACK
    || levels.some((entry, index) => entry.levelNumber !== index + 1)
  ) {
    throw new Error("P7 training reduction does not exactly cover 149 ordered official levels");
  }
  return {
    packId: input.plan.packId,
    packContent: { ...freshPlan.packContent },
    levels,
  };
}
