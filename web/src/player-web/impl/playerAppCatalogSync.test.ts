import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { shouldSyncEmbeddedPlayerCatalog } from "@player-web/impl/playerAppCatalogSync";

function createLevel(number: number, gameplayHash: string): SeriesLevel {
  return {
    index: number - 1,
    number,
    name: `Level ${number}`,
    author: "Tester",
    password: "",
    timeLimitSeconds: 100,
    chipsRequired: 0,
    bestTimeTicks: 0,
    levelSize: 32 * 32,
    solutionSize: 0,
    levelHash: `level:${gameplayHash}`,
    gameplayHash,
    hasSolution: false,
    sgflags: 0,
    unsolvable: null,
  };
}

function createEntry(
  filebase: string,
  mapfilename: string,
  ruleset: SeriesCatalogEntry["ruleset"],
  gameplayHashes: readonly string[],
): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    ruleset,
    mapfilename,
    levels: gameplayHashes.map((gameplayHash, index) => createLevel(index + 1, gameplayHash)),
  };
}

describe("shouldSyncEmbeddedPlayerCatalog", () => {
  it("refreshes when the modern shell adds a newly imported local set", () => {
    const currentCatalog = [
      createEntry("3DINTRO-Lynx.dac", "./data/3DINTRO.dat", "Lynx", ["intro:1"]),
      createEntry("3DINTRO-MS.dac", "./data/3DINTRO.dat", "MS", ["intro:1"]),
    ];
    const nextCatalog = [
      ...currentCatalog,
      createEntry("Uploaded.dat-lynx.dac", "local:Uploaded.dat", "Lynx", ["upload:1", "upload:2"]),
      createEntry("Uploaded.dat-ms.dac", "local:Uploaded.dat", "MS", ["upload:1", "upload:2"]),
    ];

    expect(shouldSyncEmbeddedPlayerCatalog(currentCatalog, nextCatalog)).toBe(true);
  });

  it("refreshes when a local set is overwritten in place with new level data", () => {
    const currentCatalog = [
      createEntry("Uploaded.dat-lynx.dac", "local:Uploaded.dat", "Lynx", ["old:1", "old:2"]),
      createEntry("Uploaded.dat-ms.dac", "local:Uploaded.dat", "MS", ["old:1", "old:2"]),
    ];
    const nextCatalog = [
      createEntry("Uploaded.dat-lynx.dac", "local:Uploaded.dat", "Lynx", ["new:1", "new:2"]),
      createEntry("Uploaded.dat-ms.dac", "local:Uploaded.dat", "MS", ["new:1", "new:2"]),
    ];

    expect(shouldSyncEmbeddedPlayerCatalog(currentCatalog, nextCatalog)).toBe(true);
  });

  it("does not refresh when the catalog contents are unchanged", () => {
    const currentCatalog = [
      createEntry("Uploaded.dat-lynx.dac", "local:Uploaded.dat", "Lynx", ["same:1", "same:2"]),
      createEntry("Uploaded.dat-ms.dac", "local:Uploaded.dat", "MS", ["same:1", "same:2"]),
    ];
    const nextCatalog = [...currentCatalog].reverse();

    expect(shouldSyncEmbeddedPlayerCatalog(currentCatalog, nextCatalog)).toBe(false);
  });
});
