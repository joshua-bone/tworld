import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { shouldDelayEmbeddedSelectionNotification } from "@player-web/impl/usePlayerAppCatalogController";

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

describe("usePlayerAppCatalogController", () => {
  const catalog = [
    createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS", ["Intro"]),
    createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx", ["Intro"]),
    createEntry("Imported.dat-ms.dac", "local:Imported.dat", "MS", ["Upload"]),
    createEntry("Imported.dat-lynx.dac", "local:Imported.dat", "Lynx", ["Upload"]),
  ];

  it("suppresses stale embedded selection notifications until the new parent selection is applied", () => {
    expect(shouldDelayEmbeddedSelectionNotification({
      catalog,
      chromeMode: "modern-embedded",
      initialSelection: { seriesFile: "Imported.dat-lynx.dac", levelNumber: 1 },
      lastNotifiedSelectionKey: "CCLP1-Lynx.dac:1",
      nextSelectionKey: "CCLP1-Lynx.dac:1",
    })).toBe(true);
  });

  it("allows the embedded player to acknowledge the current parent selection", () => {
    expect(shouldDelayEmbeddedSelectionNotification({
      catalog,
      chromeMode: "modern-embedded",
      initialSelection: { seriesFile: "Imported.dat-lynx.dac", levelNumber: 1 },
      lastNotifiedSelectionKey: "CCLP1-Lynx.dac:1",
      nextSelectionKey: "Imported.dat-lynx.dac:1",
    })).toBe(false);
  });

  it("allows later embedded navigation after the current parent selection was acknowledged", () => {
    expect(shouldDelayEmbeddedSelectionNotification({
      catalog,
      chromeMode: "modern-embedded",
      initialSelection: { seriesFile: "Imported.dat-lynx.dac", levelNumber: 1 },
      lastNotifiedSelectionKey: "Imported.dat-lynx.dac:1",
      nextSelectionKey: "Imported.dat-lynx.dac:2",
    })).toBe(false);
  });
});
