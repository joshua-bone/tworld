import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  P6B_MAX_EVIDENCE_BYTES_PER_ENTRY,
  P6B_NAMED_REAL_CANARIES_V1,
  assertP6bPortfolioCanarySuiteV1,
  buildP6bPortfolioCanarySuite,
  canonicalizeP6bPortfolioCanarySuiteV1,
} from "../../dist/alignment/index.js";

const ccsolverRoot = resolve(import.meta.dirname, "../..");

const blob = (character, byteLength = 100) => ({
  digest: `sha256:${character.repeat(64)}`,
  byteLength,
});

async function checkedBlob(path) {
  const content = await readFile(resolve(ccsolverRoot, path));
  return {
    digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    byteLength: content.byteLength,
  };
}

async function checkedJson(path) {
  return JSON.parse(await readFile(resolve(ccsolverRoot, path), "utf8"));
}

async function checkedValidityOccurrenceBlob(occurrenceId) {
  const report = JSON.parse(await readFile(
    resolve(ccsolverRoot, "corpus/p1b-validity-report.v1.json"),
    "utf8",
  ));
  const occurrence = report.occurrences.find((entry) => entry.occurrenceId === occurrenceId);
  assert.ok(occurrence, `missing checked validity occurrence ${occurrenceId}`);
  assert.deepEqual(occurrence.validity, {
    invalidCellCount: 0,
    issueCount: 0,
    status: "valid",
  });
  assert.equal(occurrence.paired, true);
  const content = Buffer.from(JSON.stringify(occurrence));
  return {
    digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    byteLength: content.byteLength,
  };
}

async function checkedMeasuredStaticComparison(occurrenceId) {
  const report = JSON.parse(await readFile(
    resolve(ccsolverRoot, "corpus/p1b-measured-corpus.v1.json"),
    "utf8",
  ));
  const measuredCase = report.cases.find((entry) => entry.occurrenceId === occurrenceId);
  assert.ok(measuredCase, `missing checked measured case ${occurrenceId}`);
  assert.equal(measuredCase.comparison.status, "divergent");
  assert.ok(measuredCase.comparison.cellPolicyDifferenceCount > 0);
  return measuredCase.comparison.content;
}

const KEY_PYRAMID_CASE = {
  canaryId: "canary:p6b:shared-plan-different-timing",
  caseId: "case:sha256:35751e31472d608d0285a1cbdb9966b0920e92da6a250a40de33b65c8976719f",
  occurrenceId: "cclp1/001",
  title: "Key Pyramid",
  sourceMember: {
    path: "data/CCLP1.dat",
    ordinal: 0,
    content: {
      digest: "sha256:888d46dc1e6863694579b5f34106cf84b267b7b2a837ec11f42cd2f6e0655071",
      byteLength: 424,
    },
  },
};

function syntheticCase(suffix, title) {
  return {
    kind: "synthetic",
    caseId: `case:synthetic:p6b:${suffix}`,
    occurrenceId: `synthetic:p6b:${suffix}`,
    title,
    source: {
      kind: "synthetic",
      fixtureId: `fixture:p6b:${suffix}`,
      content: blob(suffix === "timing" ? "1" : suffix === "local-route" ? "2" : "3"),
    },
  };
}

function corpusCase(named) {
  return {
    kind: "corpus",
    caseId: named.caseId,
    occurrenceId: named.occurrenceId,
    title: named.title,
    source: {
      kind: "repository-level-member",
      path: named.sourceMember.path,
      ordinal: named.sourceMember.ordinal,
      content: named.sourceMember.content,
    },
  };
}

function evidence(
  evidenceId,
  evidenceKind,
  authority,
  content,
  target = "cross-ruleset",
) {
  return {
    evidenceId,
    evidenceKind,
    target,
    authority,
    content,
    sourceEligibility: null,
    semanticRejoin: evidenceKind === "rejoin-boundary"
      ? {
          kind: "semantic-state-and-executed-continuation",
          targets: [
            {
              target: "ms",
              leftBoundary: blob("b", 200),
              rightBoundary: blob("b", 200),
              boundariesEqual: true,
              leftSemanticFingerprint: `sha256:${"1".repeat(64)}`,
              rightSemanticFingerprint: `sha256:${"1".repeat(64)}`,
              semanticFingerprintsEqual: true,
              leftNativeExactFingerprint: `sha256:${"2".repeat(64)}`,
              rightNativeExactFingerprint: `sha256:${"2".repeat(64)}`,
              nativeExactFingerprintsEqual: true,
              leftContinuation: blob("c", 300),
              rightContinuation: blob("c", 300),
              continuationsEqual: true,
            },
            {
              target: "lynx",
              leftBoundary: blob("d", 200),
              rightBoundary: blob("d", 200),
              boundariesEqual: true,
              leftSemanticFingerprint: `sha256:${"4".repeat(64)}`,
              rightSemanticFingerprint: `sha256:${"4".repeat(64)}`,
              semanticFingerprintsEqual: true,
              leftNativeExactFingerprint: `sha256:${"5".repeat(64)}`,
              rightNativeExactFingerprint: `sha256:${"6".repeat(64)}`,
              nativeExactFingerprintsEqual: false,
              leftContinuation: blob("e", 300),
              rightContinuation: blob("e", 300),
              continuationsEqual: true,
            },
          ],
        }
      : null,
  };
}

function review(evidenceEntries, status = "unreviewed") {
  return {
    status,
    evidenceBindings: evidenceEntries.map((entry) => ({
      evidenceId: entry.evidenceId,
      evidence: JSON.parse(JSON.stringify(entry)),
    })),
  };
}

function canary({
  canaryId,
  caseIdentity,
  relationship,
  evidenceEntries,
  dependencies,
  confidence,
  unresolvedGaps = [],
  reviewStatus = "unreviewed",
}) {
  const eligibilityEvidence = evidenceEntries.filter(
    ({ evidenceKind }) => evidenceKind === "source-eligibility",
  );
  assert.equal(eligibilityEvidence.length, 1);
  const normalizedEvidence = evidenceEntries.map((entry) => (
    entry.evidenceKind === "source-eligibility"
      ? {
          ...entry,
          authority: caseIdentity.kind === "corpus" ? "checked-eligibility" : entry.authority,
          sourceEligibility: {
            kind: "standard-source-eligibility",
            sourceContent: caseIdentity.source.content,
            validityContent: entry.content,
            scopeReportContent: blob("e", 256),
            scopePolicyRevision:
              "ccsolver-source-scope:no-expanded-cc1-tiles:dattools-68be18aca0dc42fa3929ff8160c6c8acea8c18e5:v1",
            status: "eligible",
            expandedTileIssueCount: 0,
            targetRulesets: ["ms", "lynx"],
          },
        }
      : entry
  ));
  return {
    canaryId,
    case: caseIdentity,
    targetScope: {
      rulesets: ["ms", "lynx"],
      vocabulary: "cc1-standard",
      expandedTiles: "excluded",
      eligibilityEvidenceId: eligibilityEvidence[0].evidenceId,
      normalizationProfile: caseIdentity.kind === "corpus"
        ? "tworld-legacy-dat-gameplay-v1"
        : "synthetic:p6b-standard-v1",
    },
    expectedRelationship: relationship,
    proposal: {
      familyId: `family:${canaryId}`,
      title: caseIdentity.title,
    },
    evidence: normalizedEvidence,
    dependencies,
    confidence,
    unresolvedGaps,
    reviewState: review(normalizedEvidence, reviewStatus),
  };
}

async function acceptanceInput() {
  const [checkedAlignment, checkedPortfolio] = await Promise.all([
    checkedJson("fixtures/golden/p6a/cclp1-001/alignment.json"),
    checkedJson("fixtures/golden/p6a/cclp1-001/portfolio.json"),
  ]);
  assert.ok(checkedAlignment.summary.nativeTimingDifferences > 0);
  assert.equal(checkedAlignment.summary.terminalAnchorsMatched, true);
  assert.equal(checkedPortfolio.families[0].planShape, "shared-plan");
  assert.notEqual(checkedPortfolio.families[0].resolution, "verified");
  const keyPyramidEligibility = evidence(
    "evidence:p1b:cclp1-001:source-eligibility",
    "source-eligibility",
    "checked-validity",
    await checkedValidityOccurrenceBlob("cclp1/001"),
  );
  const p6aAlignment = evidence(
    "evidence:p6a:key-pyramid:alignment",
    "semantic-alignment",
    "checked-preview",
    await checkedBlob("fixtures/golden/p6a/cclp1-001/alignment.json"),
  );
  const p6aPortfolio = evidence(
    "evidence:p6a:key-pyramid:portfolio",
    "strategy-portfolio",
    "checked-preview",
    await checkedBlob("fixtures/golden/p6a/cclp1-001/portfolio.json"),
  );
  const timingEvidence = [p6aPortfolio, keyPyramidEligibility, p6aAlignment];

  const localEligibility = evidence(
    "evidence:synthetic:local-route:source-eligibility",
    "source-eligibility",
    "synthetic-fixture",
    blob("9"),
  );

  const localMs = evidence(
    "evidence:synthetic:local-route:ms",
    "route",
    "synthetic-fixture",
    blob("4"),
    "ms",
  );
  const localLynx = evidence(
    "evidence:synthetic:local-route:lynx",
    "route",
    "synthetic-fixture",
    blob("5"),
    "lynx",
  );
  const localContract = evidence(
    "evidence:synthetic:local-route:subgoal",
    "subgoal-contract",
    "synthetic-fixture",
    blob("6"),
  );
  const localEvidence = [localLynx, localContract, localEligibility, localMs];

  const branchEligibility = evidence(
    "evidence:synthetic:branch:source-eligibility",
    "source-eligibility",
    "synthetic-fixture",
    blob("a"),
  );

  const branchAlignment = evidence(
    "evidence:synthetic:branch:alignment",
    "semantic-alignment",
    "synthetic-fixture",
    blob("7"),
  );
  const branchRejoin = evidence(
    "evidence:synthetic:branch:rejoin",
    "rejoin-boundary",
    "authoritative",
    blob("8"),
  );
  const branchEvidence = [branchRejoin, branchEligibility, branchAlignment];

  const cclp3Validity = await checkedValidityOccurrenceBlob("cclp3/016");
  assert.deepEqual(
    cclp3Validity,
    P6B_NAMED_REAL_CANARIES_V1.cclp3Level16.validityOccurrenceContent,
  );
  const cclp3Eligibility = evidence(
    "evidence:p1b:cclp3-016:source-eligibility",
    "source-eligibility",
    "checked-validity",
    cclp3Validity,
  );
  const cclp3StaticComparison = await checkedMeasuredStaticComparison("cclp3/016");
  assert.deepEqual(
    cclp3StaticComparison,
    P6B_NAMED_REAL_CANARIES_V1.cclp3Level16.staticComparisonContent,
  );
  const cclp3Comparison = evidence(
    "evidence:p1b:cclp3-016:static-comparison",
    "static-comparison",
    "checked-preview",
    cclp3StaticComparison,
  );
  const cclp1Validity = await checkedValidityOccurrenceBlob("cclp1/067");
  assert.deepEqual(
    cclp1Validity,
    P6B_NAMED_REAL_CANARIES_V1.cclp1Level67.validityOccurrenceContent,
  );
  const cclp1Eligibility = evidence(
    "evidence:p1b:cclp1-067:source-eligibility",
    "source-eligibility",
    "checked-validity",
    cclp1Validity,
  );
  const cclp1StaticComparison = await checkedMeasuredStaticComparison("cclp1/067");
  assert.deepEqual(
    cclp1StaticComparison,
    P6B_NAMED_REAL_CANARIES_V1.cclp1Level67.staticComparisonContent,
  );
  const cclp1Comparison = evidence(
    "evidence:p1b:cclp1-067:static-comparison",
    "static-comparison",
    "checked-preview",
    cclp1StaticComparison,
  );

  return {
    suiteVersion: 1,
    suiteId: "suite:p6b:standard-portfolio-canaries",
    canaries: [
      canary({
        canaryId: "canary:p6b:shared-plan-different-timing",
        caseIdentity: corpusCase(KEY_PYRAMID_CASE),
        relationship: "shared-plan-different-timing",
        evidenceEntries: timingEvidence,
        dependencies: [{
          dependencyId: "dependency:p6b:native-timing",
          kind: "timing",
          targetRulesets: ["lynx", "ms"],
          evidenceIds: timingEvidence.map(({ evidenceId }) => evidenceId),
        }],
        confidence: {
          level: "high",
          basisEvidenceIds: timingEvidence.map(({ evidenceId }) => evidenceId),
        },
      }),
      canary({
        canaryId: "canary:p6b:shared-subgoal-different-local-route",
        caseIdentity: syntheticCase("local-route", "Shared subgoal with different local routes"),
        relationship: "shared-subgoal-different-local-route",
        evidenceEntries: localEvidence,
        dependencies: [{
          dependencyId: "dependency:p6b:local-route",
          kind: "local-route",
          targetRulesets: ["ms", "lynx"],
          evidenceIds: localEvidence.map(({ evidenceId }) => evidenceId),
        }],
        confidence: {
          level: "high",
          basisEvidenceIds: localEvidence.map(({ evidenceId }) => evidenceId),
        },
      }),
      canary({
        canaryId: "canary:p6b:alternative-branches-proven-rejoin",
        caseIdentity: syntheticCase("rejoin", "Alternative branches with a proven rejoin"),
        relationship: "alternative-branches-proven-rejoin",
        evidenceEntries: branchEvidence,
        dependencies: [{
          dependencyId: "dependency:p6b:branch-rejoin",
          kind: "branch-rejoin",
          targetRulesets: ["lynx", "ms"],
          evidenceIds: branchEvidence.map(({ evidenceId }) => evidenceId),
        }],
        confidence: {
          level: "high",
          basisEvidenceIds: branchEvidence.map(({ evidenceId }) => evidenceId),
        },
      }),
      canary({
        canaryId: P6B_NAMED_REAL_CANARIES_V1.cclp3Level16.canaryId,
        caseIdentity: corpusCase(P6B_NAMED_REAL_CANARIES_V1.cclp3Level16),
        relationship: "genuinely-different-plan",
        evidenceEntries: [cclp3Eligibility, cclp3Comparison],
        dependencies: [{
          dependencyId: "dependency:p6b:cclp3-016:ruleset-plan",
          kind: "ruleset-plan",
          targetRulesets: ["ms", "lynx"],
          evidenceIds: [cclp3Comparison.evidenceId],
        }],
        confidence: {
          level: "low",
          basisEvidenceIds: [cclp3Eligibility.evidenceId, cclp3Comparison.evidenceId],
        },
        unresolvedGaps: [{
          gapId: "gap:p6b:cclp3-016:independent-causal-evidence",
          kind: "missing-independent-causal-evidence",
          targetRulesets: ["ms", "lynx"],
          description: "The named real canary is source-bound but has no independent paired causal evidence in this bounded model test.",
        }],
      }),
      canary({
        canaryId: P6B_NAMED_REAL_CANARIES_V1.cclp1Level67.canaryId,
        caseIdentity: corpusCase(P6B_NAMED_REAL_CANARIES_V1.cclp1Level67),
        relationship: "genuinely-different-plan",
        evidenceEntries: [cclp1Eligibility, cclp1Comparison],
        dependencies: [{
          dependencyId: "dependency:p6b:cclp1-067:causal-disagreement",
          kind: "causal-disagreement",
          targetRulesets: ["lynx", "ms"],
          evidenceIds: [cclp1Comparison.evidenceId],
        }],
        confidence: {
          level: "low",
          basisEvidenceIds: [cclp1Eligibility.evidenceId, cclp1Comparison.evidenceId],
        },
        unresolvedGaps: [{
          gapId: "gap:p6b:cclp1-067:independent-causal-evidence",
          kind: "missing-independent-causal-evidence",
          targetRulesets: ["lynx", "ms"],
          description: "The named donor-disagreement canary requires independent paired causal evidence before its proposed relationship can be reviewed.",
        }],
      }),
    ],
  };
}

function clone(value) {
  return structuredClone(value);
}

test("freezes the bounded standard-only P6B portfolio canary suite without proving proposals", async () => {
  const input = await acceptanceInput();
  const suite = buildP6bPortfolioCanarySuite(input);

  assert.equal(suite.suiteType, "p6b-portfolio-canary-suite");
  assert.equal(suite.suiteVersion, 1);
  assert.equal(suite.standardOnly, true);
  assert.equal(suite.canaries.length, 5);
  assert.deepEqual(
    [...new Set(suite.canaries.map(({ expectedRelationship }) => expectedRelationship))].sort(),
    [
      "alternative-branches-proven-rejoin",
      "genuinely-different-plan",
      "shared-plan-different-timing",
      "shared-subgoal-different-local-route",
    ],
  );
  assert.ok(suite.canaries.every(({ claim, targetScope }) => (
    claim.kind === "proposal"
    && claim.proofStatus === "not-proven"
    && targetScope.vocabulary === "cc1-standard"
    && targetScope.expandedTiles === "excluded"
    && JSON.stringify(targetScope.rulesets) === JSON.stringify(["ms", "lynx"])
  )));
  assert.deepEqual(
    suite.canaries.map(({ canaryId }) => canaryId),
    [...suite.canaries.map(({ canaryId }) => canaryId)].sort(),
  );

  const cclp3 = suite.canaries.find(({ case: value }) => value.occurrenceId === "cclp3/016");
  assert.deepEqual(cclp3?.case, corpusCase(P6B_NAMED_REAL_CANARIES_V1.cclp3Level16));
  assert.equal(cclp3?.case.title, "Two Sets of Rules");
  assert.equal(cclp3?.expectedRelationship, "genuinely-different-plan");

  const cclp1 = suite.canaries.find(({ case: value }) => value.occurrenceId === "cclp1/067");
  assert.deepEqual(cclp1?.case, corpusCase(P6B_NAMED_REAL_CANARIES_V1.cclp1Level67));
  assert.equal(cclp1?.case.title, "Booster Shots");
  assert.equal(cclp1?.confidence.level, "low");
  assert.ok(cclp1?.unresolvedGaps.some(
    ({ kind }) => kind === "missing-independent-causal-evidence",
  ));

  assertP6bPortfolioCanarySuiteV1(suite);
  assert.equal(
    canonicalizeP6bPortfolioCanarySuiteV1(suite),
    canonicalizeP6bPortfolioCanarySuiteV1(buildP6bPortfolioCanarySuite(clone(input))),
  );
});

test("human review cannot upgrade a P6B proposal into proof", async () => {
  const input = await acceptanceInput();
  input.canaries[0].reviewState.status = "reviewed";
  const suite = buildP6bPortfolioCanarySuite(input);
  const reviewed = suite.canaries.find(
    ({ canaryId }) => canaryId === input.canaries[0].canaryId,
  );
  assert.equal(reviewed?.reviewState.status, "reviewed");
  assert.deepEqual(reviewed?.claim, { kind: "proposal", proofStatus: "not-proven" });
});

test("rejects expanded scope and a stale human-review evidence binding", async () => {
  const expanded = await acceptanceInput();
  expanded.canaries[0].targetScope.expandedTiles = "allowed";
  assert.throws(
    () => buildP6bPortfolioCanarySuite(expanded),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/targetScope/expandedTiles"),
  );

  const stale = await acceptanceInput();
  stale.canaries[0].reviewState.status = "reviewed";
  stale.canaries[0].reviewState.evidenceBindings[0].evidence.content = blob("f");
  assert.throws(
    () => buildP6bPortfolioCanarySuite(stale),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/reviewState/evidenceBindings/0/evidence"),
  );

  const staleNested = await acceptanceInput();
  staleNested.canaries[0].reviewState.status = "reviewed";
  const nestedBinding = staleNested.canaries[0].reviewState.evidenceBindings.find(
    ({ evidence }) => evidence.evidenceKind === "source-eligibility",
  );
  nestedBinding.evidence.sourceEligibility.scopeReportContent = blob("f");
  assert.throws(
    () => buildP6bPortfolioCanarySuite(staleNested),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/reviewState/evidenceBindings"),
  );
});

test("requires standard eligibility, honest semantic rejoin evidence, and bounded references", async () => {
  const wrongEligibility = await acceptanceInput();
  wrongEligibility.canaries[0].targetScope.eligibilityEvidenceId = wrongEligibility.canaries[0]
    .evidence.find(({ evidenceKind }) => evidenceKind === "semantic-alignment").evidenceId;
  assert.throws(
    () => buildP6bPortfolioCanarySuite(wrongEligibility),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/targetScope/eligibilityEvidenceId"),
  );

  const targetSpecificEligibility = await acceptanceInput();
  targetSpecificEligibility.canaries[0].evidence.find(
    ({ evidenceId }) => (
      evidenceId === targetSpecificEligibility.canaries[0].targetScope.eligibilityEvidenceId
    ),
  ).target = "ms";
  assert.throws(
    () => buildP6bPortfolioCanarySuite(targetSpecificEligibility),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/targetScope/eligibilityEvidenceId"),
  );

  const foreignSourceEligibility = await acceptanceInput();
  const foreignEligibility = foreignSourceEligibility.canaries[0].evidence.find(
    ({ evidenceId }) => (
      evidenceId === foreignSourceEligibility.canaries[0].targetScope.eligibilityEvidenceId
    ),
  );
  foreignEligibility.sourceEligibility.sourceContent = blob("f", 999);
  foreignSourceEligibility.canaries[0].reviewState.evidenceBindings.find(
    ({ evidenceId }) => evidenceId === foreignEligibility.evidenceId,
  ).evidence.sourceEligibility.sourceContent = foreignEligibility.sourceEligibility.sourceContent;
  assert.throws(
    () => buildP6bPortfolioCanarySuite(foreignSourceEligibility),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/targetScope/eligibilityEvidenceId"),
  );

  const heuristicOnlyRejoin = await acceptanceInput();
  const branch = heuristicOnlyRejoin.canaries.find(
    ({ expectedRelationship }) => expectedRelationship === "alternative-branches-proven-rejoin",
  );
  branch.evidence.find(
    ({ evidenceKind }) => evidenceKind === "rejoin-boundary",
  ).semanticRejoin.targets[0].rightBoundary = blob("f", 200);
  assert.throws(
    () => buildP6bPortfolioCanarySuite(heuristicOnlyRejoin),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/semanticRejoin"),
  );

  const falseNativeEquality = await acceptanceInput();
  const falseNativeEqualityReceipt = falseNativeEquality.canaries.find(
    ({ expectedRelationship }) => expectedRelationship === "alternative-branches-proven-rejoin",
  ).evidence.find(({ evidenceKind }) => evidenceKind === "rejoin-boundary");
  falseNativeEqualityReceipt.semanticRejoin.targets[1].nativeExactFingerprintsEqual = true;
  assert.throws(
    () => buildP6bPortfolioCanarySuite(falseNativeEquality),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/semanticRejoin/targets/1"),
  );

  const unequalSemanticState = await acceptanceInput();
  const unequalSemanticReceipt = unequalSemanticState.canaries.find(
    ({ expectedRelationship }) => expectedRelationship === "alternative-branches-proven-rejoin",
  ).evidence.find(({ evidenceKind }) => evidenceKind === "rejoin-boundary");
  unequalSemanticReceipt.semanticRejoin.targets[0].rightSemanticFingerprint = `sha256:${"7".repeat(64)}`;
  assert.throws(
    () => buildP6bPortfolioCanarySuite(unequalSemanticState),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/semanticRejoin"),
  );

  const targetSpecificRejoin = await acceptanceInput();
  const targetSpecificBranch = targetSpecificRejoin.canaries.find(
    ({ expectedRelationship }) => expectedRelationship === "alternative-branches-proven-rejoin",
  );
  const targetSpecificReceipt = targetSpecificBranch.evidence.find(
    ({ evidenceKind }) => evidenceKind === "rejoin-boundary",
  );
  targetSpecificReceipt.target = "ms";
  targetSpecificBranch.reviewState.evidenceBindings.find(
    ({ evidenceId }) => evidenceId === targetSpecificReceipt.evidenceId,
  ).evidence.target = "ms";
  assert.throws(
    () => buildP6bPortfolioCanarySuite(targetSpecificRejoin),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/evidence"),
  );

  const diagnosticOnlyRejoin = await acceptanceInput();
  const diagnosticBranch = diagnosticOnlyRejoin.canaries.find(
    ({ expectedRelationship }) => expectedRelationship === "alternative-branches-proven-rejoin",
  );
  const diagnosticReceipt = diagnosticBranch.evidence.find(
    ({ evidenceKind }) => evidenceKind === "rejoin-boundary",
  );
  diagnosticReceipt.authority = "diagnostic-only";
  diagnosticBranch.reviewState.evidenceBindings.find(
    ({ evidenceId }) => evidenceId === diagnosticReceipt.evidenceId,
  ).evidence.authority = "diagnostic-only";
  assert.throws(
    () => buildP6bPortfolioCanarySuite(diagnosticOnlyRejoin),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/evidence"),
  );

  const unboundRejoin = await acceptanceInput();
  const unboundBranch = unboundRejoin.canaries.find(
    ({ expectedRelationship }) => expectedRelationship === "alternative-branches-proven-rejoin",
  );
  const rejoinEvidenceId = unboundBranch.evidence.find(
    ({ evidenceKind }) => evidenceKind === "rejoin-boundary",
  ).evidenceId;
  unboundBranch.dependencies[0].evidenceIds = unboundBranch.dependencies[0].evidenceIds.filter(
    (evidenceId) => evidenceId !== rejoinEvidenceId,
  );
  assert.throws(
    () => buildP6bPortfolioCanarySuite(unboundRejoin),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/evidence"),
  );

  const nestedOversized = await acceptanceInput();
  const oversizedBranch = nestedOversized.canaries.find(
    ({ expectedRelationship }) => expectedRelationship === "alternative-branches-proven-rejoin",
  );
  for (const entry of oversizedBranch.evidence) {
    entry.content = blob("e", P6B_MAX_EVIDENCE_BYTES_PER_ENTRY);
  }
  const oversizedRejoin = oversizedBranch.evidence.find(
    ({ evidenceKind }) => evidenceKind === "rejoin-boundary",
  );
  for (const key of [
    "leftBoundary",
    "rightBoundary",
    "leftContinuation",
    "rightContinuation",
  ]) {
    for (const target of oversizedRejoin.semanticRejoin.targets) {
      target[key] = blob("d", P6B_MAX_EVIDENCE_BYTES_PER_ENTRY);
    }
  }
  for (const suffix of ["one", "two"]) {
    const filler = evidence(
      `evidence:synthetic:branch:filler-${suffix}`,
      "level-source",
      "synthetic-fixture",
      blob("c", P6B_MAX_EVIDENCE_BYTES_PER_ENTRY),
    );
    oversizedBranch.evidence.push(filler);
    oversizedBranch.reviewState.evidenceBindings.push({
      evidenceId: filler.evidenceId,
      evidence: JSON.parse(JSON.stringify(filler)),
    });
  }
  assert.throws(
    () => buildP6bPortfolioCanarySuite(nestedOversized),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/evidence"),
  );

  const oversizedEvidence = await acceptanceInput();
  oversizedEvidence.canaries[0].evidence[0].content.byteLength = P6B_MAX_EVIDENCE_BYTES_PER_ENTRY + 1;
  assert.throws(
    () => buildP6bPortfolioCanarySuite(oversizedEvidence),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/evidence/0/content/byteLength"),
  );
});

test("rejects dangling references, duplicate IDs, and bounded-array overflow", async () => {
  const dangling = await acceptanceInput();
  dangling.canaries[0].confidence.basisEvidenceIds = ["evidence:missing"];
  assert.throws(
    () => buildP6bPortfolioCanarySuite(dangling),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/confidence/basisEvidenceIds/0"),
  );

  const duplicate = await acceptanceInput();
  duplicate.canaries.push(clone(duplicate.canaries[0]));
  assert.throws(
    () => buildP6bPortfolioCanarySuite(duplicate),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/canaryId"),
  );

  const oversized = await acceptanceInput();
  oversized.canaries = Array.from({ length: 9 }, (_, index) => ({
    ...clone(oversized.canaries[0]),
    canaryId: `canary:p6b:overflow-${index}`,
    proposal: {
      ...clone(oversized.canaries[0].proposal),
      familyId: `family:p6b:overflow-${index}`,
    },
  }));
  assert.throws(
    () => buildP6bPortfolioCanarySuite(oversized),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path === "/canaries",
  );
});

test("rejects missing relationship coverage and missing or weakened named real canaries", async () => {
  const missingCoverage = await acceptanceInput();
  missingCoverage.canaries = missingCoverage.canaries.filter(
    ({ expectedRelationship }) => expectedRelationship !== "alternative-branches-proven-rejoin",
  );
  assert.throws(
    () => buildP6bPortfolioCanarySuite(missingCoverage),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path === "/canaries",
  );

  const missingNamed = await acceptanceInput();
  missingNamed.canaries = missingNamed.canaries.filter(
    ({ case: value }) => value.occurrenceId !== "cclp3/016",
  );
  assert.throws(
    () => buildP6bPortfolioCanarySuite(missingNamed),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path === "/canaries",
  );

  const weakenedCclp1 = await acceptanceInput();
  weakenedCclp1.canaries.find(
    ({ case: value }) => value.occurrenceId === "cclp1/067",
  ).unresolvedGaps = [];
  assert.throws(
    () => buildP6bPortfolioCanarySuite(weakenedCclp1),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/unresolvedGaps"),
  );

  const sourceOnlyCclp1 = await acceptanceInput();
  const sourceOnly = sourceOnlyCclp1.canaries.find(
    ({ case: value }) => value.occurrenceId === "cclp1/067",
  );
  sourceOnly.evidence = sourceOnly.evidence.filter(
    ({ evidenceKind }) => evidenceKind !== "static-comparison",
  );
  sourceOnly.dependencies[0].evidenceIds = [sourceOnly.targetScope.eligibilityEvidenceId];
  sourceOnly.confidence.basisEvidenceIds = [sourceOnly.targetScope.eligibilityEvidenceId];
  sourceOnly.reviewState.evidenceBindings = sourceOnly.reviewState.evidenceBindings.filter(
    ({ evidenceId }) => evidenceId === sourceOnly.targetScope.eligibilityEvidenceId,
  );
  assert.throws(
    () => buildP6bPortfolioCanarySuite(sourceOnlyCclp1),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/evidence"),
  );

  const wrongValidityCclp1 = await acceptanceInput();
  const wrongValidity = wrongValidityCclp1.canaries.find(
    ({ case: value }) => value.occurrenceId === "cclp1/067",
  );
  const eligibility = wrongValidity.evidence.find(
    ({ evidenceId }) => evidenceId === wrongValidity.targetScope.eligibilityEvidenceId,
  );
  eligibility.sourceEligibility.validityContent =
    P6B_NAMED_REAL_CANARIES_V1.cclp3Level16.validityOccurrenceContent;
  wrongValidity.reviewState.evidenceBindings.find(
    ({ evidenceId }) => evidenceId === eligibility.evidenceId,
  ).evidence.sourceEligibility.validityContent =
    P6B_NAMED_REAL_CANARIES_V1.cclp3Level16.validityOccurrenceContent;
  assert.throws(
    () => buildP6bPortfolioCanarySuite(wrongValidityCclp1),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/evidence"),
  );

  const wrongScope = await acceptanceInput();
  wrongScope.canaries[0].evidence.find(
    ({ evidenceId }) => evidenceId === wrongScope.canaries[0].targetScope.eligibilityEvidenceId,
  ).sourceEligibility.expandedTileIssueCount = 1;
  assert.throws(
    () => buildP6bPortfolioCanarySuite(wrongScope),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.includes("/sourceEligibility"),
  );
});

test("the serialized contract is closed, canonical, and ordered", async () => {
  const suite = buildP6bPortfolioCanarySuite(await acceptanceInput());
  const extra = clone(suite);
  extra.futureField = true;
  assert.throws(
    () => assertP6bPortfolioCanarySuiteV1(extra),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path === "/futureField",
  );

  const unsorted = clone(suite);
  unsorted.canaries.reverse();
  assert.throws(
    () => assertP6bPortfolioCanarySuiteV1(unsorted),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path === "/canaries",
  );

  const unknownVersion = clone(suite);
  unknownVersion.suiteVersion = 2;
  assert.throws(
    () => assertP6bPortfolioCanarySuiteV1(unknownVersion),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path === "/suiteVersion",
  );

  const promoted = clone(suite);
  promoted.canaries[0].claim.proofStatus = "proven";
  assert.throws(
    () => assertP6bPortfolioCanarySuiteV1(promoted),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/claim/proofStatus"),
  );

  const embeddedProof = clone(suite);
  embeddedProof.canaries[0].claim.proof = { certificateId: "certificate:not-allowed" };
  assert.throws(
    () => assertP6bPortfolioCanarySuiteV1(embeddedProof),
    (error) => error?.code === "p6b-portfolio-canary.invalid"
      && error?.path.endsWith("/claim/proof"),
  );

  const canonical = canonicalizeP6bPortfolioCanarySuiteV1(suite);
  assert.equal(canonical.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(canonical), suite);
});
