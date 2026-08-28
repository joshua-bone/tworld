import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import {
  mergeInitialAndStoredReplayEntries,
  shouldDelayEmbeddedSelectionNotification,
} from "@player-web/impl/usePlayerAppCatalogController";
import type { BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";

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
  it("retains bundled references when user-controlled IDs collide and orders stored entries first", () => {
    const replay = (id: string, source: BrowserReplayEntry["source"]): BrowserReplayEntry => ({
      id,
      fileName: `${id}.hcr1`,
      seriesFile: "sandbox",
      levelNumber: 1,
      levelName: "Sandbox",
      ruleset: "Hybrid",
      savedAtMs: 0,
      source,
      result: null,
      finalScore: null,
      undoUsedCount: null,
      bytes: new Uint8Array(),
    });
    const reference = replay("reference", "reference");
    const storedCollision = replay("collision", "saved-run");

    expect(mergeInitialAndStoredReplayEntries(
      [reference, replay("collision", "reference")],
      [storedCollision],
    )).toEqual([storedCollision, reference, replay("collision", "reference")]);
  });

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
