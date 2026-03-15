import { describe, expect, it } from "vitest";
import { loadNodeSeriesCatalogEntries } from "@level-catalog/impl/loadNodeSeriesCatalogEntries";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { decodeMsLevelGroupData, prepareMsLevel } from "@ruleset-ms/api/level";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

async function advanceMany<TSession>(session: TSession, advance: (session: TSession) => Promise<TSession>, count: number): Promise<TSession> {
  let current = session;
  for (let index = 0; index < count; index += 1) {
    current = await advance(current);
  }
  return current;
}

async function advanceInputs<TSession>(
  session: TSession,
  advance: (session: TSession, input: "none" | "east") => Promise<TSession>,
  inputs: ReadonlyArray<"none" | "east">,
): Promise<TSession> {
  let current = session;
  for (const input of inputs) {
    current = await advance(current, input);
  }
  return current;
}

function tileIdAtLevel(level: ReturnType<typeof prepareMsLevel>, z: number, x: number, y: number): number | null {
  const layer = (level.layers ?? [{ z: 1, cells: level.cells }]).find((entry) => entry.z === z);
  return layer?.cells.find((cell) => cell.position.x === x && cell.position.y === y)?.top.id ?? null;
}

describe("3DINTRO showcase set", () => {
  it("loads both showcase wrappers into the playable catalog", async () => {
    const catalog = await loadNodeSeriesCatalogEntries(["3DINTRO-MS.dac", "3DINTRO-Lynx.dac"]);

    expect(catalog.map((entry) => entry.filebase)).toEqual(["3DINTRO-MS.dac", "3DINTRO-Lynx.dac"]);
    expect(catalog.map((entry) => entry.levels.length)).toEqual([21, 21]);
    expect(catalog[0]?.levels.map((level) => level.name)).toEqual([
      "Air Key",
      "Ice Landing",
      "Force Landing",
      "Door Socket Support",
      "Blue Walls",
      "Chip On Monster",
      "Monster On Chip",
      "Block On Chip",
      "Elevator Rise",
      "Elevator Push",
      "Layer Hints",
      "Layer Wiring",
      "Block Over Air",
      "Monster Over Air",
      "Monster Elevator Rise",
      "Monster Air Fall",
      "Monster Bomb Fall",
      "Monster Water Fall",
      "Block Bomb Fall",
      "Block Water Fall",
      "Block To Elevator",
    ]);
  });

  it("starts and advances every MS showcase level without crashing", async () => {
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

  it("starts and advances every Lynx showcase level without crashing", async () => {
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

  it("keeps static 3D terrain on the top layer in the showcase data", async () => {
    const levels = new NodeLevelRepository();
    const [series] = await loadNodeSeriesCatalogEntries(["3DINTRO-MS.dac"]);
    const levelNumberByName = new Map(series?.levels.map((level) => [level.name, level.number]) ?? []);

    const elevatorRiseLoaded = await levels.loadLevel({
      seriesFile: "3DINTRO-MS.dac",
      levelNumber: levelNumberByName.get("Elevator Rise") ?? 0,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const elevatorRise = prepareMsLevel(decodeMsLevelGroupData(elevatorRiseLoaded.layerData));
    expect(tileIdAtLevel(elevatorRise, 1, 5, 5)).toBe(MS_TILE.Elevator);
    expect(tileIdAtLevel(elevatorRise, 2, 10, 5)).toBe(MS_TILE.Air);

    const layerHintsLoaded = await levels.loadLevel({
      seriesFile: "3DINTRO-MS.dac",
      levelNumber: levelNumberByName.get("Layer Hints") ?? 0,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const layerHints = prepareMsLevel(decodeMsLevelGroupData(layerHintsLoaded.layerData));
    expect(tileIdAtLevel(layerHints, 1, 8, 5)).toBe(MS_TILE.HintButton);
    expect(tileIdAtLevel(layerHints, 2, 8, 5)).toBe(MS_TILE.Air);

    const layerWiringLoaded = await levels.loadLevel({
      seriesFile: "3DINTRO-MS.dac",
      levelNumber: levelNumberByName.get("Layer Wiring") ?? 0,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const layerWiring = prepareMsLevel(decodeMsLevelGroupData(layerWiringLoaded.layerData));
    expect(tileIdAtLevel(layerWiring, 1, 12, 10)).toBe(msCreatureTile(MS_TILE.Block, MS_DIRECTION.east));
    expect(tileIdAtLevel(layerWiring, 2, 12, 10)).toBe(msCreatureTile(MS_TILE.Block, MS_DIRECTION.east));
  });

  it("kills Chip when he falls vertically onto a monster in the MS showcase", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const [series] = await loadNodeSeriesCatalogEntries(["3DINTRO-MS.dac"]);
    const levelNumber = series?.levels.find((level) => level.name === "Chip On Monster")?.number ?? 0;

    const started = await adapter.startSession({
      seriesFile: "3DINTRO-MS.dac",
      levelNumber,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const finished = await advanceInputs(
      started,
      (current, input) => adapter.advanceSession(current, input),
      Array.from({ length: 19 }, () => "east" as const),
    );

    expect(finished.frame.snapshot.status).toBe("failed");
    expect(finished.frame.currentZ).toBe(1);
  });

  it("does not auto-slide after falling vertically onto ice in the Lynx showcase", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const [series] = await loadNodeSeriesCatalogEntries(["3DINTRO-Lynx.dac"]);
    const levelNumber = series?.levels.find((level) => level.name === "Ice Landing")?.number ?? 0;

    const started = await adapter.startSession({
      seriesFile: "3DINTRO-Lynx.dac",
      levelNumber,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });
    const settled = await advanceInputs(
      started,
      (current, input) => adapter.advanceSession(current, input),
      Array.from({ length: 6 }, () => "none" as const),
    );

    expect(settled.frame.snapshot.status).toBe("playing");
    expect(settled.frame.render?.chip?.z).toBe(1);
    expect(settled.frame.render?.chip?.pos).toBe(5 + 5 * 32);
  });
});
