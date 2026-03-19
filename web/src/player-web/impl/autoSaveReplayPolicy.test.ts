import { describe, expect, it } from "vitest";
import { shouldAutoSaveWinningHighScoreReplay } from "@player-web/impl/autoSaveReplayPolicy";
import type { BrowserLevelProgressSummary } from "@player-web/ports/BrowserProfileStore";

function makeProgress(overrides: Partial<BrowserLevelProgressSummary> = {}): BrowserLevelProgressSummary {
  return {
    seriesFile: "CCLP1-MS.dac",
    levelNumber: 1,
    lastPlayedAtMs: 0,
    lastResult: "completed-clean",
    bestResult: "completed-clean",
    lastScore: 900,
    bestScore: 900,
    lastUndoUsedCount: 0,
    bestUndoUsedCount: 0,
    ...overrides,
  };
}

describe("shouldAutoSaveWinningHighScoreReplay", () => {
  it("returns true for a first winning run when enabled", () => {
    expect(
      shouldAutoSaveWinningHighScoreReplay({
        enabled: true,
        previousProgress: null,
        result: "completed-clean",
        score: 500,
      }),
    ).toBe(true);
  });

  it("returns true for tied or improved winning high scores", () => {
    expect(
      shouldAutoSaveWinningHighScoreReplay({
        enabled: true,
        previousProgress: makeProgress({ bestScore: 900 }),
        result: "completed-with-undo",
        score: 900,
      }),
    ).toBe(true);
    expect(
      shouldAutoSaveWinningHighScoreReplay({
        enabled: true,
        previousProgress: makeProgress({ bestScore: 900 }),
        result: "completed-clean",
        score: 950,
      }),
    ).toBe(true);
  });

  it("returns false for lower scores, failures, and when disabled", () => {
    expect(
      shouldAutoSaveWinningHighScoreReplay({
        enabled: true,
        previousProgress: makeProgress({ bestScore: 900 }),
        result: "completed-clean",
        score: 899,
      }),
    ).toBe(false);
    expect(
      shouldAutoSaveWinningHighScoreReplay({
        enabled: true,
        previousProgress: makeProgress({ bestScore: 900 }),
        result: "failed",
        score: 1200,
      }),
    ).toBe(false);
    expect(
      shouldAutoSaveWinningHighScoreReplay({
        enabled: false,
        previousProgress: null,
        result: "completed-clean",
        score: 500,
      }),
    ).toBe(false);
  });
});
