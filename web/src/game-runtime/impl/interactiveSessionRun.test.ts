import { describe, expect, it } from "vitest";
import {
  boardPositionToGridPosition,
  buildCompletedRunState,
  buildFailedRunState,
  buildInteractiveFailureCause,
  buildInteractiveSessionScoreSummary,
  formatInteractiveTickSeconds,
} from "@game-runtime/impl/interactiveSessionRun";

describe("interactiveSessionRun", () => {
  it("projects board positions into 1-based grid coordinates", () => {
    expect(boardPositionToGridPosition(0)).toEqual({ x: 1, y: 1, z: 1 });
    expect(boardPositionToGridPosition(33, 2)).toEqual({ x: 2, y: 2, z: 2 });
  });

  it("halves the final score whenever undo was used", () => {
    expect(buildInteractiveSessionScoreSummary(3, 400, 40, 0)).toEqual({
      baseScore: 1500,
      timeBonus: 180,
      undoPenaltyApplied: false,
      undoPenaltyMultiplier: 1,
      finalScore: 1680,
    });
    expect(buildInteractiveSessionScoreSummary(3, 400, 40, 2)).toEqual({
      baseScore: 1500,
      timeBonus: 180,
      undoPenaltyApplied: true,
      undoPenaltyMultiplier: 0.5,
      finalScore: 840,
    });
  });

  it("distinguishes clean clears, undo clears, and failures", () => {
    const endPosition = { x: 12, y: 25, z: 1 } as const;

    expect(buildCompletedRunState(5, 400, 20, 0, endPosition, true)).toMatchObject({
      undoUsedCount: 0,
      replayAvailable: true,
      result: {
        outcome: "completed-clean",
        endPosition,
      },
    });
    expect(buildCompletedRunState(5, 400, 20, 1, endPosition, true)).toMatchObject({
      undoUsedCount: 1,
      replayAvailable: true,
      result: {
        outcome: "completed-with-undo",
        endPosition,
      },
    });

    const cause = buildInteractiveFailureCause({
      kind: "monster",
      message: "Killed by ant at (12, 25)",
      position: endPosition,
      actorName: "ant",
    });

    expect(buildFailedRunState(2, cause, endPosition, false)).toEqual({
      undoUsedCount: 2,
      replayAvailable: false,
      result: {
        outcome: "failed",
        cause,
        endPosition,
        score: null,
      },
    });
  });

  it("formats ticks as decimal seconds", () => {
    expect(formatInteractiveTickSeconds(604)).toBe("30.2");
    expect(formatInteractiveTickSeconds(301)).toBe("15.05");
    expect(formatInteractiveTickSeconds(300)).toBe("15.0");
    expect(formatInteractiveTickSeconds(-1)).toBe("-0.05");
  });
});
