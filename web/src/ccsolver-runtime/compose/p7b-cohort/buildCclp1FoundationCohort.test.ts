import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CCLP1_FOUNDATION_LIMITS } from "./cclp1FoundationCohort";
import {
  buildCclp1FoundationCohort,
  countNativeReplayDecisionsThrough,
} from "./buildCclp1FoundationCohort";
import { loadCclp1FoundationCohort } from "./loadCclp1FoundationCohort";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("the bounded real CCLP1 P7B processor", () => {
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
