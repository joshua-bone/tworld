import { canonicalizeJson, type CanonicalJsonValue } from "../domain/canonicalJson.js";
import type {
  BlobReferenceV1,
  RulesetTargetV1,
  StableIdV1,
} from "../domain/artifacts/types.js";

export const P6B_PORTFOLIO_CANARY_SUITE_TYPE = "p6b-portfolio-canary-suite" as const;
export const P6B_PORTFOLIO_CANARY_SUITE_VERSION = 1 as const;
export const P6B_MAX_CANARIES = 8 as const;
export const P6B_MAX_EVIDENCE_PER_CANARY = 16 as const;
export const P6B_MAX_DEPENDENCIES_PER_CANARY = 16 as const;
export const P6B_MAX_UNRESOLVED_GAPS_PER_CANARY = 16 as const;
export const P6B_MAX_EVIDENCE_BYTES_PER_ENTRY = 2 * 1_024 * 1_024;
export const P6B_MAX_REFERENCED_EVIDENCE_BYTES_PER_CANARY = 16 * 1_024 * 1_024;
export const P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION =
  "ccsolver-source-scope:no-expanded-cc1-tiles:dattools-68be18aca0dc42fa3929ff8160c6c8acea8c18e5:v1" as const;

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const OCCURRENCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:/-]{0,126}[a-z0-9])?$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MAX_TITLE_SCALARS = 200;
const MAX_GAP_DESCRIPTION_SCALARS = 1_024;

export const P6B_REQUIRED_RELATIONSHIPS_V1 = [
  "alternative-branches-proven-rejoin",
  "genuinely-different-plan",
  "shared-plan-different-timing",
  "shared-subgoal-different-local-route",
] as const;

export type P6bPortfolioRelationshipV1 = typeof P6B_REQUIRED_RELATIONSHIPS_V1[number];
export type P6bEvidenceKindV1 =
  | "causal-journal"
  | "level-source"
  | "rejoin-boundary"
  | "route"
  | "semantic-alignment"
  | "source-eligibility"
  | "static-comparison"
  | "strategy-portfolio"
  | "subgoal-contract";
export type P6bEvidenceAuthorityV1 =
  | "authoritative"
  | "checked-eligibility"
  | "checked-preview"
  | "checked-validity"
  | "diagnostic-only"
  | "identity-only"
  | "synthetic-fixture";
export type P6bEvidenceTargetV1 = RulesetTargetV1 | "cross-ruleset";
export type P6bDependencyKindV1 =
  | "branch-rejoin"
  | "causal-disagreement"
  | "local-route"
  | "mechanic"
  | "randomness"
  | "ruleset-plan"
  | "ruleset-quirk"
  | "timing";
export type P6bConfidenceLevelV1 = "low" | "medium" | "high";
export type P6bUnresolvedGapKindV1 =
  | "attribution-gap"
  | "dependency-unresolved"
  | "donor-only-support"
  | "missing-independent-causal-evidence"
  | "rejoin-not-proven"
  | "single-context-only";
export type P6bReviewStatusV1 = "unreviewed" | "reviewed" | "changes-requested";

export interface P6bSyntheticCanarySourceV1 {
  readonly kind: "synthetic";
  readonly fixtureId: StableIdV1;
  readonly content: BlobReferenceV1;
}

export interface P6bRepositoryLevelMemberSourceV1 {
  readonly kind: "repository-level-member";
  readonly path: string;
  readonly ordinal: number;
  readonly content: BlobReferenceV1;
}

export interface P6bPortfolioCanaryCaseV1 {
  readonly kind: "synthetic" | "corpus";
  readonly caseId: StableIdV1;
  readonly occurrenceId: StableIdV1;
  readonly title: string;
  readonly source: P6bSyntheticCanarySourceV1 | P6bRepositoryLevelMemberSourceV1;
}

export interface P6bPortfolioCanaryEvidenceV1 {
  readonly evidenceId: StableIdV1;
  readonly evidenceKind: P6bEvidenceKindV1;
  readonly target: P6bEvidenceTargetV1;
  readonly authority: P6bEvidenceAuthorityV1;
  readonly content: BlobReferenceV1;
  readonly sourceEligibility: {
    readonly kind: "standard-source-eligibility";
    readonly sourceContent: BlobReferenceV1;
    readonly validityContent: BlobReferenceV1;
    readonly scopeReportContent: BlobReferenceV1;
    readonly scopePolicyRevision: typeof P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION;
    readonly status: "eligible";
    readonly expandedTileIssueCount: 0;
    readonly targetRulesets: readonly ["ms", "lynx"];
  } | null;
  readonly semanticRejoin: {
    readonly kind: "semantic-state-and-executed-continuation";
    readonly targets: readonly [
      P6bSemanticRejoinTargetEvidenceV1,
      P6bSemanticRejoinTargetEvidenceV1,
    ];
  } | null;
}

export interface P6bSemanticRejoinTargetEvidenceV1 {
  readonly target: RulesetTargetV1;
  readonly leftBoundary: BlobReferenceV1;
  readonly rightBoundary: BlobReferenceV1;
  readonly boundariesEqual: true;
  readonly leftSemanticFingerprint: BlobReferenceV1["digest"];
  readonly rightSemanticFingerprint: BlobReferenceV1["digest"];
  readonly semanticFingerprintsEqual: true;
  readonly leftNativeExactFingerprint: BlobReferenceV1["digest"];
  readonly rightNativeExactFingerprint: BlobReferenceV1["digest"];
  readonly nativeExactFingerprintsEqual: boolean;
  readonly leftContinuation: BlobReferenceV1;
  readonly rightContinuation: BlobReferenceV1;
  readonly continuationsEqual: true;
}

export interface P6bPortfolioCanaryDependencyV1 {
  readonly dependencyId: StableIdV1;
  readonly kind: P6bDependencyKindV1;
  readonly targetRulesets: readonly RulesetTargetV1[];
  readonly evidenceIds: readonly StableIdV1[];
}

export interface P6bPortfolioCanaryGapV1 {
  readonly gapId: StableIdV1;
  readonly kind: P6bUnresolvedGapKindV1;
  readonly targetRulesets: readonly RulesetTargetV1[];
  readonly description: string;
}

export interface P6bPortfolioCanaryReviewBindingV1 {
  readonly evidenceId: StableIdV1;
  readonly evidence: P6bPortfolioCanaryEvidenceV1;
}

export interface P6bPortfolioCanaryReviewStateV1 {
  readonly status: P6bReviewStatusV1;
  readonly evidenceBindings: readonly P6bPortfolioCanaryReviewBindingV1[];
}

export interface P6bPortfolioCanaryInputV1 {
  readonly canaryId: StableIdV1;
  readonly case: P6bPortfolioCanaryCaseV1;
  readonly targetScope: {
    readonly rulesets: readonly RulesetTargetV1[];
    readonly vocabulary: "cc1-standard";
    readonly expandedTiles: "excluded";
    readonly eligibilityEvidenceId: StableIdV1;
    readonly normalizationProfile: StableIdV1;
  };
  readonly expectedRelationship: P6bPortfolioRelationshipV1;
  readonly proposal: {
    readonly familyId: StableIdV1;
    readonly title: string;
  };
  readonly evidence: readonly P6bPortfolioCanaryEvidenceV1[];
  readonly dependencies: readonly P6bPortfolioCanaryDependencyV1[];
  readonly confidence: {
    readonly level: P6bConfidenceLevelV1;
    readonly basisEvidenceIds: readonly StableIdV1[];
  };
  readonly unresolvedGaps: readonly P6bPortfolioCanaryGapV1[];
  readonly reviewState: P6bPortfolioCanaryReviewStateV1;
}

export interface P6bPortfolioCanaryV1 extends P6bPortfolioCanaryInputV1 {
  readonly canaryType: "p6b-portfolio-canary";
  readonly canaryVersion: 1;
  readonly claim: {
    readonly kind: "proposal";
    readonly proofStatus: "not-proven";
  };
}

export interface P6bPortfolioCanarySuiteInputV1 {
  readonly suiteVersion: 1;
  readonly suiteId: StableIdV1;
  readonly canaries: readonly P6bPortfolioCanaryInputV1[];
}

export interface P6bPortfolioCanarySuiteV1 {
  readonly suiteType: typeof P6B_PORTFOLIO_CANARY_SUITE_TYPE;
  readonly suiteVersion: typeof P6B_PORTFOLIO_CANARY_SUITE_VERSION;
  readonly suiteId: StableIdV1;
  readonly standardOnly: true;
  readonly canariesOrder: "canary-id";
  readonly relationshipCoverage: readonly P6bPortfolioRelationshipV1[];
  readonly bounds: {
    readonly maximumCanaries: typeof P6B_MAX_CANARIES;
    readonly maximumEvidencePerCanary: typeof P6B_MAX_EVIDENCE_PER_CANARY;
    readonly maximumDependenciesPerCanary: typeof P6B_MAX_DEPENDENCIES_PER_CANARY;
    readonly maximumUnresolvedGapsPerCanary: typeof P6B_MAX_UNRESOLVED_GAPS_PER_CANARY;
    readonly maximumEvidenceBytesPerEntry: number;
    readonly maximumReferencedEvidenceBytesPerCanary: number;
  };
  readonly canaries: readonly P6bPortfolioCanaryV1[];
}

export const P6B_NAMED_REAL_CANARIES_V1 = {
  cclp1Level67: {
    canaryId: "canary:p6b:cclp1-067-booster-shots",
    caseId: "case:sha256:0f8671f595088115fa91b502c427f275f31b691b860885d80de11e34cb163769",
    occurrenceId: "cclp1/067",
    title: "Booster Shots",
    sourceMember: {
      path: "data/CCLP1.dat",
      ordinal: 0,
      content: {
        digest: "sha256:89290f3ca391444e8cf834c77965208effbee32ea6dd16fe71894dbe9c06996f",
        byteLength: 860,
      },
    },
    validityOccurrenceContent: {
      digest: "sha256:00ec7925de7f90c0040053d497ffb104cdef25decc10680179bf0baa9059e167",
      byteLength: 612,
    },
    staticComparisonContent: {
      digest: "sha256:a28d7b5219a7acbe0dadf0d5323d79cf033db9abf4d1d7fb792d356ac7616f5a",
      byteLength: 15_737,
    },
  },
  cclp3Level16: {
    canaryId: "canary:p6b:cclp3-016-two-sets-of-rules",
    caseId: "case:sha256:ebc6a988aa1363904bd71d3ba17b29172d830886e707aa1898804d20444a52af",
    occurrenceId: "cclp3/016",
    title: "Two Sets of Rules",
    sourceMember: {
      path: "data/CCLP3.dat",
      ordinal: 0,
      content: {
        digest: "sha256:952713cff935882dd71959ce1c902714ca468851f3541151babafca5f7d4013b",
        byteLength: 1_190,
      },
    },
    validityOccurrenceContent: {
      digest: "sha256:ada16d21ab30878573efad854a67d691bca7b85c6f413e5cd9f51fb9d6d4f491",
      byteLength: 612,
    },
    staticComparisonContent: {
      digest: "sha256:7e66995e8dda27cff19b0989a989b2071b81a5f32fbadf81bc573891794a5413",
      byteLength: 44_125,
    },
  },
} as const;

export class P6bPortfolioCanaryValidationError extends TypeError {
  readonly code = "p6b-portfolio-canary.invalid" as const;

  constructor(
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${path || "/"}: ${message}`, options);
    this.name = "P6bPortfolioCanaryValidationError";
  }
}

function fail(path: string, message: string, options?: ErrorOptions): never {
  throw new P6bPortfolioCanaryValidationError(path, message, options);
}

function childPath(path: string, token: string | number): string {
  const escaped = String(token).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${path}/${escaped}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "expected an object");
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(childPath(path, key), "unexpected field");
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(childPath(path, key), "missing required field");
  }
}

function stableId(value: unknown, path: string): StableIdV1 {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    fail(path, "expected a lowercase protocol StableId of at most 128 ASCII characters");
  }
  return value;
}

function occurrenceId(value: unknown, path: string): StableIdV1 {
  if (typeof value !== "string" || !OCCURRENCE_ID_PATTERN.test(value)) {
    fail(path, "expected a bounded lowercase occurrence ID");
  }
  return value;
}

function durableText(value: unknown, path: string, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\r")
    || Array.from(value).length > maximum
  ) {
    fail(path, `expected nonempty text of at most ${maximum} Unicode scalars without carriage returns`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value < minimum
    || value > maximum
  ) {
    fail(path, `expected an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    fail(path, `expected one of ${values.join(", ")}`);
  }
  return value as T;
}

function blobReference(value: unknown, path: string): BlobReferenceV1 {
  const item = record(value, path);
  exactKeys(item, ["digest", "byteLength"], path);
  if (typeof item.digest !== "string" || !SHA256_PATTERN.test(item.digest)) {
    fail(childPath(path, "digest"), "expected a lowercase SHA-256 digest");
  }
  const byteLength = integer(
    item.byteLength,
    childPath(path, "byteLength"),
    0,
    P6B_MAX_EVIDENCE_BYTES_PER_ENTRY,
  );
  return { digest: item.digest as BlobReferenceV1["digest"], byteLength };
}

function sha256Fingerprint(value: unknown, path: string): BlobReferenceV1["digest"] {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, "expected a lowercase SHA-256 fingerprint");
  }
  return value as BlobReferenceV1["digest"];
}

function safeRepositoryPath(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    fail(path, "expected a nonempty bounded repository path");
  }
  if (
    value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
    || !value.startsWith("data/")
  ) {
    fail(path, "expected a normalized data/ repository path without traversal");
  }
  return value;
}

function targetRulesets(value: unknown, path: string): readonly RulesetTargetV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    fail(path, "expected one or two target rulesets");
  }
  const seen = new Set<string>();
  const result = value.map((target, index) => {
    const normalized = oneOf(target, ["ms", "lynx"] as const, childPath(path, index));
    if (seen.has(normalized)) fail(childPath(path, index), "duplicate target ruleset");
    seen.add(normalized);
    return normalized;
  });
  return result.sort((left, right) => left === right ? 0 : left === "ms" ? -1 : 1);
}

function stableIds(
  value: unknown,
  path: string,
  maximum: number,
  requireNonempty = true,
): readonly StableIdV1[] {
  if (
    !Array.isArray(value)
    || (requireNonempty && value.length === 0)
    || value.length > maximum
  ) {
    fail(path, `expected ${requireNonempty ? "one through" : "zero through"} ${maximum} IDs`);
  }
  const seen = new Set<string>();
  const result = value.map((entry, index) => {
    const id = stableId(entry, childPath(path, index));
    if (seen.has(id)) fail(childPath(path, index), "duplicate ID");
    seen.add(id);
    return id;
  });
  return result.sort(compareText);
}

function canaryCase(value: unknown, path: string): P6bPortfolioCanaryCaseV1 {
  const item = record(value, path);
  exactKeys(item, ["kind", "caseId", "occurrenceId", "title", "source"], path);
  const kind = oneOf(item.kind, ["synthetic", "corpus"] as const, childPath(path, "kind"));
  const sourcePath = childPath(path, "source");
  const source = record(item.source, sourcePath);
  if (kind === "synthetic") {
    exactKeys(source, ["kind", "fixtureId", "content"], sourcePath);
    if (source.kind !== "synthetic") fail(childPath(sourcePath, "kind"), "expected synthetic");
    return {
      kind,
      caseId: stableId(item.caseId, childPath(path, "caseId")),
      occurrenceId: occurrenceId(item.occurrenceId, childPath(path, "occurrenceId")),
      title: durableText(item.title, childPath(path, "title"), MAX_TITLE_SCALARS),
      source: {
        kind: "synthetic",
        fixtureId: stableId(source.fixtureId, childPath(sourcePath, "fixtureId")),
        content: blobReference(source.content, childPath(sourcePath, "content")),
      },
    };
  }
  exactKeys(source, ["kind", "path", "ordinal", "content"], sourcePath);
  if (source.kind !== "repository-level-member") {
    fail(childPath(sourcePath, "kind"), "expected repository-level-member");
  }
  return {
    kind,
    caseId: stableId(item.caseId, childPath(path, "caseId")),
    occurrenceId: occurrenceId(item.occurrenceId, childPath(path, "occurrenceId")),
    title: durableText(item.title, childPath(path, "title"), MAX_TITLE_SCALARS),
    source: {
      kind: "repository-level-member",
      path: safeRepositoryPath(source.path, childPath(sourcePath, "path")),
      ordinal: integer(source.ordinal, childPath(sourcePath, "ordinal"), 0, 65_535),
      content: blobReference(source.content, childPath(sourcePath, "content")),
    },
  };
}

function evidenceCatalog(
  value: unknown,
  path: string,
): readonly P6bPortfolioCanaryEvidenceV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > P6B_MAX_EVIDENCE_PER_CANARY) {
    fail(path, `expected one through ${P6B_MAX_EVIDENCE_PER_CANARY} evidence entries`);
  }
  const ids = new Set<string>();
  let totalBytes = 0;
  const result = value.map((entry, index) => {
    const itemPath = childPath(path, index);
    const item = record(entry, itemPath);
    exactKeys(
      item,
      [
        "evidenceId",
        "evidenceKind",
        "target",
        "authority",
        "content",
        "sourceEligibility",
        "semanticRejoin",
      ],
      itemPath,
    );
    const evidenceId = stableId(item.evidenceId, childPath(itemPath, "evidenceId"));
    if (ids.has(evidenceId)) fail(childPath(itemPath, "evidenceId"), "duplicate evidence ID");
    ids.add(evidenceId);
    const content = blobReference(item.content, childPath(itemPath, "content"));
    totalBytes += content.byteLength;
    if (totalBytes > P6B_MAX_REFERENCED_EVIDENCE_BYTES_PER_CANARY) {
      fail(path, "referenced evidence exceeds the per-canary byte bound");
    }
    const evidenceKind = oneOf(item.evidenceKind, [
      "causal-journal",
      "level-source",
      "rejoin-boundary",
      "route",
      "semantic-alignment",
      "source-eligibility",
      "static-comparison",
      "strategy-portfolio",
      "subgoal-contract",
    ] as const, childPath(itemPath, "evidenceKind"));
    const rejoinPath = childPath(itemPath, "semanticRejoin");
    const eligibilityPath = childPath(itemPath, "sourceEligibility");
    let sourceEligibility: P6bPortfolioCanaryEvidenceV1["sourceEligibility"] = null;
    if (evidenceKind === "source-eligibility") {
      const eligibility = record(item.sourceEligibility, eligibilityPath);
      exactKeys(eligibility, [
        "kind",
        "sourceContent",
        "validityContent",
        "scopeReportContent",
        "scopePolicyRevision",
        "status",
        "expandedTileIssueCount",
        "targetRulesets",
      ], eligibilityPath);
      if (eligibility.kind !== "standard-source-eligibility") {
        fail(childPath(eligibilityPath, "kind"), "expected standard-source-eligibility");
      }
      const sourceContent = blobReference(
        eligibility.sourceContent,
        childPath(eligibilityPath, "sourceContent"),
      );
      const validityContent = blobReference(
        eligibility.validityContent,
        childPath(eligibilityPath, "validityContent"),
      );
      const scopeReportContent = blobReference(
        eligibility.scopeReportContent,
        childPath(eligibilityPath, "scopeReportContent"),
      );
      totalBytes += sourceContent.byteLength
        + validityContent.byteLength
        + scopeReportContent.byteLength;
      if (totalBytes > P6B_MAX_REFERENCED_EVIDENCE_BYTES_PER_CANARY) {
        fail(path, "referenced evidence exceeds the per-canary byte bound");
      }
      if (eligibility.scopePolicyRevision !== P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION) {
        fail(childPath(eligibilityPath, "scopePolicyRevision"), "unknown source-scope policy");
      }
      if (eligibility.status !== "eligible" || eligibility.expandedTileIssueCount !== 0) {
        fail(eligibilityPath, "source eligibility must report zero expanded-tile issues");
      }
      if (
        !Array.isArray(eligibility.targetRulesets)
        || eligibility.targetRulesets.length !== 2
        || eligibility.targetRulesets[0] !== "ms"
        || eligibility.targetRulesets[1] !== "lynx"
      ) {
        fail(childPath(eligibilityPath, "targetRulesets"), "expected exact paired target scope [ms, lynx]");
      }
      sourceEligibility = {
        kind: "standard-source-eligibility",
        sourceContent,
        validityContent,
        scopeReportContent,
        scopePolicyRevision: P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION,
        status: "eligible",
        expandedTileIssueCount: 0,
        targetRulesets: ["ms", "lynx"],
      };
    } else if (item.sourceEligibility !== null) {
      fail(eligibilityPath, "only source-eligibility evidence may carry source eligibility data");
    }
    let semanticRejoin: P6bPortfolioCanaryEvidenceV1["semanticRejoin"] = null;
    if (evidenceKind === "rejoin-boundary") {
      const rejoin = record(item.semanticRejoin, rejoinPath);
      exactKeys(rejoin, ["kind", "targets"], rejoinPath);
      if (rejoin.kind !== "semantic-state-and-executed-continuation") {
        fail(
          childPath(rejoinPath, "kind"),
          "expected semantic-state-and-executed-continuation",
        );
      }
      if (!Array.isArray(rejoin.targets) || rejoin.targets.length !== 2) {
        fail(childPath(rejoinPath, "targets"), "expected exact paired target evidence [ms, lynx]");
      }
      const targets = rejoin.targets.map((targetValue, targetIndex) => {
        const targetPath = childPath(childPath(rejoinPath, "targets"), targetIndex);
        const targetItem = record(targetValue, targetPath);
        exactKeys(targetItem, [
          "target",
          "leftBoundary",
          "rightBoundary",
          "boundariesEqual",
          "leftSemanticFingerprint",
          "rightSemanticFingerprint",
          "semanticFingerprintsEqual",
          "leftNativeExactFingerprint",
          "rightNativeExactFingerprint",
          "nativeExactFingerprintsEqual",
          "leftContinuation",
          "rightContinuation",
          "continuationsEqual",
        ], targetPath);
        const expectedTarget = targetIndex === 0 ? "ms" : "lynx";
        if (targetItem.target !== expectedTarget) {
          fail(childPath(targetPath, "target"), `expected ${expectedTarget}`);
        }
        const leftBoundary = blobReference(
          targetItem.leftBoundary,
          childPath(targetPath, "leftBoundary"),
        );
        const rightBoundary = blobReference(
          targetItem.rightBoundary,
          childPath(targetPath, "rightBoundary"),
        );
        const leftContinuation = blobReference(
          targetItem.leftContinuation,
          childPath(targetPath, "leftContinuation"),
        );
        const rightContinuation = blobReference(
          targetItem.rightContinuation,
          childPath(targetPath, "rightContinuation"),
        );
        const leftSemanticFingerprint = sha256Fingerprint(
          targetItem.leftSemanticFingerprint,
          childPath(targetPath, "leftSemanticFingerprint"),
        );
        const rightSemanticFingerprint = sha256Fingerprint(
          targetItem.rightSemanticFingerprint,
          childPath(targetPath, "rightSemanticFingerprint"),
        );
        const leftNativeExactFingerprint = sha256Fingerprint(
          targetItem.leftNativeExactFingerprint,
          childPath(targetPath, "leftNativeExactFingerprint"),
        );
        const rightNativeExactFingerprint = sha256Fingerprint(
          targetItem.rightNativeExactFingerprint,
          childPath(targetPath, "rightNativeExactFingerprint"),
        );
        totalBytes += leftBoundary.byteLength
          + rightBoundary.byteLength
          + leftContinuation.byteLength
          + rightContinuation.byteLength;
        if (totalBytes > P6B_MAX_REFERENCED_EVIDENCE_BYTES_PER_CANARY) {
          fail(path, "referenced evidence exceeds the per-canary byte bound");
        }
        if (targetItem.boundariesEqual !== true) {
          fail(childPath(targetPath, "boundariesEqual"), "expected true");
        }
        if (targetItem.semanticFingerprintsEqual !== true) {
          fail(childPath(targetPath, "semanticFingerprintsEqual"), "expected true");
        }
        if (leftSemanticFingerprint !== rightSemanticFingerprint) {
          fail(targetPath, "branch semantic fingerprints differ");
        }
        if (typeof targetItem.nativeExactFingerprintsEqual !== "boolean") {
          fail(childPath(targetPath, "nativeExactFingerprintsEqual"), "expected boolean");
        }
        if (
          targetItem.nativeExactFingerprintsEqual
          !== (leftNativeExactFingerprint === rightNativeExactFingerprint)
        ) {
          fail(targetPath, "native exact fingerprint equality claim does not match the evidence");
        }
        if (targetItem.continuationsEqual !== true) {
          fail(childPath(targetPath, "continuationsEqual"), "expected true");
        }
        if (!sameCanonical(leftBoundary, rightBoundary)) {
          fail(targetPath, "branch gameplay boundaries are not byte-identical");
        }
        if (!sameCanonical(leftContinuation, rightContinuation)) {
          fail(targetPath, "branch terminal gameplay continuations are not byte-identical");
        }
        return {
          target: expectedTarget,
          leftBoundary,
          rightBoundary,
          boundariesEqual: true as const,
          leftSemanticFingerprint,
          rightSemanticFingerprint,
          semanticFingerprintsEqual: true as const,
          leftNativeExactFingerprint,
          rightNativeExactFingerprint,
          nativeExactFingerprintsEqual: targetItem.nativeExactFingerprintsEqual,
          leftContinuation,
          rightContinuation,
          continuationsEqual: true as const,
        };
      }) as [P6bSemanticRejoinTargetEvidenceV1, P6bSemanticRejoinTargetEvidenceV1];
      semanticRejoin = {
        kind: "semantic-state-and-executed-continuation",
        targets,
      };
    } else if (item.semanticRejoin !== null) {
      fail(rejoinPath, "only rejoin-boundary evidence may carry semantic rejoin data");
    }
    return {
      evidenceId,
      evidenceKind,
      target: oneOf(item.target, ["ms", "lynx", "cross-ruleset"] as const, childPath(itemPath, "target")),
      authority: oneOf(item.authority, [
        "authoritative",
        "checked-eligibility",
        "checked-preview",
        "checked-validity",
        "diagnostic-only",
        "identity-only",
        "synthetic-fixture",
      ] as const, childPath(itemPath, "authority")),
      content,
      sourceEligibility,
      semanticRejoin,
    };
  });
  return result.sort((left, right) => compareText(left.evidenceId, right.evidenceId));
}

function dependencies(
  value: unknown,
  path: string,
  evidenceIds: ReadonlySet<string>,
): readonly P6bPortfolioCanaryDependencyV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > P6B_MAX_DEPENDENCIES_PER_CANARY) {
    fail(path, `expected one through ${P6B_MAX_DEPENDENCIES_PER_CANARY} dependencies`);
  }
  const ids = new Set<string>();
  const result = value.map((entry, index) => {
    const itemPath = childPath(path, index);
    const item = record(entry, itemPath);
    exactKeys(item, ["dependencyId", "kind", "targetRulesets", "evidenceIds"], itemPath);
    const dependencyId = stableId(item.dependencyId, childPath(itemPath, "dependencyId"));
    if (ids.has(dependencyId)) fail(childPath(itemPath, "dependencyId"), "duplicate dependency ID");
    ids.add(dependencyId);
    const references = stableIds(
      item.evidenceIds,
      childPath(itemPath, "evidenceIds"),
      P6B_MAX_EVIDENCE_PER_CANARY,
    );
    references.forEach((id, evidenceIndex) => {
      if (!evidenceIds.has(id)) {
        fail(childPath(childPath(itemPath, "evidenceIds"), evidenceIndex), "dangling evidence reference");
      }
    });
    return {
      dependencyId,
      kind: oneOf(item.kind, [
        "branch-rejoin",
        "causal-disagreement",
        "local-route",
        "mechanic",
        "randomness",
        "ruleset-plan",
        "ruleset-quirk",
        "timing",
      ] as const, childPath(itemPath, "kind")),
      targetRulesets: targetRulesets(item.targetRulesets, childPath(itemPath, "targetRulesets")),
      evidenceIds: references,
    };
  });
  return result.sort((left, right) => compareText(left.dependencyId, right.dependencyId));
}

function confidence(
  value: unknown,
  path: string,
  evidenceIds: ReadonlySet<string>,
): P6bPortfolioCanaryInputV1["confidence"] {
  const item = record(value, path);
  exactKeys(item, ["level", "basisEvidenceIds"], path);
  const basisEvidenceIds = stableIds(
    item.basisEvidenceIds,
    childPath(path, "basisEvidenceIds"),
    P6B_MAX_EVIDENCE_PER_CANARY,
  );
  basisEvidenceIds.forEach((id, index) => {
    if (!evidenceIds.has(id)) {
      fail(childPath(childPath(path, "basisEvidenceIds"), index), "dangling evidence reference");
    }
  });
  return {
    level: oneOf(item.level, ["low", "medium", "high"] as const, childPath(path, "level")),
    basisEvidenceIds,
  };
}

function unresolvedGaps(value: unknown, path: string): readonly P6bPortfolioCanaryGapV1[] {
  if (!Array.isArray(value) || value.length > P6B_MAX_UNRESOLVED_GAPS_PER_CANARY) {
    fail(path, `expected zero through ${P6B_MAX_UNRESOLVED_GAPS_PER_CANARY} unresolved gaps`);
  }
  const ids = new Set<string>();
  const result = value.map((entry, index) => {
    const itemPath = childPath(path, index);
    const item = record(entry, itemPath);
    exactKeys(item, ["gapId", "kind", "targetRulesets", "description"], itemPath);
    const gapId = stableId(item.gapId, childPath(itemPath, "gapId"));
    if (ids.has(gapId)) fail(childPath(itemPath, "gapId"), "duplicate gap ID");
    ids.add(gapId);
    return {
      gapId,
      kind: oneOf(item.kind, [
        "attribution-gap",
        "dependency-unresolved",
        "donor-only-support",
        "missing-independent-causal-evidence",
        "rejoin-not-proven",
        "single-context-only",
      ] as const, childPath(itemPath, "kind")),
      targetRulesets: targetRulesets(item.targetRulesets, childPath(itemPath, "targetRulesets")),
      description: durableText(
        item.description,
        childPath(itemPath, "description"),
        MAX_GAP_DESCRIPTION_SCALARS,
      ),
    };
  });
  return result.sort((left, right) => compareText(left.gapId, right.gapId));
}

function reviewState(
  value: unknown,
  path: string,
  evidence: readonly P6bPortfolioCanaryEvidenceV1[],
): P6bPortfolioCanaryReviewStateV1 {
  const item = record(value, path);
  exactKeys(item, ["status", "evidenceBindings"], path);
  if (!Array.isArray(item.evidenceBindings) || item.evidenceBindings.length !== evidence.length) {
    fail(childPath(path, "evidenceBindings"), "expected one exact binding for every evidence entry");
  }
  const evidenceById = new Map(evidence.map((entry) => [entry.evidenceId, entry]));
  const seen = new Set<string>();
  const bindings = item.evidenceBindings.map((entry, index) => {
    const itemPath = childPath(childPath(path, "evidenceBindings"), index);
    const binding = record(entry, itemPath);
    exactKeys(binding, ["evidenceId", "evidence"], itemPath);
    const evidenceId = stableId(binding.evidenceId, childPath(itemPath, "evidenceId"));
    if (seen.has(evidenceId)) fail(childPath(itemPath, "evidenceId"), "duplicate review binding");
    seen.add(evidenceId);
    const current = evidenceById.get(evidenceId);
    if (current === undefined) fail(childPath(itemPath, "evidenceId"), "dangling review binding");
    if (!sameCanonical(current, binding.evidence)) {
      fail(childPath(itemPath, "evidence"), "stale review evidence binding");
    }
    return { evidenceId, evidence: current };
  }).sort((left, right) => compareText(left.evidenceId, right.evidenceId));
  return {
    status: oneOf(
      item.status,
      ["unreviewed", "reviewed", "changes-requested"] as const,
      childPath(path, "status"),
    ),
    evidenceBindings: bindings,
  };
}

function hasEvidenceKind(
  canary: P6bPortfolioCanaryInputV1,
  kind: P6bEvidenceKindV1,
  target?: P6bEvidenceTargetV1,
): boolean {
  return canary.evidence.some((entry) => (
    entry.evidenceKind === kind && (target === undefined || entry.target === target)
  ));
}

function hasDependencyKind(
  canary: P6bPortfolioCanaryInputV1,
  kind: P6bDependencyKindV1,
): boolean {
  return canary.dependencies.some((entry) => entry.kind === kind);
}

function assertRelationshipEvidence(canary: P6bPortfolioCanaryInputV1, path: string): void {
  switch (canary.expectedRelationship) {
    case "shared-plan-different-timing":
      if (!hasDependencyKind(canary, "timing") || !hasEvidenceKind(canary, "semantic-alignment")) {
        fail(childPath(path, "evidence"), "shared timing requires timing dependency and alignment evidence");
      }
      return;
    case "shared-subgoal-different-local-route":
      if (
        !hasDependencyKind(canary, "local-route")
        || !hasEvidenceKind(canary, "subgoal-contract")
        || !hasEvidenceKind(canary, "route", "ms")
        || !hasEvidenceKind(canary, "route", "lynx")
      ) {
        fail(childPath(path, "evidence"), "local-route variance requires a shared contract and both target routes");
      }
      return;
    case "alternative-branches-proven-rejoin":
      {
        const rejoin = canary.evidence.find(
          (entry) => entry.evidenceKind === "rejoin-boundary",
        );
        const dependency = canary.dependencies.find(
          (entry) => entry.kind === "branch-rejoin",
        );
        if (
          rejoin?.semanticRejoin === null
          || rejoin === undefined
          || rejoin.target !== "cross-ruleset"
          || rejoin.authority !== "authoritative"
          || dependency === undefined
          || !dependency.evidenceIds.includes(rejoin.evidenceId)
          || !canary.confidence.basisEvidenceIds.includes(rejoin.evidenceId)
        ) {
          fail(
            childPath(path, "evidence"),
            "a proven semantic rejoin requires referenced gameplay boundary and executed continuation evidence",
          );
        }
      }
      return;
    case "genuinely-different-plan":
      if (
        !hasDependencyKind(canary, "ruleset-plan")
        && !hasDependencyKind(canary, "causal-disagreement")
      ) {
        fail(childPath(path, "dependencies"), "different-plan proposal requires a plan or causal-disagreement dependency");
      }
  }
}

function normalizedCanary(value: unknown, path: string): P6bPortfolioCanaryV1 {
  const item = record(value, path);
  exactKeys(item, [
    "canaryId",
    "case",
    "targetScope",
    "expectedRelationship",
    "proposal",
    "evidence",
    "dependencies",
    "confidence",
    "unresolvedGaps",
    "reviewState",
  ], path);
  const canaryId = stableId(item.canaryId, childPath(path, "canaryId"));
  const parsedCase = canaryCase(item.case, childPath(path, "case"));
  const scopePath = childPath(path, "targetScope");
  const scope = record(item.targetScope, scopePath);
  exactKeys(scope, [
    "rulesets",
    "vocabulary",
    "expandedTiles",
    "eligibilityEvidenceId",
    "normalizationProfile",
  ], scopePath);
  if (
    !Array.isArray(scope.rulesets)
    || scope.rulesets.length !== 2
    || scope.rulesets[0] !== "ms"
    || scope.rulesets[1] !== "lynx"
  ) {
    fail(childPath(scopePath, "rulesets"), "expected exact paired target scope [ms, lynx]");
  }
  if (scope.vocabulary !== "cc1-standard") {
    fail(childPath(scopePath, "vocabulary"), "expected cc1-standard");
  }
  if (scope.expandedTiles !== "excluded") {
    fail(childPath(scopePath, "expandedTiles"), "expanded tiles must be excluded");
  }
  const parsedEvidence = evidenceCatalog(item.evidence, childPath(path, "evidence"));
  const evidenceById = new Map(parsedEvidence.map((entry) => [entry.evidenceId, entry]));
  const eligibilityEvidenceId = stableId(
    scope.eligibilityEvidenceId,
    childPath(scopePath, "eligibilityEvidenceId"),
  );
  const eligibility = evidenceById.get(eligibilityEvidenceId);
  if (eligibility?.evidenceKind !== "source-eligibility") {
    fail(childPath(scopePath, "eligibilityEvidenceId"), "expected a source-eligibility evidence reference");
  }
  if (!sameCanonical(eligibility.sourceEligibility?.sourceContent, parsedCase.source.content)) {
    fail(
      childPath(scopePath, "eligibilityEvidenceId"),
      "source eligibility must bind the canary case source bytes",
    );
  }
  const expectedEligibilityAuthority = parsedCase.kind === "corpus"
    ? "checked-eligibility"
    : "synthetic-fixture";
  if (eligibility.authority !== expectedEligibilityAuthority) {
    fail(
      childPath(scopePath, "eligibilityEvidenceId"),
      `expected ${expectedEligibilityAuthority} source eligibility for ${parsedCase.kind} case`,
    );
  }
  if (eligibility.target !== "cross-ruleset") {
    fail(
      childPath(scopePath, "eligibilityEvidenceId"),
      "paired target scope requires cross-ruleset source eligibility evidence",
    );
  }
  const proposalPath = childPath(path, "proposal");
  const proposal = record(item.proposal, proposalPath);
  exactKeys(proposal, ["familyId", "title"], proposalPath);
  const evidenceIds = new Set(evidenceById.keys());
  const normalized: P6bPortfolioCanaryV1 = {
    canaryType: "p6b-portfolio-canary",
    canaryVersion: 1,
    canaryId,
    case: parsedCase,
    targetScope: {
      rulesets: ["ms", "lynx"],
      vocabulary: "cc1-standard",
      expandedTiles: "excluded",
      eligibilityEvidenceId,
      normalizationProfile: stableId(
        scope.normalizationProfile,
        childPath(scopePath, "normalizationProfile"),
      ),
    },
    expectedRelationship: oneOf(
      item.expectedRelationship,
      P6B_REQUIRED_RELATIONSHIPS_V1,
      childPath(path, "expectedRelationship"),
    ),
    claim: { kind: "proposal", proofStatus: "not-proven" },
    proposal: {
      familyId: stableId(proposal.familyId, childPath(proposalPath, "familyId")),
      title: durableText(proposal.title, childPath(proposalPath, "title"), MAX_TITLE_SCALARS),
    },
    evidence: parsedEvidence,
    dependencies: dependencies(item.dependencies, childPath(path, "dependencies"), evidenceIds),
    confidence: confidence(item.confidence, childPath(path, "confidence"), evidenceIds),
    unresolvedGaps: unresolvedGaps(item.unresolvedGaps, childPath(path, "unresolvedGaps")),
    reviewState: reviewState(item.reviewState, childPath(path, "reviewState"), parsedEvidence),
  };
  assertRelationshipEvidence(normalized, path);
  return normalized;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left as CanonicalJsonValue) === canonicalizeJson(right as CanonicalJsonValue);
}

type NamedRealCanaryV1 = typeof P6B_NAMED_REAL_CANARIES_V1[keyof typeof P6B_NAMED_REAL_CANARIES_V1];

function expectedNamedCase(named: NamedRealCanaryV1) {
  return {
    kind: "corpus" as const,
    caseId: named.caseId,
    occurrenceId: named.occurrenceId,
    title: named.title,
    source: {
      kind: "repository-level-member" as const,
      path: named.sourceMember.path,
      ordinal: named.sourceMember.ordinal,
      content: named.sourceMember.content,
    },
  };
}

function assertNamedRealCanaries(canaries: readonly P6bPortfolioCanaryV1[]): void {
  const requirements = [
    P6B_NAMED_REAL_CANARIES_V1.cclp1Level67,
    P6B_NAMED_REAL_CANARIES_V1.cclp3Level16,
  ];
  for (const named of requirements) {
    const index = canaries.findIndex(({ canaryId }) => canaryId === named.canaryId);
    const canary = canaries[index];
    if (
      canary === undefined
      || !sameCanonical(canary.case, expectedNamedCase(named))
      || canary.expectedRelationship !== "genuinely-different-plan"
      || canary.confidence.level !== "low"
    ) {
      fail("/canaries", `missing exact low-confidence named real canary ${named.occurrenceId}`);
    }
    if (!canary.unresolvedGaps.some(
      ({ kind }) => kind === "missing-independent-causal-evidence",
    )) {
      fail(
        childPath(childPath("/canaries", index), "unresolvedGaps"),
        "named real canary must retain the missing independent causal evidence gap",
      );
    }
    if (!canary.evidence.some((entry) => (
      entry.evidenceKind === "static-comparison"
      && entry.target === "cross-ruleset"
      && (entry.authority === "checked-preview" || entry.authority === "diagnostic-only")
      && sameCanonical(entry.content, named.staticComparisonContent)
    ))) {
      fail(
        childPath(childPath("/canaries", index), "evidence"),
        "named real canary must bind diagnostic static-comparison evidence",
      );
    }
    const eligibility = canary.evidence.find(
      ({ evidenceId }) => evidenceId === canary.targetScope.eligibilityEvidenceId,
    );
    if (
      eligibility?.target !== "cross-ruleset"
      || !sameCanonical(eligibility.sourceEligibility?.sourceContent, named.sourceMember.content)
      || !sameCanonical(
        eligibility.sourceEligibility?.validityContent,
        named.validityOccurrenceContent,
      )
      || eligibility.sourceEligibility?.expandedTileIssueCount !== 0
    ) {
      fail(
        childPath(childPath("/canaries", index), "evidence"),
        "named real canary eligibility does not bind exact source, validity, and standard scope",
      );
    }
  }
}

function assertCoverage(canaries: readonly P6bPortfolioCanaryV1[]): void {
  const covered = new Set(canaries.map(({ expectedRelationship }) => expectedRelationship));
  if (P6B_REQUIRED_RELATIONSHIPS_V1.some((relationship) => !covered.has(relationship))) {
    fail("/canaries", "missing required P6B portfolio relationship coverage");
  }
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value as CanonicalJsonValue)) as T;
}

export function buildP6bPortfolioCanarySuite(
  input: P6bPortfolioCanarySuiteInputV1,
): P6bPortfolioCanarySuiteV1 {
  const item = record(input, "");
  exactKeys(item, ["suiteVersion", "suiteId", "canaries"], "");
  if (item.suiteVersion !== 1) fail("/suiteVersion", "expected 1");
  if (!Array.isArray(item.canaries) || item.canaries.length < 4 || item.canaries.length > P6B_MAX_CANARIES) {
    fail("/canaries", `expected four through ${P6B_MAX_CANARIES} canaries`);
  }
  const ids = new Set<string>();
  const canaries = item.canaries.map((entry, index) => {
    const parsed = normalizedCanary(entry, childPath("/canaries", index));
    if (ids.has(parsed.canaryId)) {
      fail(childPath(childPath("/canaries", index), "canaryId"), "duplicate canary ID");
    }
    ids.add(parsed.canaryId);
    return parsed;
  }).sort((left, right) => compareText(left.canaryId, right.canaryId));
  assertCoverage(canaries);
  assertNamedRealCanaries(canaries);
  const output: P6bPortfolioCanarySuiteV1 = {
    suiteType: P6B_PORTFOLIO_CANARY_SUITE_TYPE,
    suiteVersion: P6B_PORTFOLIO_CANARY_SUITE_VERSION,
    suiteId: stableId(item.suiteId, "/suiteId"),
    standardOnly: true,
    canariesOrder: "canary-id",
    relationshipCoverage: P6B_REQUIRED_RELATIONSHIPS_V1,
    bounds: {
      maximumCanaries: P6B_MAX_CANARIES,
      maximumEvidencePerCanary: P6B_MAX_EVIDENCE_PER_CANARY,
      maximumDependenciesPerCanary: P6B_MAX_DEPENDENCIES_PER_CANARY,
      maximumUnresolvedGapsPerCanary: P6B_MAX_UNRESOLVED_GAPS_PER_CANARY,
      maximumEvidenceBytesPerEntry: P6B_MAX_EVIDENCE_BYTES_PER_ENTRY,
      maximumReferencedEvidenceBytesPerCanary: P6B_MAX_REFERENCED_EVIDENCE_BYTES_PER_CANARY,
    },
    canaries,
  };
  const copy = canonicalCopy(output);
  assertP6bPortfolioCanarySuiteV1(copy);
  return copy;
}

function assertSortedUniqueIds(
  entries: readonly Record<string, unknown>[],
  key: string,
  path: string,
): void {
  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index]?.[key];
    if (typeof current !== "string") fail(childPath(childPath(path, index), key), "expected string ID");
    if (index > 0) {
      const previous = entries[index - 1]?.[key];
      if (typeof previous !== "string" || compareText(previous, current) >= 0) {
        fail(path, `expected strict ${key} order`);
      }
    }
  }
}

export function assertP6bPortfolioCanarySuiteV1(
  value: unknown,
): asserts value is P6bPortfolioCanarySuiteV1 {
  const suite = record(value, "");
  exactKeys(suite, [
    "suiteType",
    "suiteVersion",
    "suiteId",
    "standardOnly",
    "canariesOrder",
    "relationshipCoverage",
    "bounds",
    "canaries",
  ], "");
  if (suite.suiteType !== P6B_PORTFOLIO_CANARY_SUITE_TYPE) fail("/suiteType", "unknown suite type");
  if (suite.suiteVersion !== P6B_PORTFOLIO_CANARY_SUITE_VERSION) fail("/suiteVersion", "unknown suite version");
  stableId(suite.suiteId, "/suiteId");
  if (suite.standardOnly !== true) fail("/standardOnly", "expected true");
  if (suite.canariesOrder !== "canary-id") fail("/canariesOrder", "expected canary-id");
  if (!sameCanonical(suite.relationshipCoverage, P6B_REQUIRED_RELATIONSHIPS_V1)) {
    fail("/relationshipCoverage", "expected exact required relationship coverage");
  }
  const bounds = record(suite.bounds, "/bounds");
  exactKeys(bounds, [
    "maximumCanaries",
    "maximumEvidencePerCanary",
    "maximumDependenciesPerCanary",
    "maximumUnresolvedGapsPerCanary",
    "maximumEvidenceBytesPerEntry",
    "maximumReferencedEvidenceBytesPerCanary",
  ], "/bounds");
  const expectedBounds: P6bPortfolioCanarySuiteV1["bounds"] = {
    maximumCanaries: P6B_MAX_CANARIES,
    maximumEvidencePerCanary: P6B_MAX_EVIDENCE_PER_CANARY,
    maximumDependenciesPerCanary: P6B_MAX_DEPENDENCIES_PER_CANARY,
    maximumUnresolvedGapsPerCanary: P6B_MAX_UNRESOLVED_GAPS_PER_CANARY,
    maximumEvidenceBytesPerEntry: P6B_MAX_EVIDENCE_BYTES_PER_ENTRY,
    maximumReferencedEvidenceBytesPerCanary: P6B_MAX_REFERENCED_EVIDENCE_BYTES_PER_CANARY,
  };
  if (!sameCanonical(bounds, expectedBounds)) fail("/bounds", "unexpected implementation bounds");
  if (!Array.isArray(suite.canaries) || suite.canaries.length < 4 || suite.canaries.length > P6B_MAX_CANARIES) {
    fail("/canaries", `expected four through ${P6B_MAX_CANARIES} canaries`);
  }
  assertSortedUniqueIds(suite.canaries.map((entry, index) => record(entry, childPath("/canaries", index))), "canaryId", "/canaries");
  const canaries = suite.canaries.map((entry, index) => {
    const path = childPath("/canaries", index);
    const item = record(entry, path);
    exactKeys(item, [
      "canaryType",
      "canaryVersion",
      "canaryId",
      "case",
      "targetScope",
      "expectedRelationship",
      "claim",
      "proposal",
      "evidence",
      "dependencies",
      "confidence",
      "unresolvedGaps",
      "reviewState",
    ], path);
    if (item.canaryType !== "p6b-portfolio-canary") fail(childPath(path, "canaryType"), "unknown canary type");
    if (item.canaryVersion !== 1) fail(childPath(path, "canaryVersion"), "unknown canary version");
    const claimPath = childPath(path, "claim");
    const claim = record(item.claim, claimPath);
    exactKeys(claim, ["kind", "proofStatus"], claimPath);
    if (claim.kind !== "proposal") fail(childPath(claimPath, "kind"), "expected proposal");
    if (claim.proofStatus !== "not-proven") fail(childPath(claimPath, "proofStatus"), "proposal cannot be proof");
    const inputShape = { ...item };
    delete inputShape.canaryType;
    delete inputShape.canaryVersion;
    delete inputShape.claim;
    const normalized = normalizedCanary(inputShape, path);
    if (!sameCanonical(normalized, item)) fail(path, "canary is not in canonical normalized form");
    return normalized;
  });
  assertCoverage(canaries);
  assertNamedRealCanaries(canaries);
  try {
    canonicalizeJson(value as unknown as CanonicalJsonValue);
  } catch (cause) {
    fail("", "suite is not canonical-JSON-safe", { cause });
  }
}

export function canonicalizeP6bPortfolioCanarySuiteV1(
  value: unknown,
): string {
  assertP6bPortfolioCanarySuiteV1(value);
  return `${canonicalizeJson(value as unknown as CanonicalJsonValue)}\n`;
}
