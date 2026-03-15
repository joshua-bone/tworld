import { describe, expect, it } from "vitest";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import type { GameRequest } from "@game-core/api/types";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import type { LoadedLevelData, LevelRepository } from "@level-catalog/ports/LevelRepository";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";

function createSingleCellLevelData(topFileCode: number, bottomFileCode: number, hintText: string, levelNumber = 1): Uint8Array {
  const hintBytes = Array.from(hintText, (character) => character.charCodeAt(0));
  const metadataSize = hintBytes.length === 0 ? 0 : 2 + hintBytes.length;

  return Uint8Array.from([
    levelNumber,
    0,
    12,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    topFileCode,
    1,
    0,
    bottomFileCode,
    metadataSize & 0xff,
    (metadataSize >> 8) & 0xff,
    ...(hintBytes.length === 0 ? [] : [7, hintBytes.length, ...hintBytes]),
  ]);
}

class StaticLevelRepository implements LevelRepository {
  constructor(private readonly loaded: LoadedLevelData) {}

  async loadLevel(request: GameRequest): Promise<LoadedLevelData> {
    return {
      request,
      levelData: new Uint8Array(this.loaded.levelData),
      layerData: this.loaded.layerData.map((entry) => new Uint8Array(entry)),
    };
  }
}

describe("interactive session projection", () => {
  it("projects MS sessions without exposing render overlays", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    expect(session.frame.cells).toHaveLength(32 * 32);
    expect(session.frame.render).toBeNull();
    expect(session.history).toMatchObject({
      enabled: true,
      initialTick: -1,
      currentTick: -1,
      latestTick: -1,
      checkpointTicks: [-1],
      previousTick: null,
      previousCheckpointTick: null,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });
    expect(session.handle).toBeTruthy();
  });

  it("projects Lynx sessions with render overlays on the frame", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession({
      seriesFile: "intro-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });

    expect(session.frame.cells).toHaveLength(32 * 32);
    expect(session.frame.render?.chip).toMatchObject({
      hidden: false,
      failed: false,
    });
    expect(Array.isArray(session.frame.render?.actors)).toBe(true);
    expect(session.history.currentTick).toBe(-1);

    const next = await adapter.advanceSession(session, "none");
    expect(next.frame.render?.chip?.pos).toBe(session.frame.render?.chip?.pos);
    expect(next.history).toMatchObject({
      enabled: true,
      currentTick: 0,
      latestTick: 0,
      timelineId: "main",
      timelineCount: 1,
      previousTick: -1,
      previousCheckpointTick: -1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });
    expect(next.handle).toBeTruthy();
  });

  it("projects disabled undo history when a session starts with undo disabled", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession(
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      {
        undoSettings: {
          enabled: false,
        },
      },
    );

    expect(session.history).toMatchObject({
      enabled: false,
      initialTick: -1,
      currentTick: -1,
      latestTick: -1,
      checkpointTicks: [-1],
      previousTick: null,
      previousCheckpointTick: null,
      restoreMode: "live",
    });
  });

  it("projects the active MS hint text from the player's current z-layer", async () => {
    const adapter = new MsGameEngineAdapter(
      new StaticLevelRepository({
        request: {
          seriesFile: "3d-hints-ms.dac",
          levelNumber: 1,
          ruleset: "MS",
          randomSeed: 123456789,
        },
        levelData: new Uint8Array(),
        layerData: [
          createSingleCellLevelData(0, 0, "lower-ms"),
          createSingleCellLevelData(111, 47, "upper-ms"),
        ],
      }),
    );

    const session = await adapter.startSession({
      seriesFile: "3d-hints-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    expect(session.hintText).toBe("upper-ms");
  });

  it("projects the active Lynx hint text from the player's current z-layer", async () => {
    const adapter = new LynxGameEngineAdapter(
      new StaticLevelRepository({
        request: {
          seriesFile: "3d-hints-lynx.dac",
          levelNumber: 1,
          ruleset: "Lynx",
          randomSeed: 123456789,
        },
        levelData: new Uint8Array(),
        layerData: [
          createSingleCellLevelData(0, 0, "lower-lynx"),
          createSingleCellLevelData(111, 47, "upper-lynx"),
        ],
      }),
    );

    const session = await adapter.startSession({
      seriesFile: "3d-hints-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });

    expect(session.hintText).toBe("upper-lynx");
  });

  it("updates the active MS hint text after Chip falls to a lower layer", async () => {
    const adapter = new MsGameEngineAdapter(
      new StaticLevelRepository({
        request: {
          seriesFile: "3d-hints-ms-air.dac",
          levelNumber: 1,
          ruleset: "MS",
          randomSeed: 123456789,
        },
        levelData: new Uint8Array(),
        layerData: [
          createSingleCellLevelData(47, 0, "lower-ms"),
          createSingleCellLevelData(111, 32, "upper-ms"),
        ],
      }),
    );

    let session = await adapter.startSession({
      seriesFile: "3d-hints-ms-air.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    expect(session.hintText).toBe("upper-ms");

    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);

    expect(session.hintText).toBe("lower-ms");
  });
});
