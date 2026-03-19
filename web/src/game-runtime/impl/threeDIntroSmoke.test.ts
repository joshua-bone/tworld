import { describe, expect, it } from "vitest";
import { loadNodeSeriesCatalogEntries } from "@level-catalog/impl/loadNodeSeriesCatalogEntries";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";

async function advanceMany<TSession>(
  session: TSession,
  advance: (session: TSession) => Promise<TSession>,
  count: number,
): Promise<TSession> {
  let current = session;
  for (let index = 0; index < count; index += 1) {
    current = await advance(current);
  }
  return current;
}

describe("3DINTRO curated set", () => {
  it("loads both curated 3D wrappers into the playable catalog", async () => {
    const catalog = await loadNodeSeriesCatalogEntries(["3DINTRO-MS.dac", "3DINTRO-Lynx.dac"]);

    expect(catalog.map((entry) => entry.filebase)).toEqual(["3DINTRO-MS.dac", "3DINTRO-Lynx.dac"]);
    expect(catalog.map((entry) => entry.levels.length)).toEqual([3, 3]);
    expect(catalog[0]?.levels.map((level) => level.name)).toEqual([
      "Collecting Chips In 3D",
      "Locked and Unlocked",
      "Hills and Valleys",
    ]);
  });

  it("starts and advances every MS curated 3D level without crashing", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const [series] = await loadNodeSeriesCatalogEntries(["3DINTRO-MS.dac"]);

    for (const levelNumber of series?.levels.map((level) => level.number) ?? []) {
      const started = await adapter.startSession({
        seriesFile: "3DINTRO-MS.dac",
        levelNumber,
        ruleset: "MS",
        randomSeed: 123456789,
      });
      const advanced = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 4);

      expect(started.frame.visibleLayers.length).toBeGreaterThan(0);
      expect(advanced.frame.visibleLayers.length).toBeGreaterThan(0);
    }
  });

  it("starts and advances every Lynx curated 3D level without crashing", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const [series] = await loadNodeSeriesCatalogEntries(["3DINTRO-Lynx.dac"]);

    for (const levelNumber of series?.levels.map((level) => level.number) ?? []) {
      const started = await adapter.startSession({
        seriesFile: "3DINTRO-Lynx.dac",
        levelNumber,
        ruleset: "Lynx",
        randomSeed: 123456789,
      });
      const advanced = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 4);

      expect(started.frame.visibleLayers.length).toBeGreaterThan(0);
      expect(advanced.frame.visibleLayers.length).toBeGreaterThan(0);
    }
  });
});
