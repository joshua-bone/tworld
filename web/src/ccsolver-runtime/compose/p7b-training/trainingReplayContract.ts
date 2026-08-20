import {
  canonicalizeJson,
  parseCanonicalJson,
  type BlobReferenceV1,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
  P7B_MAX_PORTABLE_LOGIC_STEP,
} from "./portableReplayProfile";

export const P7B_TRAINING_LEVEL_ARTIFACT =
  "ccsolver-p7b-training-replay-level" as const;
export const P7B_TRAINING_PACK_SUMMARY_ARTIFACT =
  "ccsolver-p7b-training-replay-pack-summary" as const;

export const P7B_MAX_LEVEL_CONTRACT_BYTES = 8 * 1024 * 1024;
export const P7B_MAX_REFERENCED_BLOB_BYTES = 64 * 1024 * 1024;
export const P7B_MAX_RAW_DONORS_PER_LEVEL = 32;
export const P7B_MAX_VARIANTS_PER_LEVEL = 32;
export const P7B_MAX_SEGMENTS_PER_VARIANT = 8_192;
export const P7B_MAX_TRANSFORMS_PER_VARIANT = 8_192;
export const P7B_MAX_REPLAY_TICKS = 100_000_000;
export const P7B_MAX_REPLAY_DECISIONS = 1_000_000;
export const P7B_MAX_LEVELS_PER_PACK = 4_096;

const MAX_IDENTIFIER_BYTES = 512;
const MAX_TEXT_BYTES = 4_096;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RAW_SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export type P7bReplayTargetV1 = "ms" | "lynx";
export type TrainingReplayTargetV1 = P7bReplayTargetV1;

export type P7bSourceEligibilityStatusV1 = "eligible" | "ineligible";
export type P7bDonorCoverageStatusV1 = "not-assessed" | "bound" | "missing" | "invalid";
export type P7bMapRelationshipV1 =
  | "official-map"
  | "exact-gameplay-alias"
  | "edited-relative";
export type P7bReplayVariantKindV1 = "raw" | "portable";
export type P7bReplayLineageKindV1 =
  | "raw-donor"
  | "normalized-donor"
  | "generated-replacement";
export type P7bReplayPortabilityStatusV1 =
  | "pending"
  | "portable"
  | "target-specific"
  | "quirk-required"
  | "not-portable";
export type P7bReplayCertificationStatusV1 =
  | "certified"
  | "failed"
  | "not-attempted"
  | "unavailable";
export type P7bReplayCertificationOutcomeV1 =
  | "won"
  | "loss"
  | "diverged"
  | "timeout"
  | "invalid"
  | "not-run"
  | "unsupported";
export type P7bReplayExecutionStatusV1 =
  | "native"
  | "compiled"
  | "compilation-failed"
  | "not-attempted"
  | "unavailable";
export type P7bBrowserReplayTransportV1 =
  | "native-replay-pulses"
  | "manual-held-schedule";
export type P7bNativeBoundaryClockV1 = "exclusive-advance-count-v1";
export type P7bTrainingProcessingStatusV1 = "pending" | "complete" | "blocked";
export type P7bReplayAnchorKindV1 =
  | "start"
  | "route"
  | "collect"
  | "open"
  | "socket"
  | "button"
  | "block"
  | "transport"
  | "forced-movement"
  | "exit";
export type P7bReplayTransformKindV1 =
  | "mouse-goal-expanded"
  | "diagonal-expanded"
  | "diagonal-order-assigned"
  | "redundant-input-removed"
  | "input-rescheduled"
  | "explicit-wait-inserted"
  | "decision-boundary-rescheduled"
  | "route-repaired"
  | "generated-replacement";

export interface P7bTrainingSourceEligibilityV1 {
  readonly status: P7bSourceEligibilityStatusV1;
  readonly standardOnly: boolean;
  readonly policyRevision: string;
  readonly evidence: BlobReferenceV1;
}

export interface P7bTrainingReplaySourceV1 {
  readonly packId: string;
  readonly levelNumber: number;
  readonly title: string;
  readonly normalizedGameplaySha256: string;
  readonly levelContent: BlobReferenceV1;
  readonly eligibility: P7bTrainingSourceEligibilityV1;
}

export interface P7bDonorCoverageV1 {
  readonly status: P7bDonorCoverageStatusV1;
  readonly rawDonorId: string | null;
  readonly detail: string;
}

export interface P7bRawDonorReferenceV1 {
  readonly donorId: string;
  readonly target: P7bReplayTargetV1;
  readonly origin: "official-pack" | "voting-pack";
  readonly sourcePackId: string;
  readonly sourceLevelNumber: number;
  readonly sourceNormalizedGameplaySha256: string;
  readonly sourceLevelContent: BlobReferenceV1;
  readonly replayContent: BlobReferenceV1;
  readonly mapRelationship: P7bMapRelationshipV1;
  readonly mapComparisonEvidence: BlobReferenceV1 | null;
}

export interface P7bTrainingReplaySegmentV1 {
  readonly segmentId: string;
  readonly index: number;
  readonly label: string;
  readonly anchor: {
    readonly kind: P7bReplayAnchorKindV1;
    readonly label: string;
  };
}

export type TrainingReplaySegmentV1 = P7bTrainingReplaySegmentV1;

export interface P7bTrainingReplayTargetSpanV1 {
  readonly segmentId: string;
  readonly index: number;
  readonly startNativeTick: number;
  readonly endNativeTick: number;
  readonly startDecisionOrdinal: number | null;
  readonly endDecisionOrdinal: number | null;
  readonly startBoundaryEvidence: BlobReferenceV1;
  readonly endBoundaryEvidence: BlobReferenceV1;
}

export interface P7bPortableProfileBindingV1 {
  readonly profileId: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_ID;
  readonly profileRevision: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION;
  readonly profileContent: BlobReferenceV1;
  readonly decisionTraceContent: BlobReferenceV1;
  readonly changeCount: number;
  readonly terminalLogicStep: number;
}

export interface P7bReplayTransformRangeV1 {
  readonly startDecision: number;
  readonly endDecision: number;
}

export interface P7bReplayTransformV1 {
  readonly ordinal: number;
  readonly kind: P7bReplayTransformKindV1;
  readonly source: P7bReplayTransformRangeV1;
  readonly output: P7bReplayTransformRangeV1;
  readonly reason: string;
  readonly evidence: BlobReferenceV1 | null;
}

export interface P7bReplayLineageV1 {
  readonly kind: P7bReplayLineageKindV1;
  readonly rawDonorId: string | null;
  readonly sourceVariantId: string | null;
  readonly evidence: BlobReferenceV1 | null;
}

export interface P7bReplayDecisionProfileBindingV1 {
  readonly profileId: string;
  readonly profileRevision: string;
  readonly clockBasis: "native-tick" | "portable-decision";
  readonly cadenceHz: number;
  readonly profileContent: BlobReferenceV1 | null;
}

export interface P7bReplayExecutionBindingV1 {
  readonly status: P7bReplayExecutionStatusV1;
  readonly decisionProfile: P7bReplayDecisionProfileBindingV1 | null;
  readonly executedDecisionCount: number | null;
  readonly nativeBoundaryClock: P7bNativeBoundaryClockV1 | null;
  readonly nativeTickRateHz: number | null;
  readonly replayContent: BlobReferenceV1 | null;
  readonly browserReplayContent: BlobReferenceV1 | null;
  readonly browserReplayParityReceipt: BlobReferenceV1 | null;
  readonly browserReplayTransport: P7bBrowserReplayTransportV1 | null;
  readonly compilerRevision: string | null;
  readonly compilationReceipt: BlobReferenceV1 | null;
  readonly detail: string;
}

export interface P7bReplayCertificationV1 {
  readonly status: P7bReplayCertificationStatusV1;
  readonly outcome: P7bReplayCertificationOutcomeV1;
  readonly evidence: BlobReferenceV1 | null;
  readonly terminalNativeTick: number | null;
  readonly detail: string;
  readonly execution: P7bReplayExecutionBindingV1;
  readonly segmentSpans: readonly P7bTrainingReplayTargetSpanV1[];
}

export interface P7bTrainingReplayVariantV1 {
  readonly variantId: string;
  readonly kind: P7bReplayVariantKindV1;
  readonly replayContent: BlobReferenceV1;
  readonly decisionCount: number;
  readonly portableProfile: P7bPortableProfileBindingV1 | null;
  readonly lineage: P7bReplayLineageV1;
  readonly portability: P7bReplayPortabilityStatusV1;
  readonly transforms: readonly P7bReplayTransformV1[];
  readonly segments: readonly P7bTrainingReplaySegmentV1[];
  readonly certifications: {
    readonly ms: P7bReplayCertificationV1;
    readonly lynx: P7bReplayCertificationV1;
  };
}

export interface P7bTrainingReplayLevelV1 {
  readonly artifact: typeof P7B_TRAINING_LEVEL_ARTIFACT;
  readonly version: 1;
  readonly source: P7bTrainingReplaySourceV1;
  readonly donorCoverage: {
    readonly ms: P7bDonorCoverageV1;
    readonly lynx: P7bDonorCoverageV1;
  };
  readonly rawDonors: readonly P7bRawDonorReferenceV1[];
  readonly variants: readonly P7bTrainingReplayVariantV1[];
  readonly processing: {
    readonly status: P7bTrainingProcessingStatusV1;
    readonly detail: string;
  };
  readonly viewableVariantId: string | null;
}

export interface P7bTrainingPackSummaryV1 {
  readonly artifact: typeof P7B_TRAINING_PACK_SUMMARY_ARTIFACT;
  readonly version: 1;
  readonly packId: string;
  readonly totals: {
    readonly levels: number;
    readonly targets: number;
    readonly viewableLevels: number;
    readonly rawDonors: number;
    readonly variants: number;
    readonly variantTargetCertifications: number;
  };
  readonly sources: {
    readonly eligible: number;
    readonly ineligible: number;
    readonly standardOnly: number;
  };
  readonly processing: {
    readonly pending: number;
    readonly complete: number;
    readonly blocked: number;
  };
  readonly donorCoverage: {
    readonly notAssessed: number;
    readonly bound: number;
    readonly missing: number;
    readonly invalid: number;
  };
  readonly mapRelationships: {
    readonly officialMap: number;
    readonly exactGameplayAlias: number;
    readonly editedRelative: number;
  };
  readonly variants: {
    readonly raw: number;
    readonly portable: number;
  };
  readonly portability: {
    readonly pending: number;
    readonly portable: number;
    readonly targetSpecific: number;
    readonly quirkRequired: number;
    readonly notPortable: number;
  };
  readonly executions: {
    readonly native: number;
    readonly compiled: number;
    readonly compilationFailed: number;
    readonly notAttempted: number;
    readonly unavailable: number;
  };
  readonly certifications: {
    readonly certified: number;
    readonly failed: number;
    readonly notAttempted: number;
    readonly unavailable: number;
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new Error(`${description} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  description: string,
): Record<string, unknown> {
  const record = requireRecord(value, description);
  const actual = Object.keys(record).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${description} has an unsupported shape`);
  }
  return record;
}

function requireArray(
  value: unknown,
  minimum: number,
  maximum: number,
  description: string,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${description} is out of bounds`);
  }
  return value;
}

function requireSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  description: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) {
    throw new Error(`${description} is out of bounds`);
  }
  return value as number;
}

function requireDurableText(
  value: unknown,
  maximumBytes: number,
  description: string,
): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\r")
    || value.includes("\n")
    || value.includes("\0")
    || utf8Length(value) > maximumBytes
  ) {
    throw new Error(`${description} is invalid`);
  }
  return value;
}

function requireNullableIdentifier(value: unknown, description: string): string | null {
  return value === null
    ? null
    : requireDurableText(value, MAX_IDENTIFIER_BYTES, description);
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  description: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${description} is invalid`);
  }
  return value as T;
}

function copyBlobReference(value: unknown, description: string): BlobReferenceV1 {
  const record = exactKeys(value, ["byteLength", "digest"], description);
  if (typeof record.digest !== "string" || !SHA256_PATTERN.test(record.digest)) {
    throw new Error(`${description} digest is invalid`);
  }
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: requireSafeInteger(
      record.byteLength,
      0,
      P7B_MAX_REFERENCED_BLOB_BYTES,
      `${description} byte length`,
    ),
  };
}

function copyNullableBlobReference(
  value: unknown,
  description: string,
): BlobReferenceV1 | null {
  return value === null ? null : copyBlobReference(value, description);
}

function sameReference(
  left: BlobReferenceV1,
  right: BlobReferenceV1,
): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function copyEligibility(value: unknown): P7bTrainingSourceEligibilityV1 {
  const record = exactKeys(
    value,
    ["evidence", "policyRevision", "standardOnly", "status"],
    "source eligibility",
  );
  if (typeof record.standardOnly !== "boolean") {
    throw new Error("source standard-only finding is invalid");
  }
  return {
    status: requireEnum(
      record.status,
      ["eligible", "ineligible"] as const,
      "source eligibility status",
    ),
    standardOnly: record.standardOnly,
    policyRevision: requireDurableText(
      record.policyRevision,
      MAX_TEXT_BYTES,
      "source eligibility policy revision",
    ),
    evidence: copyBlobReference(record.evidence, "source eligibility evidence"),
  };
}

function copySource(value: unknown): P7bTrainingReplaySourceV1 {
  const record = exactKeys(value, [
    "eligibility",
    "levelContent",
    "levelNumber",
    "normalizedGameplaySha256",
    "packId",
    "title",
  ], "training replay source");
  if (
    typeof record.normalizedGameplaySha256 !== "string"
    || !RAW_SHA256_PATTERN.test(record.normalizedGameplaySha256)
  ) {
    throw new Error("official level gameplay digest is invalid");
  }
  return {
    packId: requireDurableText(record.packId, MAX_IDENTIFIER_BYTES, "source pack id"),
    levelNumber: requireSafeInteger(record.levelNumber, 1, 65_535, "source level number"),
    title: requireDurableText(record.title, MAX_TEXT_BYTES, "source title"),
    normalizedGameplaySha256: record.normalizedGameplaySha256,
    levelContent: copyBlobReference(record.levelContent, "official level content"),
    eligibility: copyEligibility(record.eligibility),
  };
}

function copyDonorCoverage(value: unknown, target: P7bReplayTargetV1): P7bDonorCoverageV1 {
  const record = exactKeys(
    value,
    ["detail", "rawDonorId", "status"],
    `${target} donor coverage`,
  );
  const status = requireEnum(
    record.status,
    ["not-assessed", "bound", "missing", "invalid"] as const,
    `${target} donor coverage status`,
  );
  const rawDonorId = requireNullableIdentifier(
    record.rawDonorId,
    `${target} donor coverage id`,
  );
  if ((status === "missing" || status === "not-assessed") !== (rawDonorId === null)) {
    throw new Error(`${target} absent donor coverage must not conceal a donor id`);
  }
  return {
    status,
    rawDonorId,
    detail: requireDurableText(record.detail, MAX_TEXT_BYTES, `${target} donor coverage detail`),
  };
}

function copyRawDonor(
  value: unknown,
  official: P7bTrainingReplaySourceV1,
): P7bRawDonorReferenceV1 {
  const record = exactKeys(value, [
    "donorId",
    "mapComparisonEvidence",
    "mapRelationship",
    "origin",
    "replayContent",
    "sourceLevelContent",
    "sourceLevelNumber",
    "sourceNormalizedGameplaySha256",
    "sourcePackId",
    "target",
  ], "raw donor reference");
  const sourceDigest = record.sourceNormalizedGameplaySha256;
  if (typeof sourceDigest !== "string" || !RAW_SHA256_PATTERN.test(sourceDigest)) {
    throw new Error("raw donor source gameplay digest is invalid");
  }
  const origin = requireEnum(
    record.origin,
    ["official-pack", "voting-pack"] as const,
    "raw donor origin",
  );
  const relationship = requireEnum(
    record.mapRelationship,
    ["official-map", "exact-gameplay-alias", "edited-relative"] as const,
    "raw donor map relationship",
  );
  const sourcePackId = requireDurableText(
    record.sourcePackId,
    MAX_IDENTIFIER_BYTES,
    "raw donor source pack id",
  );
  const sourceLevelNumber = requireSafeInteger(
    record.sourceLevelNumber,
    1,
    65_535,
    "raw donor source level number",
  );
  const sourceLevelContent = copyBlobReference(
    record.sourceLevelContent,
    "raw donor source level content",
  );
  const comparisonEvidence = copyNullableBlobReference(
    record.mapComparisonEvidence,
    "raw donor map comparison evidence",
  );

  if (relationship === "official-map") {
    if (
      origin !== "official-pack"
      || sourcePackId !== official.packId
      || sourceLevelNumber !== official.levelNumber
      || sourceDigest !== official.normalizedGameplaySha256
      || !sameReference(sourceLevelContent, official.levelContent)
      || comparisonEvidence !== null
    ) {
      throw new Error("official-map donor must bind the exact official source");
    }
  } else if (relationship === "exact-gameplay-alias") {
    if (origin !== "voting-pack") {
      throw new Error("exact alias donor must come from a voting pack");
    }
    if (sourceDigest !== official.normalizedGameplaySha256) {
      throw new Error("exact alias gameplay digest must match the official level");
    }
  } else {
    if (origin !== "voting-pack") {
      throw new Error("edited relative donor must come from a voting pack");
    }
    if (sourceDigest === official.normalizedGameplaySha256) {
      throw new Error("edited relative must not claim exact gameplay identity");
    }
    if (comparisonEvidence === null) {
      throw new Error("edited relative requires map comparison evidence");
    }
  }

  return {
    donorId: requireDurableText(record.donorId, MAX_IDENTIFIER_BYTES, "raw donor id"),
    target: requireEnum(record.target, ["ms", "lynx"] as const, "raw donor target"),
    origin,
    sourcePackId,
    sourceLevelNumber,
    sourceNormalizedGameplaySha256: sourceDigest,
    sourceLevelContent,
    replayContent: copyBlobReference(record.replayContent, "raw donor replay content"),
    mapRelationship: relationship,
    mapComparisonEvidence: comparisonEvidence,
  };
}

export function assertTrainingReplaySegmentV1(
  value: unknown,
): TrainingReplaySegmentV1 {
  const record = exactKeys(
    value,
    ["anchor", "index", "label", "segmentId"],
    "training replay segment",
  );
  const anchor = exactKeys(record.anchor, ["kind", "label"], "segment anchor");
  return {
    segmentId: requireDurableText(record.segmentId, MAX_IDENTIFIER_BYTES, "segment id"),
    index: requireSafeInteger(
      record.index,
      0,
      P7B_MAX_SEGMENTS_PER_VARIANT - 1,
      "segment index",
    ),
    label: requireDurableText(record.label, MAX_TEXT_BYTES, "segment label"),
    anchor: {
      kind: requireEnum(anchor.kind, [
        "start",
        "route",
        "collect",
        "open",
        "socket",
        "button",
        "block",
        "transport",
        "forced-movement",
        "exit",
      ] as const, "segment anchor kind"),
      label: requireDurableText(anchor.label, MAX_TEXT_BYTES, "segment anchor label"),
    },
  };
}

function copySegments(
  value: unknown,
): readonly P7bTrainingReplaySegmentV1[] {
  const entries = requireArray(
    value,
    1,
    P7B_MAX_SEGMENTS_PER_VARIANT,
    "training replay segments",
  );
  const segments = entries.map(assertTrainingReplaySegmentV1);
  const ids = new Set<string>();
  for (const [index, segment] of segments.entries()) {
    if (segment.index !== index) {
      throw new Error("segment indexes must be contiguous from zero");
    }
    if (ids.has(segment.segmentId)) {
      throw new Error(`duplicate segment id: ${segment.segmentId}`);
    }
    ids.add(segment.segmentId);
  }
  return segments;
}

function copyTransformRange(
  value: unknown,
  maximum: number,
  description: string,
): P7bReplayTransformRangeV1 {
  const record = exactKeys(value, ["endDecision", "startDecision"], description);
  const startDecision = requireSafeInteger(
    record.startDecision,
    0,
    maximum,
    `${description} start`,
  );
  const endDecision = requireSafeInteger(
    record.endDecision,
    startDecision,
    maximum,
    `${description} end`,
  );
  return { startDecision, endDecision };
}

function copyTransforms(
  value: unknown,
  outputDecisionCount: number,
): readonly P7bReplayTransformV1[] {
  const entries = requireArray(
    value,
    0,
    P7B_MAX_TRANSFORMS_PER_VARIANT,
    "replay transform ledger",
  );
  const transforms = entries.map((entry, index): P7bReplayTransformV1 => {
    const record = exactKeys(entry, [
      "evidence",
      "kind",
      "ordinal",
      "output",
      "reason",
      "source",
    ], "replay transform");
    const ordinal = requireSafeInteger(
      record.ordinal,
      0,
      P7B_MAX_TRANSFORMS_PER_VARIANT - 1,
      "transform ordinal",
    );
    if (ordinal !== index) {
      throw new Error("transform ordinal is invalid");
    }
    return {
      ordinal,
      kind: requireEnum(record.kind, [
        "mouse-goal-expanded",
        "diagonal-expanded",
        "diagonal-order-assigned",
        "redundant-input-removed",
        "input-rescheduled",
        "explicit-wait-inserted",
        "decision-boundary-rescheduled",
        "route-repaired",
        "generated-replacement",
      ] as const, "transform kind"),
      source: copyTransformRange(
        record.source,
        P7B_MAX_REPLAY_DECISIONS,
        "transform source decision range",
      ),
      output: copyTransformRange(
        record.output,
        outputDecisionCount,
        "transform output decision range",
      ),
      reason: requireDurableText(record.reason, MAX_TEXT_BYTES, "transform reason"),
      evidence: copyNullableBlobReference(record.evidence, "transform evidence"),
    };
  });
  for (let index = 1; index < transforms.length; index += 1) {
    const previous = transforms[index - 1]!;
    const current = transforms[index]!;
    if (current.source.startDecision < previous.source.endDecision) {
      throw new Error("transform source ranges must be ordered and non-overlapping");
    }
    if (current.output.startDecision < previous.output.endDecision) {
      throw new Error("transform output ranges must be ordered and non-overlapping");
    }
  }
  return transforms;
}

function copyLineage(value: unknown): P7bReplayLineageV1 {
  const record = exactKeys(
    value,
    ["evidence", "kind", "rawDonorId", "sourceVariantId"],
    "replay lineage",
  );
  return {
    kind: requireEnum(record.kind, [
      "raw-donor",
      "normalized-donor",
      "generated-replacement",
    ] as const, "replay lineage kind"),
    rawDonorId: requireNullableIdentifier(record.rawDonorId, "lineage raw donor id"),
    sourceVariantId: requireNullableIdentifier(
      record.sourceVariantId,
      "lineage source variant id",
    ),
    evidence: copyNullableBlobReference(record.evidence, "replay lineage evidence"),
  };
}

function copyPortableProfile(
  value: unknown,
  replayContent: BlobReferenceV1,
  decisionCount: number,
): P7bPortableProfileBindingV1 | null {
  if (value === null) {
    return null;
  }
  const record = exactKeys(value, [
    "changeCount",
    "decisionTraceContent",
    "profileContent",
    "profileId",
    "profileRevision",
    "terminalLogicStep",
  ], "portable profile binding");
  if (
    record.profileId !== P7B_HYBRIDCC_CANDIDATE_PROFILE_ID
    || record.profileRevision !== P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION
  ) {
    throw new Error("portable profile binding is unsupported");
  }
  const decisionTraceContent = copyBlobReference(
    record.decisionTraceContent,
    "portable decision trace content",
  );
  if (!sameReference(decisionTraceContent, replayContent)) {
    throw new Error("portable variant replay must equal its decision trace");
  }
  const changeCount = requireSafeInteger(
    record.changeCount,
    0,
    P7B_MAX_REPLAY_DECISIONS,
    "portable profile change count",
  );
  if (changeCount !== decisionCount) {
    throw new Error("portable profile change count disagrees with the variant");
  }
  return {
    profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
    profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
    profileContent: copyBlobReference(record.profileContent, "portable profile content"),
    decisionTraceContent,
    changeCount,
    terminalLogicStep: requireSafeInteger(
      record.terminalLogicStep,
      0,
      P7B_MAX_PORTABLE_LOGIC_STEP,
      "portable profile terminal logic step",
    ),
  };
}

function copyDecisionProfile(
  value: unknown,
  description: string,
): P7bReplayDecisionProfileBindingV1 {
  const record = exactKeys(value, [
    "cadenceHz",
    "clockBasis",
    "profileContent",
    "profileId",
    "profileRevision",
  ], description);
  return {
    profileId: requireDurableText(record.profileId, MAX_IDENTIFIER_BYTES, `${description} id`),
    profileRevision: requireDurableText(
      record.profileRevision,
      MAX_IDENTIFIER_BYTES,
      `${description} revision`,
    ),
    clockBasis: requireEnum(
      record.clockBasis,
      ["native-tick", "portable-decision"] as const,
      `${description} clock basis`,
    ),
    cadenceHz: requireSafeInteger(record.cadenceHz, 1, 1_000, `${description} cadence`),
    profileContent: copyNullableBlobReference(
      record.profileContent,
      `${description} content`,
    ),
  };
}

function copyExecution(
  value: unknown,
  target: P7bReplayTargetV1,
  portableProfile: P7bPortableProfileBindingV1 | null,
  authoredDecisionCount: number,
): P7bReplayExecutionBindingV1 {
  const record = exactKeys(value, [
    "browserReplayContent",
    "browserReplayParityReceipt",
    "browserReplayTransport",
    "compilationReceipt",
    "compilerRevision",
    "decisionProfile",
    "detail",
    "executedDecisionCount",
    "nativeBoundaryClock",
    "nativeTickRateHz",
    "replayContent",
    "status",
  ], `${target} execution`);
  const status = requireEnum(record.status, [
    "native",
    "compiled",
    "compilation-failed",
    "not-attempted",
    "unavailable",
  ] as const, `${target} execution status`);
  const decisionProfile = record.decisionProfile === null
    ? null
    : copyDecisionProfile(record.decisionProfile, `${target} decision profile`);
  const executedDecisionCount = record.executedDecisionCount === null
    ? null
    : requireSafeInteger(
      record.executedDecisionCount,
      0,
      authoredDecisionCount,
      `${target} executed decision count`,
    );
  const nativeBoundaryClock = record.nativeBoundaryClock === null
    ? null
    : requireEnum(
      record.nativeBoundaryClock,
      ["exclusive-advance-count-v1"] as const,
      `${target} native boundary clock`,
    );
  const nativeTickRateHz = record.nativeTickRateHz === null
    ? null
    : requireSafeInteger(
      record.nativeTickRateHz,
      1,
      1_000,
      `${target} native tick rate`,
    );
  const replayContent = copyNullableBlobReference(
    record.replayContent,
    `${target} execution replay`,
  );
  const browserReplayContent = copyNullableBlobReference(
    record.browserReplayContent,
    `${target} browser replay envelope`,
  );
  const browserReplayParityReceipt = copyNullableBlobReference(
    record.browserReplayParityReceipt,
    `${target} browser replay parity receipt`,
  );
  const browserReplayTransport = record.browserReplayTransport === null
    ? null
    : requireEnum(
      record.browserReplayTransport,
      ["native-replay-pulses", "manual-held-schedule"] as const,
      `${target} browser replay transport`,
    );
  const compilerRevision = requireNullableIdentifier(
    record.compilerRevision,
    `${target} compiler revision`,
  );
  const compilationReceipt = copyNullableBlobReference(
    record.compilationReceipt,
    `${target} compilation receipt`,
  );
  if (status === "native") {
    if (
      decisionProfile === null
      || executedDecisionCount !== authoredDecisionCount
      || nativeBoundaryClock !== "exclusive-advance-count-v1"
      || decisionProfile.clockBasis !== "native-tick"
      || decisionProfile.profileContent !== null
      || nativeTickRateHz === null
      || replayContent === null
      || browserReplayContent === null
      || browserReplayParityReceipt === null
      || browserReplayTransport !== "native-replay-pulses"
      || compilerRevision !== null
      || compilationReceipt !== null
    ) {
      throw new Error("native execution binding is invalid");
    }
  } else if (status === "compiled" || status === "compilation-failed") {
    if (
      portableProfile === null
      || decisionProfile === null
      || (status === "compiled" && executedDecisionCount === null)
      || (status === "compilation-failed" && executedDecisionCount !== null)
      || nativeBoundaryClock !== "exclusive-advance-count-v1"
      || decisionProfile.profileId !== P7B_HYBRIDCC_CANDIDATE_PROFILE_ID
      || decisionProfile.profileRevision !== P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION
      || decisionProfile.clockBasis !== "portable-decision"
      || decisionProfile.cadenceHz !== 10
      || decisionProfile.profileContent === null
      || !sameReference(decisionProfile.profileContent, portableProfile.profileContent)
    ) {
      throw new Error("compiled execution must use the portable 10 Hz decision profile");
    }
    if (
      compilerRevision === null
      || compilationReceipt === null
      || (status === "compiled" && (replayContent === null || nativeTickRateHz === null))
      || (status === "compiled" && browserReplayContent === null)
      || (status === "compiled" && browserReplayParityReceipt === null)
      || (status === "compilation-failed" && (
        replayContent !== null
        || browserReplayContent !== null
        || browserReplayParityReceipt !== null
        || browserReplayTransport !== null
      ))
    ) {
      throw new Error("compiled execution requires replay, compiler, and receipt");
    }
    if (status === "compiled" && browserReplayTransport !== "manual-held-schedule") {
      throw new Error(
        "compiled execution requires replay, compiler, receipt, and manual browser transport",
      );
    }
  } else if (
    decisionProfile !== null
    || executedDecisionCount !== null
    || nativeBoundaryClock !== null
    || nativeTickRateHz !== null
    || replayContent !== null
    || browserReplayContent !== null
    || browserReplayParityReceipt !== null
    || browserReplayTransport !== null
    || compilerRevision !== null
    || compilationReceipt !== null
  ) {
    throw new Error("unevaluated execution cannot carry hidden execution data");
  }
  return {
    status,
    decisionProfile,
    executedDecisionCount,
    nativeBoundaryClock,
    nativeTickRateHz,
    replayContent,
    browserReplayContent,
    browserReplayParityReceipt,
    browserReplayTransport,
    compilerRevision,
    compilationReceipt,
    detail: requireDurableText(record.detail, MAX_TEXT_BYTES, `${target} execution detail`),
  };
}

function copyTargetSpan(
  value: unknown,
  terminalNativeTick: number,
  decisionCount: number,
): P7bTrainingReplayTargetSpanV1 {
  const record = exactKeys(value, [
    "endBoundaryEvidence",
    "endDecisionOrdinal",
    "endNativeTick",
    "index",
    "segmentId",
    "startBoundaryEvidence",
    "startDecisionOrdinal",
    "startNativeTick",
  ], "training replay target span");
  const startNativeTick = requireSafeInteger(
    record.startNativeTick,
    0,
    terminalNativeTick,
    "target segment start native tick",
  );
  const endNativeTick = requireSafeInteger(
    record.endNativeTick,
    startNativeTick,
    terminalNativeTick,
    "target segment end native tick",
  );
  if (endNativeTick <= startNativeTick) {
    throw new Error("target segment native tick range must be non-empty");
  }
  const startDecisionOrdinal = record.startDecisionOrdinal === null
    ? null
    : requireSafeInteger(
      record.startDecisionOrdinal,
      0,
      decisionCount,
      "target segment start decision ordinal",
    );
  const endDecisionOrdinal = record.endDecisionOrdinal === null
    ? null
    : requireSafeInteger(
      record.endDecisionOrdinal,
      startDecisionOrdinal ?? 0,
      decisionCount,
      "target segment end decision ordinal",
    );
  if ((startDecisionOrdinal === null) !== (endDecisionOrdinal === null)) {
    throw new Error("target segment decision ordinal range is incomplete");
  }
  return {
    segmentId: requireDurableText(record.segmentId, MAX_IDENTIFIER_BYTES, "target segment id"),
    index: requireSafeInteger(
      record.index,
      0,
      P7B_MAX_SEGMENTS_PER_VARIANT - 1,
      "target segment index",
    ),
    startNativeTick,
    endNativeTick,
    startDecisionOrdinal,
    endDecisionOrdinal,
    startBoundaryEvidence: copyBlobReference(
      record.startBoundaryEvidence,
      "target segment start boundary evidence",
    ),
    endBoundaryEvidence: copyBlobReference(
      record.endBoundaryEvidence,
      "target segment end boundary evidence",
    ),
  };
}

function copyTargetSpans(
  value: unknown,
  segments: readonly P7bTrainingReplaySegmentV1[],
  terminalNativeTick: number,
  authoredDecisionCount: number,
  executedDecisionCount: number | null,
  portable: boolean,
): readonly P7bTrainingReplayTargetSpanV1[] {
  const entries = requireArray(
    value,
    segments.length,
    segments.length,
    "certified target segment spans",
  );
  const spans = entries.map((entry) =>
    copyTargetSpan(entry, terminalNativeTick, authoredDecisionCount));
  for (const [index, span] of spans.entries()) {
    const semantic = segments[index]!;
    if (span.index !== index || span.segmentId !== semantic.segmentId) {
      throw new Error("target segment spans disagree with stable semantic segments");
    }
    if (portable && span.startDecisionOrdinal === null) {
      throw new Error("portable target spans require decision ordinals");
    }
    if (!portable && span.startDecisionOrdinal !== null) {
      throw new Error("native target spans cannot claim portable decision ordinals");
    }
    if (index === 0) {
      if (
        span.startNativeTick !== 0
        || (portable && span.startDecisionOrdinal !== 0)
      ) {
        throw new Error("target segments must start at certified replay origin");
      }
      continue;
    }
    const previous = spans[index - 1]!;
    if (span.startNativeTick !== previous.endNativeTick) {
      throw new Error("target segment native tick ranges must be adjacent");
    }
    if (
      portable
      && span.startDecisionOrdinal !== previous.endDecisionOrdinal
    ) {
      throw new Error("target segment decision ranges must be adjacent");
    }
    if (!sameReference(span.startBoundaryEvidence, previous.endBoundaryEvidence)) {
      throw new Error("target segment boundary evidence must join exactly");
    }
  }
  const final = spans.at(-1)!;
  if (
    final.endNativeTick !== terminalNativeTick
    || (portable && final.endDecisionOrdinal !== executedDecisionCount)
  ) {
    throw new Error("target segments must end at certified replay totals");
  }
  return spans;
}

function copyCertification(
  value: unknown,
  target: P7bReplayTargetV1,
  variant: {
    readonly decisionCount: number;
    readonly portableProfile: P7bPortableProfileBindingV1 | null;
    readonly segments: readonly P7bTrainingReplaySegmentV1[];
  },
): P7bReplayCertificationV1 {
  const record = exactKeys(value, [
    "detail",
    "evidence",
    "execution",
    "outcome",
    "segmentSpans",
    "status",
    "terminalNativeTick",
  ], `${target} certification`);
  const status = requireEnum(record.status, [
    "certified",
    "failed",
    "not-attempted",
    "unavailable",
  ] as const, "certification status");
  const outcome = requireEnum(record.outcome, [
    "won",
    "loss",
    "diverged",
    "timeout",
    "invalid",
    "not-run",
    "unsupported",
  ] as const, "certification outcome");
  const evidence = copyNullableBlobReference(record.evidence, `${target} certification evidence`);
  const terminalNativeTick = record.terminalNativeTick === null
    ? null
    : requireSafeInteger(
      record.terminalNativeTick,
      1,
      P7B_MAX_REPLAY_TICKS,
      `${target} certification terminal native tick`,
    );
  const execution = copyExecution(
    record.execution,
    target,
    variant.portableProfile,
    variant.decisionCount,
  );
  let segmentSpans: readonly P7bTrainingReplayTargetSpanV1[];
  if (status === "certified") {
    if (
      outcome !== "won"
      || evidence === null
      || terminalNativeTick === null
      || (execution.status !== "native" && execution.status !== "compiled")
    ) {
      throw new Error("certified replay requires evidence, execution, win, and terminal tick");
    }
    segmentSpans = copyTargetSpans(
      record.segmentSpans,
      variant.segments,
      terminalNativeTick,
      variant.decisionCount,
      execution.executedDecisionCount,
      execution.status === "compiled",
    );
  } else {
    segmentSpans = requireArray(record.segmentSpans, 0, 0, "uncertified target spans") as [];
    if (
      status === "failed"
      && (
        !["loss", "diverged", "timeout", "invalid"].includes(outcome)
        || evidence === null
        || (execution.status !== "native" && execution.status !== "compiled")
      )
    ) {
      throw new Error("failed replay requires execution and failure evidence");
    }
    if (
      status === "not-attempted"
      && (
        outcome !== "not-run"
        || evidence !== null
        || terminalNativeTick !== null
        || execution.status !== "not-attempted"
      )
    ) {
      throw new Error("not-attempted certification must remain explicitly unevaluated");
    }
    if (
      status === "unavailable"
      && (
        outcome !== "unsupported"
        || evidence !== null
        || terminalNativeTick !== null
        || !["unavailable", "compilation-failed"].includes(execution.status)
      )
    ) {
      throw new Error("unavailable certification must remain explicitly unsupported");
    }
  }
  return {
    status,
    outcome,
    evidence,
    terminalNativeTick,
    detail: requireDurableText(record.detail, MAX_TEXT_BYTES, `${target} certification detail`),
    execution,
    segmentSpans,
  };
}

function copyVariant(value: unknown): P7bTrainingReplayVariantV1 {
  const record = exactKeys(value, [
    "certifications",
    "decisionCount",
    "kind",
    "lineage",
    "portability",
    "portableProfile",
    "replayContent",
    "segments",
    "transforms",
    "variantId",
  ], "training replay variant");
  const kind = requireEnum(record.kind, ["raw", "portable"] as const, "variant kind");
  const replayContent = copyBlobReference(record.replayContent, "variant replay content");
  const decisionCount = requireSafeInteger(
    record.decisionCount,
    0,
    P7B_MAX_REPLAY_DECISIONS,
    "variant replay decision count",
  );
  if (kind === "raw" && record.portableProfile !== null) {
    throw new Error("raw variant cannot claim a portable profile");
  }
  const portableProfile = copyPortableProfile(
    record.portableProfile,
    replayContent,
    decisionCount,
  );
  if (kind === "portable" && portableProfile === null) {
    throw new Error("portable variant requires the Hybrid candidate profile");
  }
  const segments = copySegments(record.segments);
  const certifications = exactKeys(record.certifications, ["lynx", "ms"], "certifications");
  const certificationInput = { decisionCount, portableProfile, segments };
  const result: P7bTrainingReplayVariantV1 = {
    variantId: requireDurableText(record.variantId, MAX_IDENTIFIER_BYTES, "variant id"),
    kind,
    replayContent,
    decisionCount,
    portableProfile,
    lineage: copyLineage(record.lineage),
    portability: requireEnum(record.portability, [
      "pending",
      "portable",
      "target-specific",
      "quirk-required",
      "not-portable",
    ] as const, "variant portability"),
    transforms: copyTransforms(record.transforms, decisionCount),
    segments,
    certifications: {
      ms: copyCertification(certifications.ms, "ms", certificationInput),
      lynx: copyCertification(certifications.lynx, "lynx", certificationInput),
    },
  };
  if (
    result.portability === "portable"
    && (
      result.certifications.ms.status !== "certified"
      || result.certifications.lynx.status !== "certified"
    )
  ) {
    throw new Error("portable replay requires certification on both targets");
  }
  if (
    result.portability === "target-specific"
    && result.certifications.ms.status !== "certified"
    && result.certifications.lynx.status !== "certified"
  ) {
    throw new Error("target-specific replay requires a certified target");
  }
  return result;
}

function assertDonorCoverageBindings(
  coverage: P7bTrainingReplayLevelV1["donorCoverage"],
  donors: ReadonlyMap<string, P7bRawDonorReferenceV1>,
): void {
  for (const target of ["ms", "lynx"] as const) {
    const slot = coverage[target];
    if (slot.rawDonorId === null) {
      continue;
    }
    const donor = donors.get(slot.rawDonorId);
    if (donor === undefined) {
      throw new Error(`${target} donor coverage points to an unknown raw donor`);
    }
    if (donor.target !== target) {
      throw new Error(`${target} donor coverage points to the wrong target`);
    }
  }
}

function assertVariantLineage(
  variant: P7bTrainingReplayVariantV1,
  donors: ReadonlyMap<string, P7bRawDonorReferenceV1>,
  variants: ReadonlyMap<string, P7bTrainingReplayVariantV1>,
): void {
  const { lineage } = variant;
  if (variant.kind === "raw") {
    if (
      lineage.kind !== "raw-donor"
      || lineage.rawDonorId === null
      || lineage.sourceVariantId !== null
      || lineage.evidence !== null
      || variant.transforms.length !== 0
    ) {
      throw new Error("raw variant lineage is invalid");
    }
    const donor = donors.get(lineage.rawDonorId);
    if (donor === undefined) {
      throw new Error("raw variant points to an unknown donor");
    }
    if (!sameReference(variant.replayContent, donor.replayContent)) {
      throw new Error("raw variant replay must equal its donor replay");
    }
    for (const target of ["ms", "lynx"] as const) {
      const execution = variant.certifications[target].execution;
      if (execution.status !== "native") {
        continue;
      }
      if (
        donor.target !== target
        || execution.replayContent === null
        || !sameReference(execution.replayContent, donor.replayContent)
      ) {
        throw new Error("native execution replay must equal the raw donor replay");
      }
    }
    return;
  }

  if (["ms", "lynx"].some((target) =>
    variant.certifications[target as P7bReplayTargetV1].execution.status === "native",
  )) {
    throw new Error("portable variant cannot claim native donor execution");
  }

  if (lineage.kind === "raw-donor") {
    throw new Error("portable replay cannot claim raw-donor lineage");
  }
  if (lineage.kind === "generated-replacement") {
    if (
      lineage.rawDonorId !== null
      || lineage.sourceVariantId !== null
      || lineage.evidence === null
      || !variant.transforms.some((entry) => entry.kind === "generated-replacement")
    ) {
      throw new Error("generated replacement lineage is incomplete");
    }
    for (const transform of variant.transforms) {
      if (transform.source.startDecision !== 0 || transform.source.endDecision !== 0) {
        throw new Error("generated replacement transform cannot claim donor decisions");
      }
    }
    return;
  }

  if (
    lineage.rawDonorId === null
    || lineage.sourceVariantId === null
    || lineage.evidence === null
  ) {
    throw new Error("normalized donor lineage is incomplete");
  }
  const donor = donors.get(lineage.rawDonorId);
  const sourceVariant = variants.get(lineage.sourceVariantId);
  if (donor === undefined || sourceVariant === undefined || sourceVariant.kind !== "raw") {
    throw new Error("normalized donor lineage does not resolve to a raw variant");
  }
  if (sourceVariant.lineage.rawDonorId !== donor.donorId) {
    throw new Error("normalized donor lineage disagrees with its raw variant");
  }
  for (const transform of variant.transforms) {
    if (transform.source.endDecision > sourceVariant.decisionCount) {
      throw new Error("transform source decision range is out of bounds");
    }
  }
  if (
    !sameReference(variant.replayContent, sourceVariant.replayContent)
    && variant.transforms.length === 0
  ) {
    throw new Error("changed portable replay requires a transform ledger");
  }
}

function copyProcessing(value: unknown): P7bTrainingReplayLevelV1["processing"] {
  const record = exactKeys(value, ["detail", "status"], "training processing status");
  return {
    status: requireEnum(
      record.status,
      ["pending", "complete", "blocked"] as const,
      "training processing status",
    ),
    detail: requireDurableText(record.detail, MAX_TEXT_BYTES, "training processing detail"),
  };
}

function assertCompleteLevelInvariants(level: P7bTrainingReplayLevelV1): void {
  if (level.processing.status !== "complete") {
    return;
  }
  if (
    level.source.eligibility.status !== "eligible"
    || level.source.eligibility.standardOnly !== true
  ) {
    throw new Error("complete level source must be eligible and standard-only");
  }
  if (level.viewableVariantId === null) {
    throw new Error("complete level requires a viewable replay variant");
  }
  if (level.variants.some((variant) => variant.portability === "pending")) {
    throw new Error("complete level cannot contain pending portability");
  }
  if (level.variants.some((variant) =>
    variant.certifications.ms.status === "not-attempted"
    || variant.certifications.lynx.status === "not-attempted",
  )) {
    throw new Error("complete level cannot contain pending certification");
  }
  if (!level.variants.some((variant) =>
    variant.certifications.ms.status === "certified"
    || variant.certifications.lynx.status === "certified",
  )) {
    throw new Error("complete level requires at least one certified replay");
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function copyTrainingReplayLevel(value: unknown): P7bTrainingReplayLevelV1 {
  const record = exactKeys(value, [
    "artifact",
    "donorCoverage",
    "processing",
    "rawDonors",
    "source",
    "variants",
    "version",
    "viewableVariantId",
  ], "training replay level");
  if (record.artifact !== P7B_TRAINING_LEVEL_ARTIFACT || record.version !== 1) {
    throw new Error("training replay level protocol is unsupported");
  }
  const source = copySource(record.source);
  const donorCoverageRecord = exactKeys(
    record.donorCoverage,
    ["lynx", "ms"],
    "donor coverage",
  );
  const donorCoverage = {
    ms: copyDonorCoverage(donorCoverageRecord.ms, "ms"),
    lynx: copyDonorCoverage(donorCoverageRecord.lynx, "lynx"),
  };
  const rawDonors = requireArray(
    record.rawDonors,
    0,
    P7B_MAX_RAW_DONORS_PER_LEVEL,
    "raw donor references",
  ).map((entry) => copyRawDonor(entry, source));
  const donorsById = new Map<string, P7bRawDonorReferenceV1>();
  for (const donor of rawDonors) {
    if (donorsById.has(donor.donorId)) {
      throw new Error(`duplicate raw donor id: ${donor.donorId}`);
    }
    donorsById.set(donor.donorId, donor);
  }
  assertDonorCoverageBindings(donorCoverage, donorsById);

  const variants = requireArray(
    record.variants,
    0,
    P7B_MAX_VARIANTS_PER_LEVEL,
    "training replay variants",
  ).map(copyVariant);
  const variantsById = new Map<string, P7bTrainingReplayVariantV1>();
  for (const variant of variants) {
    if (variantsById.has(variant.variantId)) {
      throw new Error(`duplicate replay variant id: ${variant.variantId}`);
    }
    variantsById.set(variant.variantId, variant);
  }
  for (const variant of variants) {
    assertVariantLineage(variant, donorsById, variantsById);
  }

  const viewableVariantId = requireNullableIdentifier(
    record.viewableVariantId,
    "viewable variant id",
  );
  if (viewableVariantId !== null) {
    const viewable = variantsById.get(viewableVariantId);
    if (viewable === undefined) {
      throw new Error("viewable variant id does not resolve");
    }
    if (
      viewable.certifications.ms.status !== "certified"
      && viewable.certifications.lynx.status !== "certified"
    ) {
      throw new Error("viewable replay variant is not certified on any target");
    }
  }

  const result: P7bTrainingReplayLevelV1 = {
    artifact: P7B_TRAINING_LEVEL_ARTIFACT,
    version: 1,
    source,
    donorCoverage,
    rawDonors,
    variants,
    processing: copyProcessing(record.processing),
    viewableVariantId,
  };
  const unassessedTargets = (["ms", "lynx"] as const).filter((target) => (
    result.donorCoverage[target].status === "not-assessed"
  ));
  if (
    unassessedTargets.length > 0
    && (
      unassessedTargets.length !== 2
      || result.processing.status !== "pending"
      || result.rawDonors.length !== 0
      || result.variants.length !== 0
      || result.viewableVariantId !== null
    )
  ) {
    throw new Error("not-assessed donor coverage requires an untouched pending row");
  }
  assertCompleteLevelInvariants(result);
  return result;
}

export function buildP7bTrainingReplayLevel(
  value: unknown,
): P7bTrainingReplayLevelV1 {
  const copied = copyTrainingReplayLevel(value);
  const canonical = canonicalizeJson(copied);
  if (utf8Length(canonical) > P7B_MAX_LEVEL_CONTRACT_BYTES) {
    throw new Error("training replay level is oversized");
  }
  return deepFreeze(copied);
}

export function canonicalizeP7bTrainingReplayLevel(value: unknown): CanonicalJson {
  return canonicalizeJson(buildP7bTrainingReplayLevel(value));
}

export function parseP7bTrainingReplayLevel(
  canonicalJson: string,
): P7bTrainingReplayLevelV1 {
  if (
    typeof canonicalJson !== "string"
    || utf8Length(canonicalJson) > P7B_MAX_LEVEL_CONTRACT_BYTES
  ) {
    throw new Error("training replay level is oversized");
  }
  let parsed: unknown;
  try {
    parsed = parseCanonicalJson(canonicalJson);
  } catch (error) {
    throw new Error("training replay level is not canonical JSON", { cause: error });
  }
  return buildP7bTrainingReplayLevel(parsed);
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K];
};

function increment<K extends string>(record: Record<K, number>, key: K): void {
  record[key] = record[key] + 1;
}

export function buildP7bTrainingPackSummary(
  values: readonly P7bTrainingReplayLevelV1[],
): P7bTrainingPackSummaryV1 {
  if (!Array.isArray(values) || values.length < 1 || values.length > P7B_MAX_LEVELS_PER_PACK) {
    throw new Error("training pack summary level count is out of bounds");
  }
  const levels = values.map(buildP7bTrainingReplayLevel)
    .sort((left, right) => left.source.levelNumber - right.source.levelNumber);
  const packId = levels[0]!.source.packId;
  const levelNumbers = new Set<number>();
  for (const level of levels) {
    if (level.source.packId !== packId) {
      throw new Error("pack summary cannot mix packs");
    }
    if (levelNumbers.has(level.source.levelNumber)) {
      throw new Error(`pack summary contains duplicate level ${level.source.levelNumber}`);
    }
    levelNumbers.add(level.source.levelNumber);
  }

  const summary: Mutable<P7bTrainingPackSummaryV1> = {
    artifact: P7B_TRAINING_PACK_SUMMARY_ARTIFACT,
    version: 1,
    packId,
    totals: {
      levels: levels.length,
      targets: levels.length * 2,
      viewableLevels: 0,
      rawDonors: 0,
      variants: 0,
      variantTargetCertifications: 0,
    },
    sources: { eligible: 0, ineligible: 0, standardOnly: 0 },
    processing: { pending: 0, complete: 0, blocked: 0 },
    donorCoverage: { notAssessed: 0, bound: 0, missing: 0, invalid: 0 },
    mapRelationships: {
      officialMap: 0,
      exactGameplayAlias: 0,
      editedRelative: 0,
    },
    variants: { raw: 0, portable: 0 },
    portability: {
      pending: 0,
      portable: 0,
      targetSpecific: 0,
      quirkRequired: 0,
      notPortable: 0,
    },
    executions: {
      native: 0,
      compiled: 0,
      compilationFailed: 0,
      notAttempted: 0,
      unavailable: 0,
    },
    certifications: {
      certified: 0,
      failed: 0,
      notAttempted: 0,
      unavailable: 0,
    },
  };

  for (const level of levels) {
    increment(summary.sources, level.source.eligibility.status);
    if (level.source.eligibility.standardOnly) {
      summary.sources.standardOnly += 1;
    }
    increment(summary.processing, level.processing.status);
    if (level.viewableVariantId !== null) {
      summary.totals.viewableLevels += 1;
    }
    for (const target of ["ms", "lynx"] as const) {
      increment(summary.donorCoverage, {
        "not-assessed": "notAssessed",
        bound: "bound",
        missing: "missing",
        invalid: "invalid",
      }[level.donorCoverage[target].status] as keyof typeof summary.donorCoverage);
    }
    summary.totals.rawDonors += level.rawDonors.length;
    for (const donor of level.rawDonors) {
      increment(summary.mapRelationships, {
        "official-map": "officialMap",
        "exact-gameplay-alias": "exactGameplayAlias",
        "edited-relative": "editedRelative",
      }[donor.mapRelationship] as keyof typeof summary.mapRelationships);
    }
    summary.totals.variants += level.variants.length;
    summary.totals.variantTargetCertifications += level.variants.length * 2;
    for (const variant of level.variants) {
      increment(summary.variants, variant.kind);
      increment(summary.portability, {
        pending: "pending",
        portable: "portable",
        "target-specific": "targetSpecific",
        "quirk-required": "quirkRequired",
        "not-portable": "notPortable",
      }[variant.portability] as keyof typeof summary.portability);
      for (const target of ["ms", "lynx"] as const) {
        increment(summary.executions, {
          native: "native",
          compiled: "compiled",
          "compilation-failed": "compilationFailed",
          "not-attempted": "notAttempted",
          unavailable: "unavailable",
        }[variant.certifications[target].execution.status] as keyof typeof summary.executions);
        increment(summary.certifications, {
          certified: "certified",
          failed: "failed",
          "not-attempted": "notAttempted",
          unavailable: "unavailable",
        }[variant.certifications[target].status] as keyof typeof summary.certifications);
      }
    }
  }
  return deepFreeze(summary);
}
