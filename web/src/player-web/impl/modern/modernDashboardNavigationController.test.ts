import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import {
  buildModernDashboardNavigationModel,
  resolveEmbeddedSelectionIntent,
  resolveFamilySelectionIntent,
} from "@player-web/impl/modern/modernDashboardNavigationController";

function createLevels(names: readonly string[]): SeriesLevel[] {
  return names.map((name, index) => ({
    index,
    number: index + 1,
    name,
    author: "Test",
    password: "ABCD",
    timeLimitSeconds: 100,
    chipsRequired: 0,
    bestTimeTicks: 0,
    levelSize: 0,
    solutionSize: 0,
    levelHash: `${name}:level`,
    gameplayHash: `${name}:gameplay`,
    hasSolution: false,
    sgflags: 0,
    unsolvable: null,
  }));
}

function createEntry(
  filebase: string,
  mapfilename: string,
  ruleset: "MS" | "Lynx",
  levelNames: readonly string[],
): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename,
    ruleset,
    levels: createLevels(levelNames),
  };
}

describe("modernDashboardNavigationController", () => {
  it("builds the active dashboard selection from the default landing family", () => {
    const catalog = [
      createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS", ["Intro", "Locks"]),
      createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx", ["Intro", "Locks"]),
      createEntry("Imported.dat-ms.dac", "local:Imported.dat", "MS", ["Uploaded"]),
      createEntry("Imported.dat-lynx.dac", "local:Imported.dat", "Lynx", ["Uploaded"]),
    ];

    const model = buildModernDashboardNavigationModel({
      activeFamilyId: null,
      activeTab: "official",
      catalog,
      deferredSearchQuery: "",
      lastSelection: null,
      levelProgressSummaries: [],
      requestedLevelsByFamily: {},
      requestedRuleset: "Lynx",
    });

    expect(model.activeFamily?.id).toBe("official:cclp1");
    expect(model.activeEntry?.filebase).toBe("CCLP1-Lynx.dac");
    expect(model.activeSelection).toEqual({
      seriesFile: "CCLP1-Lynx.dac",
      levelNumber: 1,
    });
    expect(model.visibleFamilies.map((family) => family.id)).toEqual(["official:cclp1"]);
  });

  it("uses the first matched level when selecting a family from search results", () => {
    const catalog = [
      createEntry("TS0-MS.dac", "./data/TS0.dat", "MS", ["Warmup", "Blue Maze", "Gauntlet"]),
      createEntry("TS0-Lynx.dac", "./data/TS0.dat", "Lynx", ["Warmup", "Blue Maze", "Gauntlet"]),
    ];

    const model = buildModernDashboardNavigationModel({
      activeFamilyId: null,
      activeTab: "curated",
      catalog,
      deferredSearchQuery: "blue maze",
      lastSelection: null,
      levelProgressSummaries: [],
      requestedLevelsByFamily: {},
      requestedRuleset: "Lynx",
    });

    const intent = resolveFamilySelectionIntent({
      curated: model.curated,
      deferredSearchQuery: "blue maze",
      familyId: "curated:ts0",
      requestedRuleset: "Lynx",
    });

    expect(intent).toEqual({
      activeFamilyId: "curated:ts0",
      activeTab: "curated",
      requestedLevelNumber: 2,
    });
  });

  it("switches family, tab, and ruleset when the embedded player changes selection", () => {
    const catalog = [
      createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS", ["Intro", "Locks"]),
      createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx", ["Intro", "Locks"]),
      createEntry("Imported.dat-ms.dac", "local:Imported.dat", "MS", ["Upload One", "Upload Two"]),
      createEntry("Imported.dat-lynx.dac", "local:Imported.dat", "Lynx", ["Upload One", "Upload Two"]),
    ];

    const model = buildModernDashboardNavigationModel({
      activeFamilyId: "official:cclp1",
      activeTab: "official",
      catalog,
      deferredSearchQuery: "",
      lastSelection: { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1 },
      levelProgressSummaries: [],
      requestedLevelsByFamily: { "official:cclp1": 1 },
      requestedRuleset: "Lynx",
    });

    const intent = resolveEmbeddedSelectionIntent({
      currentLastSelection: { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1 },
      curated: model.curated,
      selection: {
        seriesFile: "Imported.dat-ms.dac",
        levelNumber: 2,
      },
    });

    expect(intent).toEqual({
      activeFamilyId: "local:imported",
      activeTab: "uploads",
      nextLastSelection: {
        seriesFile: "Imported.dat-ms.dac",
        levelNumber: 2,
      },
      requestedLevelNumber: 2,
      requestedRuleset: "MS",
      selectionChanged: true,
    });
  });
});
