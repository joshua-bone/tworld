import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { buildCuratedCatalogView } from "@player-web/impl/modern/curatedCatalog";
import type { BrowserLevelProgressSummary } from "@player-web/ports/BrowserProfileStore";
import {
  buildLevelProgressIndex,
  buildRecentFamilyActivities,
  describeLevelDisplayStatus,
  summarizeEntryProgress,
} from "@player-web/impl/modern/familyActivity";

function createLevels(levelCount: number, prefix: string, withSolutions = false): SeriesLevel[] {
  return Array.from({ length: levelCount }, (_, index) => ({
    index,
    number: index + 1,
    name: `${prefix} ${index + 1}`,
    author: "Test",
    password: `P${String(index + 1).padStart(3, "0")}`,
    timeLimitSeconds: 100,
    bestTimeTicks: 0,
    levelSize: 0,
    solutionSize: 0,
    levelHash: `${prefix}:${index + 1}`,
    hasSolution: withSolutions && index % 2 === 0,
    sgflags: 0,
    unsolvable: null,
  }));
}

function createEntry(
  filebase: string,
  mapfilename: string,
  ruleset: "MS" | "Lynx",
  levelCount = 10,
  withSolutions = false,
): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename,
    ruleset,
    levels: createLevels(levelCount, filebase, withSolutions),
  };
}

function createProgressSummary(
  overrides: Partial<BrowserLevelProgressSummary> & Pick<BrowserLevelProgressSummary, "seriesFile" | "levelNumber">,
): BrowserLevelProgressSummary {
  return {
    seriesFile: overrides.seriesFile,
    levelNumber: overrides.levelNumber,
    lastPlayedAtMs: overrides.lastPlayedAtMs ?? 0,
    lastResult: overrides.lastResult ?? "failed",
    bestResult: overrides.bestResult ?? "failed",
    lastScore: overrides.lastScore ?? 0,
    bestScore: overrides.bestScore ?? 0,
    lastUndoUsedCount: overrides.lastUndoUsedCount ?? 0,
    bestUndoUsedCount: overrides.bestUndoUsedCount ?? 0,
  };
}

describe("familyActivity", () => {
  it("keeps progress summaries separate per ruleset entry", () => {
    const family = buildCuratedCatalogView(
      [
        createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS"),
        createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx"),
      ],
      null,
    ).officialFamilies[0]!;
    const progressByKey = buildLevelProgressIndex([
      createProgressSummary({
        seriesFile: "CCLP1-MS.dac",
        levelNumber: 1,
        lastPlayedAtMs: 100,
        lastResult: "completed-clean",
        bestResult: "completed-clean",
        lastScore: 850,
        bestScore: 850,
      }),
      createProgressSummary({
        seriesFile: "CCLP1-Lynx.dac",
        levelNumber: 2,
        lastPlayedAtMs: 200,
        lastResult: "failed",
        bestResult: "failed",
      }),
    ]);

    expect(summarizeEntryProgress(family.launchEntries.MS ?? null, progressByKey)).toEqual({
      completedLevels: 1,
      playedLevels: 1,
    });
    expect(summarizeEntryProgress(family.launchEntries.Lynx ?? null, progressByKey)).toEqual({
      completedLevels: 0,
      playedLevels: 1,
    });
  });

  it("builds recent family activity cards from persisted selection history", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("CCLP2.dac", "./data/CCLP2.dat", "MS"),
        createEntry("CCLXP2.dac", "./data/CCLXP2.dat", "Lynx"),
      ],
      null,
    );

    expect(
      buildRecentFamilyActivities(view, [
        {
          selection: { seriesFile: "CCLXP2.dac", levelNumber: 3 },
          savedAtMs: 123,
        },
      ]),
    ).toEqual([
      {
        familyId: "official:cclp2-cclxp2",
        familyTitle: "CCLP2 / CCLXP2",
        levelName: "CCLXP2.dac 3",
        levelNumber: 3,
        ruleset: "Lynx",
        rulesetLabel: "CCLXP2",
        savedAtMs: 123,
      },
    ]);
  });

  it("describes unplayed and played level status for the set hub", () => {
    const levels = createLevels(2, "Test", true);

    expect(describeLevelDisplayStatus(levels[0]!, null)).toEqual({
      completionState: "Unplayed",
      bestResultLabel: "No runs yet",
      replayAvailabilityLabel: "Official replay",
    });
    expect(
      describeLevelDisplayStatus(
        levels[1]!,
        createProgressSummary({
          seriesFile: "Test.dac",
          levelNumber: 2,
          lastPlayedAtMs: 50,
          lastResult: "failed",
          bestResult: "failed",
        }),
      ),
    ).toEqual({
      completionState: "Attempted",
      bestResultLabel: "Attempted",
      replayAvailabilityLabel: "No replay",
    });
  });

  it("surfaces clean clears separately from undo clears", () => {
    const level = createLevels(1, "Status")[0]!;

    expect(
      describeLevelDisplayStatus(
        level,
        createProgressSummary({
          seriesFile: "Status.dac",
          levelNumber: 1,
          bestResult: "completed-clean",
          lastResult: "completed-clean",
          bestScore: 900,
          lastScore: 900,
        }),
      ),
    ).toEqual({
      completionState: "Completed",
      bestResultLabel: "Cleared clean",
      replayAvailabilityLabel: "No replay",
    });
    expect(
      describeLevelDisplayStatus(
        level,
        createProgressSummary({
          seriesFile: "Status.dac",
          levelNumber: 1,
          bestResult: "completed-with-undo",
          lastResult: "completed-with-undo",
          bestScore: 450,
          lastScore: 450,
          bestUndoUsedCount: 2,
          lastUndoUsedCount: 2,
        }),
      ),
    ).toEqual({
      completionState: "Completed",
      bestResultLabel: "Cleared with undo",
      replayAvailabilityLabel: "No replay",
    });
  });
});
