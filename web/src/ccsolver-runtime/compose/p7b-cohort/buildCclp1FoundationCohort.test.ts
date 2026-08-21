import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { describe, expect, it } from "vitest";
import { P7GeneratedEvidenceStore } from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  P7TrainingEventAccumulator,
  P7_TRAINING_EVENT_STREAM_LIMITS,
  type P7TrainingEventStreamDigestV1,
  type P7TrainingNativeCausalEvent,
} from "../p7-training-execution/p7TrainingEventAccumulator";
import {
  P7B_MAX_SEGMENTS_PER_VARIANT,
  assertP7bSegmentSelectionV1,
} from "../p7b-training/trainingReplayContract";
import { CCLP1_FOUNDATION_LIMITS } from "./cclp1FoundationCohort";
import {
  assertExactExecutedReplayPrefix,
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
  it("rejects any causal drift between full-donor discovery and exact-prefix replay", () => {
    const fullEventStream = {
      artifact: "ccsolver-p7-ordered-native-event-stream-digest",
      version: 1,
      eventsOrder: "sequence",
      eventCount: 2,
      canonicalByteLength: 512,
      chunking: {
        kind: "contiguous-event-count-v1",
        maximumEventsPerChunk: P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk,
        chunkCount: 1,
      },
      manifest: {
        algorithm: "sha256",
        canonicalization: "tworld-canonical-json-v1",
        digest: `sha256:${"a".repeat(64)}`,
        byteLength: 256,
      },
    } satisfies P7TrainingEventStreamDigestV1;
    const discovered = {
      terminal: {
        kind: "won" as const,
        nativeTick: 10,
        coordinate: null,
        exitPlacementId: null,
      },
      advanceTickCount: 11,
      eventCount: 2,
      fullEventStream,
    };
    const assertReplayed = (replayed: typeof discovered, replayedDecisionCount = 4) => (
      assertExactExecutedReplayPrefix({
        occurrenceId: "cclp4/038",
        target: "lynx",
        discovered,
        replayed,
        expectedDecisionCount: 4,
        replayedDecisionCount,
      })
    );

    expect(() => assertReplayed(structuredClone(discovered))).not.toThrow();
    for (const replayed of [
      { ...discovered, advanceTickCount: 12 },
      { ...discovered, eventCount: 3 },
      {
        ...discovered,
        terminal: { ...discovered.terminal, nativeTick: 11 },
      },
      {
        ...discovered,
        fullEventStream: {
          ...fullEventStream,
          manifest: {
            ...fullEventStream.manifest,
            digest: `sha256:${"b".repeat(64)}` as const,
          },
        },
      },
    ]) {
      expect(() => assertReplayed(replayed)).toThrow("exact executed replay prefix drifted");
    }
    expect(() => assertReplayed(discovered, 3)).toThrow("exact executed replay prefix drifted");
  });

  it("normalizes two exact MS and Lynx toggle-wall cycles as source-button activations", async () => {
    const aggregate = async (target: "ms" | "lynx") => {
      const accumulator = new P7TrainingEventAccumulator({
        occurrenceId: `fixture/toggle-${target}`,
        target,
        sha256: new WebCryptoSha256(),
        maximumRetainedEvents: 16,
      });
      for (const cycle of [0, 1]) {
        for (const [targetOrdinal, targetPos] of [40, 41].entries()) {
          accumulator.record({
            kind: target === "ms" ? "device-state-changed" : "device-activated",
            actorId: 3,
            actorSerial: 5,
            tileId: 0x25,
            resultingTileId: 0x26,
            sourceTileId: 0x23,
            sourcePosition: { pos: 10, z: 1 },
            sourceStratum: "overlay",
            targetStratum: "terrain",
            action: target === "ms" ? "cc1:toggle-walls" : "cc1:toggle-walls-queued",
            beforeState: "cc1:closed",
            afterState: "cc1:open",
            before: { pos: targetPos, z: 1 },
            after: { pos: targetPos, z: 1 },
            nativeTick: 4,
            withinTickOrder: cycle * 2 + targetOrdinal,
            phase: "device-action",
          } as P7TrainingNativeCausalEvent);
        }
      }
      await accumulator.flushNativeTick();
      return accumulator.finish();
    };
    const [msAccumulated, lynxAccumulated] = await Promise.all([
      aggregate("ms"),
      aggregate("lynx"),
    ]);
    expect(msAccumulated.events).toHaveLength(2);
    expect(lynxAccumulated.events).toHaveLength(2);
    expect(msAccumulated.events[0]!.p7Aggregation).toMatchObject({
      semanticAction: "cc1:toggle-walls",
      eventCount: 2,
    });
    expect(lynxAccumulated.events[0]!.p7Aggregation).toMatchObject({
      semanticAction: "cc1:toggle-walls",
      eventCount: 2,
    });
    expect(msAccumulated.events.map(({ p7Aggregation }) => (
      p7Aggregation?.firstWithinTickOrder
    ))).toEqual([0, 2]);
    expect(lynxAccumulated.events.map(({ p7Aggregation }) => (
      p7Aggregation?.firstWithinTickOrder
    ))).toEqual([0, 2]);

    const segment = async (
      target: "ms" | "lynx",
      events: readonly FoundationNativeCausalEvent[],
    ) => {
      const evidence = new P7GeneratedEvidenceStore({
        scopeId: `fixture/toggle-segment-${target}`,
        sha256: new WebCryptoSha256(),
      });
      const initialCheckpoint = await evidence.referenceCanonical({ target, boundary: "initial" });
      const finalCheckpoint = await evidence.referenceCanonical({ target, boundary: "final" });
      return segmentFoundationNativeEvents({
        occurrenceId: "fixture/toggle",
        target,
        events,
        initialCheckpoint,
        finalCheckpoint,
        terminalNativeTick: 6,
        terminalDecisionCount: 1,
        decisionCountAtTick: () => 1,
        retainViewableSegments: true,
        evidence,
      });
    };
    const [ms, lynx] = await Promise.all([
      segment("ms", msAccumulated.events as readonly FoundationNativeCausalEvent[]),
      segment("lynx", lynxAccumulated.events as readonly FoundationNativeCausalEvent[]),
    ]);

    expect(ms.segments.map(({ segmentId, anchor }) => ({ segmentId, anchor })))
      .toEqual(lynx.segments.map(({ segmentId, anchor }) => ({ segmentId, anchor })));
    expect(ms.selection.semanticTranscript).toEqual(lynx.selection.semanticTranscript);
    expect(ms.selection.targetTranscript.digest).not.toBe(lynx.selection.targetTranscript.digest);
  });

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
