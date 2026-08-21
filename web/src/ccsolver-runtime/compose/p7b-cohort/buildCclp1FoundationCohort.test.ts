import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { describe, expect, it } from "vitest";
import { P7GeneratedEvidenceStore } from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  P7B_MAX_SEGMENTS_PER_VARIANT,
  assertP7bSegmentSelectionV1,
} from "../p7b-training/trainingReplayContract";
import { CCLP1_FOUNDATION_LIMITS } from "./cclp1FoundationCohort";
import {
  buildCclp1FoundationCohort,
  countNativeReplayDecisionsThrough,
  type FoundationNativeCausalEvent,
  segmentFoundationNativeEvents,
} from "./buildCclp1FoundationCohort";
import { loadCclp1FoundationCohort } from "./loadCclp1FoundationCohort";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("the bounded real CCLP1 P7B processor", () => {
  it("coalesces dense causal anchors into 24 viewable route chapters before retaining evidence", async () => {
    expect(P7B_MAX_SEGMENTS_PER_VARIANT).toBe(24);
    const evidence = new P7GeneratedEvidenceStore({
      scopeId: "fixture/dense-route",
      sha256: new WebCryptoSha256(),
    });
    const initialCheckpoint = await evidence.referenceCanonical({
      artifact: "fixture-initial-boundary",
      version: 1,
    });
    const finalCheckpoint = await evidence.referenceCanonical({
      artifact: "fixture-final-boundary",
      version: 1,
    });
    const events = Array.from({ length: 96 }, (_, nativeTick) => ({
      kind: "collect",
      nativeTick,
      actorId: 1,
      tileId: 45,
      action: null,
      direction: null,
      actorSerial: 0,
      before: { pos: 7, z: 0 },
      after: { pos: 8, z: 0 },
      withinTickOrder: 0,
      phase: "arrival-effect",
    })) satisfies FoundationNativeCausalEvent[];

    const segmented = await segmentFoundationNativeEvents({
      occurrenceId: "fixture/dense-route",
      target: "ms",
      events,
      initialCheckpoint,
      finalCheckpoint,
      terminalNativeTick: 100,
      terminalDecisionCount: 96,
      decisionCountAtTick: (tick) => Math.min(tick, 96),
      retainViewableSegments: true,
      evidence,
    });
    const { segments } = segmented;

    expect(segments).toHaveLength(P7B_MAX_SEGMENTS_PER_VARIANT);
    // IDs retain occurrence ordinals from the complete anchor sequence; the
    // first selected chapter must not be renumbered as occurrence 01.
    expect(segments[0]!.segmentId).toMatch(/-05$/u);
    expect(segments[0]!.start).toEqual({
      tick: 0,
      decision: 0,
      checkpoint: initialCheckpoint,
    });
    expect(segments.at(-1)!.end).toEqual({
      tick: 100,
      decision: 96,
      checkpoint: finalCheckpoint,
    });
    for (const [index, segment] of segments.entries()) {
      expect(segment.index).toBe(index);
      if (index > 0) expect(segment.start).toEqual(segments[index - 1]!.end);
    }
    // Initial + final state digests and one retained event record for each
    // nonterminal route chapter. Dropped anchors must not become proof blobs.
    expect(evidence.bundle().blobs).toHaveLength(P7B_MAX_SEGMENTS_PER_VARIANT + 1);

    const selectionCases = [
      { candidateCount: 0, retainViewableSegments: false, selected: [] },
      { candidateCount: 1, retainViewableSegments: true, selected: [0] },
      {
        candidateCount: 23,
        retainViewableSegments: true,
        selected: Array.from({ length: 23 }, (_, index) => index),
      },
      {
        candidateCount: 24,
        retainViewableSegments: true,
        selected: Array.from({ length: 24 }, (_, index) => index),
      },
      {
        candidateCount: 25,
        retainViewableSegments: true,
        selected: Array.from({ length: 24 }, (_, index) => index + 1),
      },
      {
        candidateCount: 72,
        retainViewableSegments: true,
        selected: [
          3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 37,
          40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 71,
        ],
      },
    ] as const;
    for (const selectionCase of selectionCases) {
      const caseEvidence = new P7GeneratedEvidenceStore({
        scopeId: `fixture/selection-${selectionCase.candidateCount}`,
        sha256: new WebCryptoSha256(),
      });
      const caseInitial = await caseEvidence.referenceCanonical({
        artifact: "fixture-selection-initial",
        candidateCount: selectionCase.candidateCount,
      });
      const caseFinal = await caseEvidence.referenceCanonical({
        artifact: "fixture-selection-final",
        candidateCount: selectionCase.candidateCount,
      });
      const eventCount = selectionCase.retainViewableSegments
        ? selectionCase.candidateCount - 1
        : selectionCase.candidateCount;
      const selected = await segmentFoundationNativeEvents({
        occurrenceId: `fixture/selection-${selectionCase.candidateCount}`,
        target: "ms",
        events: Array.from({ length: eventCount }, (_, nativeTick) => ({
          kind: "collect",
          nativeTick,
          actorId: 1,
          tileId: 45,
          action: null,
          direction: null,
          actorSerial: 0,
          before: { pos: 7, z: 0 },
          after: { pos: 8, z: 0 },
          withinTickOrder: 0,
          phase: "arrival-effect",
        })) satisfies FoundationNativeCausalEvent[],
        initialCheckpoint: caseInitial,
        finalCheckpoint: caseFinal,
        terminalNativeTick: Math.max(1, selectionCase.candidateCount + 1),
        terminalDecisionCount: Math.max(0, selectionCase.candidateCount - 1),
        decisionCountAtTick: (tick) => Math.min(tick, eventCount),
        retainViewableSegments: selectionCase.retainViewableSegments,
        evidence: caseEvidence,
      });
      expect(selected.selection.candidateCount).toBe(selectionCase.candidateCount);
      expect(selected.selection.selectedCandidateOrdinals).toEqual(selectionCase.selected);
      expect(selected.selection.selectionMode).toBe(
        selectionCase.retainViewableSegments
          ? "viewable-route-chapters"
          : "unviewable",
      );
      expect(selected.selection.omittedCandidateCount).toBe(
        selectionCase.candidateCount - selectionCase.selected.length,
      );
      if (selectionCase.retainViewableSegments) {
        expect(selected.segments.at(-1)!.anchor.kind).toBe("exit");
      } else {
        expect(selected.segments).toEqual([]);
      }
    }
    const noncanonicalSelection = {
      ...segmented.selection,
      selectedCandidateOrdinals: [
        3,
        ...segmented.selection.selectedCandidateOrdinals.slice(1),
      ],
    };
    expect(() => assertP7bSegmentSelectionV1(noncanonicalSelection)).toThrow(
      "selected ordinals do not match its policy mode",
    );

    const divergentEvidence = new P7GeneratedEvidenceStore({
      scopeId: "fixture/dense-route-divergent",
      sha256: new WebCryptoSha256(),
    });
    const divergent = await segmentFoundationNativeEvents({
      occurrenceId: "fixture/dense-route",
      target: "ms",
      events: events.map((event, index) => index === 0
        ? { ...event, action: "omitted-anchor-divergence" }
        : event),
      initialCheckpoint,
      finalCheckpoint,
      terminalNativeTick: 100,
      terminalDecisionCount: 96,
      decisionCountAtTick: (tick) => Math.min(tick, 96),
      retainViewableSegments: true,
      evidence: divergentEvidence,
    });
    expect(divergent.segments).toEqual(segments);
    expect(divergent.selection.targetTranscript.digest)
      .not.toBe(segmented.selection.targetTranscript.digest);
    expect(divergent.selection.semanticTranscript.digest)
      .not.toBe(segmented.selection.semanticTranscript.digest);
  });

  it("runs each exact raw donor once and emits complete segment/status evidence", async () => {
    const loaded = await loadCclp1FoundationCohort(repositoryRoot);
    const before = loaded.levels.flatMap((level) => level.targets.map((target) => ({
      occurrenceId: level.selection.occurrenceId,
      target: target.target,
      digest: sha256(target.rawReplayBytes),
    })));

    const processed = await buildCclp1FoundationCohort(loaded);

    expect(processed.summary.levelCount).toBe(CCLP1_FOUNDATION_LIMITS.levelCount);
    expect(processed.summary.targetCount).toBe(CCLP1_FOUNDATION_LIMITS.targetCount);
    expect(processed.summary.replayRunCount).toBe(CCLP1_FOUNDATION_LIMITS.targetCount);
    expect(processed.summary.advanceTickCount).toBe(20_208);
    expect(processed.summary.advanceTickCount)
      .toBeLessThanOrEqual(CCLP1_FOUNDATION_LIMITS.maximumAdvanceTicks);

    const targets = processed.levels.flatMap((level) => level.targets.map((target) => ({
      occurrenceId: level.selection.occurrenceId,
      ...target,
    })));
    expect(targets).toHaveLength(24);
    expect(targets.map(({ occurrenceId, target, rawReplayBytes }) => ({
      occurrenceId,
      target,
      digest: sha256(rawReplayBytes),
    }))).toEqual(before);

    for (const target of targets) {
      expect(target.execution.terminal.kind).toBe("won");
      expect(target.execution.eventRetention).toEqual({
        status: "digest-and-boundary-events",
        heavyVerification: "reexecute-authoritative-engine",
      });
      expect(target.execution.tickCount).toBeGreaterThan(0);
      expect(target.execution.decisionCount).toBe(target.expandedSolution.moves.length);
      expect(target.segments.length).toBeGreaterThan(0);
      expect(target.segments[0]!.index).toBe(0);
      expect(target.segments[0]!.start).toEqual({
        tick: 0,
        decision: 0,
        checkpoint: target.execution.initialCheckpoint,
      });
      expect(target.segments.at(-1)!.end).toEqual({
        tick: target.execution.tickCount,
        decision: target.execution.decisionCount,
        checkpoint: target.execution.finalCheckpoint,
      });
      for (let index = 0; index < target.segments.length; index += 1) {
        const segment = target.segments[index]!;
        expect(segment.index).toBe(index);
        expect(segment.end.tick).toBeGreaterThan(segment.start.tick);
        expect(segment.end.decision).toBeGreaterThanOrEqual(segment.start.decision);
        if (index > 0) {
          expect(segment.start).toEqual(target.segments[index - 1]!.end);
        }
      }
      expect(target.candidateEligibility.status).toBe("not-assessed");
      expect(target.candidateEligibility.residuals).toEqual(expect.any(Array));
    }

    const mughfe = targets.filter(({ occurrenceId }) => occurrenceId === "cclp1/042");
    expect(mughfe).toHaveLength(2);
    for (const target of mughfe) {
      expect(target.candidateEligibility).toMatchObject({
        status: "not-assessed",
        residuals: expect.arrayContaining(["nondefault-stepping"]),
      });
    }
    expect(targets.find(({ occurrenceId, target }) => (
      occurrenceId === "cclp1/137" && target === "ms"
    ))?.candidateEligibility).toMatchObject({
      status: "not-assessed",
      residuals: expect.arrayContaining(["mouse-input"]),
    });

    const graduationLynx = targets.find(({ occurrenceId, target }) => (
      occurrenceId === "cclp1/010" && target === "lynx"
    ))!;
    expect(graduationLynx.expandedSolution.moves[0]!.when).toBeGreaterThan(0x7f_ffff);
    expect(countNativeReplayDecisionsThrough(
      "lynx",
      graduationLynx.expandedSolution.moves,
      graduationLynx.execution.tickCount,
    )).toBe(graduationLynx.expandedSolution.moves.length);
    expect(countNativeReplayDecisionsThrough(
      "ms",
      graduationLynx.expandedSolution.moves,
      graduationLynx.execution.tickCount,
    )).toBe(graduationLynx.expandedSolution.moves.length);
  }, 120_000);
});
