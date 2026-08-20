import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  P6B_P7A_CHECKED_OUTPUT_ROOT,
  buildP6bP7aReviewOutputs,
} from "./buildP6bP7aReviewOutputs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const decode = (content: Uint8Array) => JSON.parse(new TextDecoder().decode(content));
const builtReview = buildP6bP7aReviewOutputs(repositoryRoot);

describe("P6B/P7A checked dossier composition", () => {
  it("realizes semantic tactics through both real engines and emits one exact bounded leaf", async () => {
    const built = await builtReview;
    const suffixes = built.checkedOutputs.map(({ path }) => (
      path.slice(`${P6B_P7A_CHECKED_OUTPUT_ROOT}/`.length)
    ));

    expect(suffixes).toEqual([
      "assets/standard-artwork-lynx.png",
      "assets/standard-artwork-ms.png",
      "fixture.json",
      "lynx/replay-certificate.json",
      "lynx/tactic-realization.json",
      "manifest.json",
      "ms/replay-certificate.json",
      "ms/tactic-realization.json",
      "portfolio-canaries.json",
      "review.html",
      "review.md",
    ]);
    expect(built.sourceAudit).toMatchObject({
      donorInputReads: 0,
      standardOnly: true,
      expandedTileCount: 0,
      realEngineTargets: ["ms", "lynx"],
    });

    for (const target of ["ms", "lynx"] as const) {
      const realizationOutput = built.checkedOutputs.find(({ path }) => (
        path.endsWith(`/${target}/tactic-realization.json`)
      ));
      const certificateOutput = built.checkedOutputs.find(({ path }) => (
        path.endsWith(`/${target}/replay-certificate.json`)
      ));
      expect(realizationOutput).toBeDefined();
      expect(certificateOutput).toBeDefined();
      const realization = decode(realizationOutput!.content);
      const certificate = decode(certificateOutput!.content);
      expect(realization).toMatchObject({
        realizationType: "p7a-standard-tactic-realization",
        realizationVersion: 1,
        target,
        construction: {
          semanticIntentDriven: true,
          fullInputStreamProvided: false,
          donorInputRead: false,
        },
        checkpointRestore: { status: "exact" },
        evaluationBounds: {
          configured: {
            maximumCandidateBranches: 256,
            maximumAdvanceCalls: 4_096,
            maximumTicksPerBranch: 16,
            maximumFrontierEntries: 1_024,
          },
          observedMaximums: {
            attemptedBranches: expect.any(Number),
            advanceCalls: expect.any(Number),
            selectedTicks: expect.any(Number),
            frontierPeak: expect.any(Number),
          },
        },
        boundedExhaustion: {
          bounds: {
            maximumCandidateBranches: 1,
            maximumAdvanceCalls: 8,
            maximumTicksPerBranch: 1,
            maximumFrontierEntries: 16,
          },
          repeatedExactly: true,
        },
        suffixRepair: {
          status: "repaired",
          join: "replanned-join",
        },
        terminal: { kind: "won" },
      });
      expect(realization.tactics.length).toBeGreaterThanOrEqual(6);
      expect(realization.routeVisitCount).toBe(6);
      expect(realization.routeVisits).toEqual(Array.from({ length: 6 }, (_, visitOrder) => ({
        visitOrder,
        coordinate: { x: visitOrder + 1, y: 0, z: 0 },
      })));
      expect(realization.evaluationBounds.observedMaximums.attemptedBranches).toBeLessThanOrEqual(256);
      expect(realization.evaluationBounds.observedMaximums.advanceCalls).toBeLessThanOrEqual(4_096);
      expect(realization.evaluationBounds.observedMaximums.selectedTicks).toBeLessThanOrEqual(16);
      expect(realization.evaluationBounds.observedMaximums.frontierPeak).toBeLessThanOrEqual(1_024);
      expect(realization.tactics.map(({ intent }: { intent: { kind: string } }) => intent.kind)).toEqual(
        expect.arrayContaining(["reach", "collect", "unlock", "wait-until"]),
      );
      expect(realization.suffixRepair.retainedPrefixCount).toBeGreaterThan(0);
      expect(certificate).toMatchObject({
        certificateType: "p7a-fresh-runtime-replay-certificate",
        certificateVersion: 1,
        target,
        manual: { exactTerminalMatch: true },
        bindings: {
          source: { datContent: expect.any(Object), levelFactsContent: expect.any(Object) },
          selectedDecisionSequence: expect.any(Object),
          tacticRealization: expect.any(Object),
        },
        replayOwned: {
          gameplayTerminalMatch: true,
          nativeTickMatch: true,
          terminal: { kind: "won" },
        },
      });
      expect(certificate.bindings.source).toEqual({
        datContent: realization.source.datContent,
        levelFactsContent: realization.source.levelFactsContent,
      });
      const sha256 = new WebCryptoSha256();
      expect(certificate.bindings.tacticRealization).toEqual(
        await referenceSourceBytes(realizationOutput!.content, sha256),
      );
      const selectedRequests = realization.tactics.flatMap((tactic: {
        witness: { selectedDecisions: readonly { request: unknown }[] };
      }) => tactic.witness.selectedDecisions.map(({ request }) => request));
      expect(certificate.bindings.selectedDecisionSequence).toEqual(
        await referenceCanonicalJson(canonicalizeJson(selectedRequests), sha256),
      );
    }

    const fixture = decode(built.checkedOutputs.find(({ path }) => path.endsWith("/fixture.json"))!.content);
    const portfolio = decode(built.checkedOutputs.find(({ path }) => (
      path.endsWith("/portfolio-canaries.json")
    ))!.content);
    expect(fixture.portfolioSourceEligibilityReceipts).toHaveLength(5);
    expect(fixture.portfolioSemanticRejoinReceipts).toHaveLength(1);
    expect(fixture.targets).toHaveLength(2);
    for (const targetReceipt of fixture.targets) {
      const realization = decode(built.checkedOutputs.find(({ path }) => (
        path.endsWith(`/${targetReceipt.target}/tactic-realization.json`)
      ))!.content);
      expect(targetReceipt.source).toEqual(realization.source);
    }
    for (const entry of [
      ...fixture.portfolioSourceEligibilityReceipts,
      ...fixture.portfolioSemanticRejoinReceipts,
    ]) {
      const sha256 = new WebCryptoSha256();
      expect(entry.content).toEqual(
        await referenceCanonicalJson(canonicalizeJson(entry.payload), sha256),
      );
      const canary = portfolio.canaries.find(({ canaryId }: { canaryId: string }) => (
        canaryId === entry.canaryId
      ));
      expect(canary?.evidence.find(({ evidenceId }: { evidenceId: string }) => (
        evidenceId === entry.evidenceId
      ))?.content).toEqual(entry.content);
    }
    const rejoinPayload = fixture.portfolioSemanticRejoinReceipts[0].payload;
    expect(rejoinPayload).toMatchObject({
      proofKind: "real-engine-executed-cross-ruleset-semantic-rejoin",
      completeManualPollTranscriptsPublished: true,
      anyNativeHistoryDivergence: true,
    });
    expect(rejoinPayload.targets.map(({ target }: { target: string }) => target)).toEqual(["ms", "lynx"]);
    expect(rejoinPayload.targets.map(({ comparison }: { comparison: { nativeExactFingerprintsEqual: boolean } }) => (
      comparison.nativeExactFingerprintsEqual
    ))).toEqual([true, false]);
    for (const targetReceipt of rejoinPayload.targets) {
      const { left, right } = targetReceipt.branches;
      expect(left.boundary.directionWaypoints).not.toEqual(right.boundary.directionWaypoints);
      expect(left.boundary.manualPollTranscript.length).toBe(left.boundary.advanceCalls);
      expect(right.boundary.manualPollTranscript.length).toBe(right.boundary.advanceCalls);
      expect(left.continuation.manualPollTranscript.length).toBe(left.continuation.advanceCalls);
      expect(right.continuation.manualPollTranscript.length).toBe(right.continuation.advanceCalls);
      expect(left.boundary.gameplayContent).toEqual(right.boundary.gameplayContent);
      expect(left.continuation.gameplayContent).toEqual(right.continuation.gameplayContent);
    }

    for (const output of built.checkedOutputs.filter(({ mediaType }) => mediaType === "application/json")) {
      const text = new TextDecoder().decode(output.content);
      expect(canonicalizeJson(JSON.parse(text))).toBe(text);
    }
    const html = new TextDecoder().decode(built.checkedOutputs.find(({ path }) => (
      path.endsWith("/review.html")
    ))!.content);
    expect(html).not.toMatch(/sha256:|placement:sha256:|actor:sha256:|\/Users\//u);
    expect(html).not.toMatch(/>[^<]*cc1:[^<]*</iu);
  }, 300_000);
});
