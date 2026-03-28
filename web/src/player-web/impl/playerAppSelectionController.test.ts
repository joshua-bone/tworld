import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import {
  jumpLevelSelection,
  jumpSeriesSelection,
  resolveFamilySelection,
  resolveInitialSelection,
  resolveLevelSelection,
  resolveProceedAction,
  resolveSeriesSelection,
  shiftLevelSelection,
  shiftSeriesSelection,
} from "@player-web/impl/playerAppSelectionController";

function createSeries(filebase: string, ruleset: SeriesCatalogEntry["ruleset"], levels: number[]): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename: `${filebase}.dat`,
    ruleset,
    levels: levels.map((levelNumber, index) => ({
      index,
      number: levelNumber,
      name: `Level ${levelNumber}`,
      author: "Test",
      password: "ABCD",
      timeLimitSeconds: 100,
      chipsRequired: 0,
      bestTimeTicks: 0,
      levelSize: 0,
      solutionSize: 0,
      levelHash: `${filebase}:${levelNumber}:level`,
      gameplayHash: `${filebase}:${levelNumber}:gameplay`,
      hasSolution: false,
      sgflags: 0,
      unsolvable: null,
    })),
  };
}

function createFamily(): SetFamily {
  const ms = createSeries("CCLP1-MS.dac", "MS", [1, 2, 3]);
  const lynx = createSeries("CCLP1-Lynx.dac", "Lynx", [1, 2, 3]);

  return {
    id: "official:cclp1",
    section: "official",
    title: "CCLP1",
    badge: "Official",
    sidebarSummary: null,
    yearLabel: null,
    description: "Test family",
    context: null,
    links: [],
    levelCount: 3,
    entries: [ms, lynx],
    launchEntries: {
      MS: ms,
      Lynx: lynx,
    },
    rulesetLabels: {},
    continueSelection: {
      seriesFile: lynx.filebase,
      levelNumber: 2,
    },
    order: 10,
  };
}

describe("playerAppSelectionController", () => {
  it("resolves stored selections when they still exist", () => {
    const catalog = [
      createSeries("intro-ms.dac", "MS", [1, 2]),
      createSeries("intro-lynx.dac", "Lynx", [1, 2]),
    ];

    expect(resolveInitialSelection(catalog, { seriesFile: "intro-lynx.dac", levelNumber: 2 })).toEqual({
      seriesFile: "intro-lynx.dac",
      levelNumber: 2,
    });
  });

  it("falls back to the first available level when the stored selection is missing", () => {
    const catalog = [
      createSeries("intro-ms.dac", "MS", [7, 8]),
      createSeries("intro-lynx.dac", "Lynx", [1, 2]),
    ];

    expect(resolveInitialSelection(catalog, { seriesFile: "missing.dac", levelNumber: 99 })).toEqual({
      seriesFile: "intro-ms.dac",
      levelNumber: 7,
    });
  });

  it("preserves the requested level when switching series if that level exists", () => {
    const catalog = [
      createSeries("intro-ms.dac", "MS", [1, 2, 3]),
      createSeries("intro-lynx.dac", "Lynx", [2, 4, 6]),
    ];

    expect(resolveSeriesSelection(catalog, "intro-lynx.dac", 2)).toEqual({
      seriesFile: "intro-lynx.dac",
      levelNumber: 2,
    });
    expect(resolveSeriesSelection(catalog, "intro-lynx.dac", 3)).toEqual({
      seriesFile: "intro-lynx.dac",
      levelNumber: 2,
    });
  });

  it("resolves explicit level selections only when the target level exists", () => {
    const series = createSeries("intro-ms.dac", "MS", [1, 2, 3]);

    expect(resolveLevelSelection(series, 2)).toEqual({
      seriesFile: "intro-ms.dac",
      levelNumber: 2,
    });
    expect(resolveLevelSelection(series, 9)).toBeNull();
  });

  it("uses family continuation rules when resolving a mobile family selection", () => {
    const family = createFamily();

    expect(resolveFamilySelection(family, "MS", family.id, 3)).toEqual({
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 3,
    });
    expect(resolveFamilySelection(family, null, "different-family", 1)).toEqual({
      seriesFile: "CCLP1-Lynx.dac",
      levelNumber: 2,
    });
  });

  it("shifts and jumps series selections with edge clamping", () => {
    const catalog = [
      createSeries("a.dac", "MS", [1]),
      createSeries("b.dac", "MS", [2, 3]),
      createSeries("c.dac", "MS", [4]),
    ];

    expect(shiftSeriesSelection(catalog, "b.dac", 3, -1)).toEqual({
      seriesFile: "a.dac",
      levelNumber: 1,
    });
    expect(shiftSeriesSelection(catalog, "c.dac", 4, 5)).toEqual({
      seriesFile: "c.dac",
      levelNumber: 4,
    });
    expect(jumpSeriesSelection(catalog, 3, "first")).toEqual({
      seriesFile: "a.dac",
      levelNumber: 1,
    });
    expect(jumpSeriesSelection(catalog, 3, "last")).toEqual({
      seriesFile: "c.dac",
      levelNumber: 4,
    });
  });

  it("shifts and jumps level selections with edge clamping", () => {
    const series = createSeries("intro-ms.dac", "MS", [1, 2, 3]);

    expect(shiftLevelSelection(series, 2, -1)).toBe(1);
    expect(shiftLevelSelection(series, 1, -1)).toBeNull();
    expect(jumpLevelSelection(series, "first")).toBe(1);
    expect(jumpLevelSelection(series, "last")).toBe(3);
  });

  it("resolves post-result actions for next level, restart, and series completion", () => {
    const series = createSeries("intro-ms.dac", "MS", [1, 2]);

    expect(resolveProceedAction("completed", series, 1, false)).toEqual({
      kind: "select-level",
      levelNumber: 2,
    });
    expect(resolveProceedAction("completed", series, 2, true)).toEqual({
      kind: "restart",
    });
    expect(resolveProceedAction("completed", series, 2, false)).toEqual({
      kind: "series-list",
      message: "intro-ms.dac completed.",
    });
    expect(resolveProceedAction("failed", series, 1, false)).toEqual({
      kind: "restart",
    });
  });
});
