import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import {
  buildLevelProgressIndex,
  mergeLevelProgressSummaries,
  resolveLevelProgressSummary,
  summarizeEntryProgress,
} from "@player-web/impl/levelProgress";
import type { BrowserLevelProgressSummary } from "@player-web/ports/BrowserProfileStore";

function createLevel(overrides: Partial<SeriesLevel> = {}): SeriesLevel {
  return {
    index: overrides.index ?? 0,
    number: overrides.number ?? 1,
    name: overrides.name ?? "Test Level",
    author: overrides.author ?? "Tester",
    password: overrides.password ?? "ABCD",
    timeLimitSeconds: overrides.timeLimitSeconds ?? 250,
    chipsRequired: overrides.chipsRequired ?? 4,
    bestTimeTicks: overrides.bestTimeTicks ?? 0,
    levelSize: overrides.levelSize ?? 0,
    solutionSize: overrides.solutionSize ?? 0,
    levelHash: overrides.levelHash ?? "legacy-hash",
    gameplayHash: overrides.gameplayHash ?? "gameplay-hash",
    hasSolution: overrides.hasSolution ?? false,
    sgflags: overrides.sgflags ?? 0,
    unsolvable: overrides.unsolvable ?? null,
  };
}

function createEntry(
  filebase: string,
  ruleset: "MS" | "Lynx" | "Hybrid",
  levels: readonly SeriesLevel[],
): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename: `./data/${filebase.replace(/\\.dac$/iu, ".dat")}`,
    ruleset,
    levels: [...levels],
  };
}

function createProgress(overrides: Partial<BrowserLevelProgressSummary> = {}): BrowserLevelProgressSummary {
  return {
    ruleset: overrides.ruleset ?? "MS",
    gameplayHash: overrides.gameplayHash ?? "gameplay-hash",
    lastPlayedAtMs: overrides.lastPlayedAtMs ?? 100,
    lastResult: overrides.lastResult ?? "completed-clean",
    bestResult: overrides.bestResult ?? "completed-clean",
    lastElapsedTicks: overrides.lastElapsedTicks ?? 190 * 20,
    bestElapsedTicks: overrides.bestElapsedTicks ?? 190 * 20,
    lastUndoUsedCount: overrides.lastUndoUsedCount ?? 0,
    bestUndoUsedCount: overrides.bestUndoUsedCount ?? 0,
  };
}

describe("levelProgress", () => {
  it("shares progress across duplicate levels when the stored solve time still passes", () => {
    const progressByKey = buildLevelProgressIndex([createProgress({ gameplayHash: "shared-hash" })]);
    const sourceLevel = createLevel({ number: 1, gameplayHash: "shared-hash", timeLimitSeconds: 250 });
    const duplicateLevel = createLevel({ number: 7, gameplayHash: "shared-hash", timeLimitSeconds: 200 });

    const sourceProgress = resolveLevelProgressSummary(sourceLevel, "MS", progressByKey);
    const duplicateProgress = resolveLevelProgressSummary(duplicateLevel, "MS", progressByKey);

    expect(sourceProgress).toMatchObject({
      bestResult: "completed-clean",
      bestScore: 1100,
    });
    expect(duplicateProgress).toMatchObject({
      bestResult: "completed-clean",
      bestScore: 3600,
    });
  });

  it("downgrades a too-slow shared clear to attempted on tighter timers", () => {
    const progressByKey = buildLevelProgressIndex([
      createProgress({
        gameplayHash: "shared-hash",
        bestElapsedTicks: 210 * 20,
        lastElapsedTicks: 210 * 20,
      }),
    ]);
    const generousLevel = createLevel({ number: 1, gameplayHash: "shared-hash", timeLimitSeconds: 250 });
    const strictLevel = createLevel({ number: 1, gameplayHash: "shared-hash", timeLimitSeconds: 200 });

    expect(resolveLevelProgressSummary(generousLevel, "MS", progressByKey)?.bestResult).toBe("completed-clean");
    expect(resolveLevelProgressSummary(strictLevel, "MS", progressByKey)).toMatchObject({
      bestResult: "failed",
      bestScore: 0,
    });
  });

  it("keeps progress separate per ruleset even for the same gameplay hash", () => {
    const progressByKey = buildLevelProgressIndex([
      createProgress({
        gameplayHash: "shared-hash",
        ruleset: "MS",
      }),
    ]);
    const level = createLevel({ gameplayHash: "shared-hash" });

    expect(resolveLevelProgressSummary(level, "MS", progressByKey)?.bestResult).toBe("completed-clean");
    expect(resolveLevelProgressSummary(level, "Lynx", progressByKey)).toBeNull();
    expect(resolveLevelProgressSummary(level, "Hybrid", progressByKey)).toBeNull();
  });

  it("counts Hybrid completion under its native-level content hash", () => {
    const entry = createEntry("hybrid-v0:official:CCLP1.dat", "Hybrid", [
      createLevel({ gameplayHash: "native-level-sha256" }),
    ]);
    const progressByKey = buildLevelProgressIndex([
      createProgress({ ruleset: "Hybrid", gameplayHash: "native-level-sha256" }),
    ]);

    expect(summarizeEntryProgress(entry, progressByKey)).toEqual({
      completedLevels: 1,
      playedLevels: 1,
    });
  });

  it("counts only timer-valid clears in set summaries", () => {
    const entry = createEntry("dupes-ms.dac", "MS", [
      createLevel({ number: 1, gameplayHash: "shared-a", timeLimitSeconds: 200 }),
      createLevel({ number: 2, gameplayHash: "shared-b", timeLimitSeconds: 100 }),
    ]);
    const progressByKey = buildLevelProgressIndex([
      createProgress({ gameplayHash: "shared-a", bestElapsedTicks: 150 * 20, lastElapsedTicks: 150 * 20 }),
      createProgress({ gameplayHash: "shared-b", bestElapsedTicks: 120 * 20, lastElapsedTicks: 120 * 20 }),
    ]);

    expect(summarizeEntryProgress(entry, progressByKey)).toEqual({
      completedLevels: 1,
      playedLevels: 2,
    });
  });

  it("merges repeated saves by gameplay hash and keeps the strongest best run", () => {
    const existing = [
      createProgress({
        gameplayHash: "shared-hash",
        bestResult: "completed-with-undo",
        lastResult: "completed-with-undo",
        bestElapsedTicks: 200 * 20,
        lastElapsedTicks: 200 * 20,
        bestUndoUsedCount: 2,
        lastUndoUsedCount: 2,
      }),
    ];

    expect(
      mergeLevelProgressSummaries(
        existing,
        createProgress({
          gameplayHash: "shared-hash",
          bestResult: "completed-clean",
          lastResult: "completed-clean",
          bestElapsedTicks: 205 * 20,
          lastElapsedTicks: 205 * 20,
          bestUndoUsedCount: 0,
          lastUndoUsedCount: 0,
          lastPlayedAtMs: 200,
        }),
      ),
    ).toEqual([
      createProgress({
        gameplayHash: "shared-hash",
        bestResult: "completed-clean",
        lastResult: "completed-clean",
        bestElapsedTicks: 205 * 20,
        lastElapsedTicks: 205 * 20,
        bestUndoUsedCount: 0,
        lastUndoUsedCount: 0,
        lastPlayedAtMs: 200,
      }),
    ]);
  });
});
