import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeP6bPortfolioCanarySuiteV1 } from "@tworld/ccsolver/alignment";
import { describe, expect, it } from "vitest";
import {
  buildP6bPortfolioCanaries,
  buildP6bPortfolioCanaryComposition,
} from "./buildP6bPortfolioCanaries";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const builtComposition = buildP6bPortfolioCanaryComposition(repositoryRoot);
const builtPortfolio = builtComposition.then(({ suite }) => suite);

describe("P6B checked portfolio-canary composition", () => {
  it("binds all four relationship shapes to five bounded proposal canaries", async () => {
    const suite = await builtPortfolio;

    expect(suite).toMatchObject({
      suiteType: "p6b-portfolio-canary-suite",
      suiteVersion: 1,
      suiteId: "suite:p6b:standard-portfolio-canaries",
      standardOnly: true,
    });
    expect(suite.canaries).toHaveLength(5);
    expect(new Set(suite.canaries.map(({ expectedRelationship }) => expectedRelationship))).toEqual(
      new Set([
        "shared-plan-different-timing",
        "shared-subgoal-different-local-route",
        "alternative-branches-proven-rejoin",
        "genuinely-different-plan",
      ]),
    );
    expect(suite.canaries.every(({ claim }) => (
      claim.kind === "proposal" && claim.proofStatus === "not-proven"
    ))).toBe(true);
    expect(canonicalizeP6bPortfolioCanarySuiteV1(suite)).toBe(
      `${JSON.stringify(suite)}\n`,
    );
    const rejoin = suite.canaries.find(({ expectedRelationship }) => (
      expectedRelationship === "alternative-branches-proven-rejoin"
    ))!;
    const semantic = rejoin.evidence.find(({ evidenceKind }) => (
      evidenceKind === "rejoin-boundary"
    ))!;
    expect(semantic.authority).toBe("authoritative");
    expect(semantic.semanticRejoin).toMatchObject({
      kind: "semantic-state-and-executed-continuation",
      targets: [
        {
          target: "ms",
          boundariesEqual: true,
          semanticFingerprintsEqual: true,
          nativeExactFingerprintsEqual: true,
          continuationsEqual: true,
        },
        {
          target: "lynx",
          boundariesEqual: true,
          semanticFingerprintsEqual: true,
          nativeExactFingerprintsEqual: false,
          continuationsEqual: true,
        },
      ],
    });
    const composition = await builtComposition;
    expect(composition.evidencePayloads.filter(({ evidenceKind }) => (
      evidenceKind === "source-eligibility"
    ))).toHaveLength(5);
    expect(composition.evidencePayloads.filter(({ evidenceKind }) => (
      evidenceKind === "semantic-rejoin"
    ))).toHaveLength(1);
  }, 90_000);

  it("retains exact real-corpus identity, checked validity, and divergent static evidence", async () => {
    const suite = await builtPortfolio;
    const named = suite.canaries.filter(({ canaryId }) => (
      canaryId.includes("booster-shots") || canaryId.includes("two-sets-of-rules")
    ));

    expect(named).toHaveLength(2);
    for (const canary of named) {
      expect(canary.case.kind).toBe("corpus");
      expect(canary.case.source.kind).toBe("repository-level-member");
      expect(canary.confidence.level).toBe("low");
      expect(canary.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          evidenceKind: "source-eligibility",
          authority: "checked-eligibility",
        }),
        expect.objectContaining({
          evidenceKind: "static-comparison",
          authority: "diagnostic-only",
          target: "cross-ruleset",
        }),
      ]));
      expect(canary.unresolvedGaps).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "missing-independent-causal-evidence" }),
      ]));
    }
    const keyPyramid = suite.canaries.find(({ canaryId }) => canaryId.includes("key-pyramid"))!;
    expect(keyPyramid.case).toMatchObject({
      caseId: "case:sha256:35751e31472d608d0285a1cbdb9966b0920e92da6a250a40de33b65c8976719f",
      occurrenceId: "cclp1/001",
      title: "Key Pyramid",
      source: {
        path: "data/CCLP1.dat",
        ordinal: 0,
        content: {
          digest: "sha256:888d46dc1e6863694579b5f34106cf84b267b7b2a837ec11f42cd2f6e0655071",
          byteLength: 424,
        },
      },
    });
  }, 90_000);

  it("rejects drift in a named P1B measured comparison before producing evidence", async () => {
    const measuredPath = resolve(repositoryRoot, "ccsolver/corpus/p1b-measured-corpus.v1.json");
    await expect(buildP6bPortfolioCanaries(repositoryRoot, {
      readBytes: async (path) => {
        const bytes = new Uint8Array(await import("node:fs/promises").then(({ readFile }) => readFile(path)));
        if (path !== measuredPath) return bytes;
        const report = JSON.parse(new TextDecoder().decode(bytes));
        const target = report.cases.find(({ occurrenceId }: { occurrenceId: string }) => (
          occurrenceId === "cclp1/067"
        ));
        target.comparison.status = "parity";
        return new TextEncoder().encode(JSON.stringify(report));
      },
    })).rejects.toThrow(/measured comparison.*cclp1\/067.*divergent/i);
  }, 90_000);
});
