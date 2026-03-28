import { describe, expect, it } from "vitest";
import { expectOverlayPresent } from "@game-core/impl/testOverlays";
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

function createSingleMoveReplayPayload() {
  return {
    flags: 0,
    randomSlideDirection: 0,
    stepping: 0,
    randomSeed: 123456789,
    moves: [{ when: 0, dir: MS_DIRECTION.east }],
  };
}

class StaticLevelRepository implements LevelRepository {
  constructor(private readonly loaded: LoadedLevelData) {}

  async loadLevel(request: GameRequest): Promise<LoadedLevelData> {
    const primaryLevelData =
      this.loaded.levelData.byteLength > 0
        ? this.loaded.levelData
        : (this.loaded.layerData[0] ?? this.loaded.levelData);
    return {
      request,
      levelData: new Uint8Array(primaryLevelData),
      layerData: this.loaded.layerData.map((entry) => new Uint8Array(entry)),
    };
  }
}

describe("interactive session projection", () => {
  it("projects MS sessions with actor render metadata", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    expect(session.frame.cells).toHaveLength(32 * 32);
    expect(session.frame.currentZ).toBe(1);
    expect(session.frame.visibleLayers.map((layer) => layer.z)).toEqual([1]);
    expect(session.frame.render?.chip).toBeNull();
    expect(Array.isArray(session.frame.render?.actors)).toBe(true);
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
    expect(session.frame.currentZ).toBe(1);
    expect(session.frame.visibleLayers.map((layer) => layer.z)).toEqual([1]);
    expect(session.frame.render?.chip).toMatchObject({
      hidden: false,
      failed: false,
      visual: expect.objectContaining({
        kind: "creature",
      }),
    });
    expect(Array.isArray(session.frame.render?.actors)).toBe(true);
    expect(session.frame.render?.actors.every((actor) => typeof actor.serial === "number")).toBe(true);
    expect(session.frame.render?.actors.every((actor) => actor.visual?.kind === "creature")).toBe(true);
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

  it("projects MS replay sessions with replay metadata and recorded moves", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startReplaySession(
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      createSingleMoveReplayPayload(),
    );

    expect(session.mode).toBe("replay");
    expect(session.run.replayAvailable).toBe(true);
    expect(session.recordedMoves).toEqual([{ when: 0, dir: MS_DIRECTION.east, modifierMask: 0 }]);
    expect(session.history).toMatchObject({
      enabled: true,
      initialTick: -1,
      currentTick: -1,
      latestTick: -1,
      restoreMode: "live",
      replayTargetTick: null,
    });

    const next = await adapter.advanceSession(session, MS_DIRECTION.none);

    expect(next.mode).toBe("replay");
    expect(next.history.currentTick).toBe(0);
    expect(next.recordedMoves).toEqual([{ when: 0, dir: MS_DIRECTION.east, modifierMask: 0 }]);
  });

  it("projects Lynx replay sessions with replay metadata and recorded moves", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startReplaySession(
      {
        seriesFile: "intro-lynx.dac",
        levelNumber: 1,
        ruleset: "Lynx",
        randomSeed: 123456789,
      },
      createSingleMoveReplayPayload(),
    );

    expect(session.mode).toBe("replay");
    expect(session.run.replayAvailable).toBe(true);
    expect(session.recordedMoves).toEqual([{ when: 0, dir: MS_DIRECTION.east, modifierMask: 0 }]);
    expect(session.frame.render?.actors.every((actor) => typeof actor.serial === "number")).toBe(true);
    expect(session.history).toMatchObject({
      enabled: true,
      initialTick: -1,
      currentTick: -1,
      latestTick: -1,
      restoreMode: "live",
      replayTargetTick: null,
    });

    const next = await adapter.advanceSession(session, MS_DIRECTION.none);

    expect(next.mode).toBe("replay");
    expect(next.history.currentTick).toBe(0);
    expect(next.recordedMoves).toEqual([{ when: 0, dir: MS_DIRECTION.east, modifierMask: 0 }]);
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

  it("projects the manual MS stepping override onto the initial snapshot", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession(
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      {
        msStepping: 4,
      },
    );

    expect(session.frame.snapshot.stepping).toBe(4);
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
    expect(session.frame.currentZ).toBe(2);
    expect(session.frame.visibleLayers.map((layer) => layer.z)).toEqual([2, 1]);
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
    expect(session.frame.currentZ).toBe(2);
    expect(session.frame.visibleLayers.map((layer) => layer.z)).toEqual([2, 1]);
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
    expect(session.frame.visibleLayers.map((layer) => layer.z)).toEqual([2, 1]);

    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);

    expect(session.hintText).toBe("lower-ms");
    expect(session.frame.currentZ).toBe(1);
    expect(session.frame.visibleLayers.map((layer) => layer.z)).toEqual([1]);
  });

  it("projects MS support overlays on the supported actor layer", async () => {
    const adapter = new MsGameEngineAdapter(
      new StaticLevelRepository({
        request: {
          seriesFile: "3d-support-ms.dac",
          levelNumber: 1,
          ruleset: "MS",
          randomSeed: 123456789,
        },
        levelData: new Uint8Array(),
        layerData: [
          createSingleCellLevelData(1, 0, ""),
          createSingleCellLevelData(111, 32, ""),
        ],
      }),
    );

    let session = await adapter.startSession({
      seriesFile: "3d-support-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);

    expect(session.frame.currentZ).toBe(2);
    expectOverlayPresent(session.frame.tileOverlays, {
      z: 2,
      pos: 0,
      kind: "support",
    });

    session = await adapter.advanceSession(session, MS_DIRECTION.none);

    expectOverlayPresent(session.frame.tileOverlays, {
      z: 2,
      pos: 0,
      kind: "support",
    });
  });

  it("projects MS elevator-failure overlays on blocked upward movement", async () => {
    const adapter = new MsGameEngineAdapter(
      new StaticLevelRepository({
        request: {
          seriesFile: "3d-elevator-fail-ms.dac",
          levelNumber: 1,
          ruleset: "MS",
          randomSeed: 123456789,
        },
        levelData: new Uint8Array(),
        layerData: [
          createSingleCellLevelData(0, 0, ""),
          createSingleCellLevelData(111, 57, ""),
          createSingleCellLevelData(3, 0, ""),
        ],
      }),
    );

    let session = await adapter.startSession({
      seriesFile: "3d-elevator-fail-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);
    session = await adapter.advanceSession(session, MS_DIRECTION.none);

    expect(session.frame.currentZ).toBe(2);
    expectOverlayPresent(session.frame.tileOverlays, {
      z: 2,
      pos: 0,
      kind: "elevator-failure",
    });
  });

  it("does not project Lynx elevator-failure overlays when the layered fixture starts on the upper layer", async () => {
    const adapter = new LynxGameEngineAdapter(
      new StaticLevelRepository({
        request: {
          seriesFile: "3d-elevator-fail-lynx.dac",
          levelNumber: 1,
          ruleset: "Lynx",
          randomSeed: 123456789,
        },
        levelData: new Uint8Array(),
        layerData: [
          createSingleCellLevelData(0, 0, ""),
          createSingleCellLevelData(111, 57, ""),
          createSingleCellLevelData(3, 0, ""),
        ],
      }),
    );

    const session = await adapter.startSession({
      seriesFile: "3d-elevator-fail-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });

    let next = session;
    for (let index = 0; index < 4; index += 1) {
      next = await adapter.advanceSession(next, MS_DIRECTION.none);
    }

    expect(next.frame.currentZ).toBe(2);
    expect(next.frame.tileOverlays).toEqual([]);
  });
});
