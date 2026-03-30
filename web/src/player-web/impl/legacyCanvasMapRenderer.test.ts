import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { buildLegacyGameDrawStateKey } from "@player-web/impl/legacyCanvasMapRenderer";
import { MS_TILE } from "@ruleset-ms/api/tiles";

function createCell(topId: number, bottomId = MS_TILE.Empty): EngineMapCell {
  return {
    position: { x: 0, y: 0, pos: 0, z: 2 },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function createSession(topId: number): InteractiveGameSession {
  return {
    request: {
      seriesFile: "TEST",
      levelNumber: 1,
      ruleset: "Lynx",
    },
    mode: "manual",
    hintText: null,
    frame: {
      snapshot: {
        phase: "tick",
        input: "none",
        inputCode: 0,
        status: "playing",
        tick: 10,
        currentTime: 10,
        timeOffset: 0,
        secondsPlayed: 0,
        timelimit: 0,
        chipsNeeded: 0,
        statusFlags: 0,
        lastMoveCode: 0,
        lastMove: "none",
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: 0,
        randomState: {
          main: { initial: "0", value: "0", shared: false },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects: 0,
        view: { x: 0, y: 0 },
        inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0], tools: [0] },
        chip: null,
        creatureCount: 0,
        creaturesHash: "",
        mapHash: "",
        creatures: [],
      },
      cells: [createCell(topId)],
      currentZ: 2,
      visibleLayers: [
        { z: 2, cells: [createCell(topId)] },
        { z: 1, cells: [createCell(MS_TILE.Empty)] },
      ],
      tileOverlays: [],
      render: {
        chip: null,
        actors: [],
        animations: [],
      },
    },
    history: {
      enabled: true,
      initialTick: 0,
      currentTick: 10,
      latestTick: 10,
      checkpointTicks: [],
      previousTick: 9,
      previousCheckpointTick: null,
      timelineId: "timeline",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
    run: {
      undoUsedCount: 0,
      replayAvailable: false,
      result: null,
    },
    recordedMoves: [],
    handle: {} as InteractiveGameSession["handle"],
  };
}

describe("buildLegacyGameDrawStateKey", () => {
  it("changes when the projected visible layer cells change without a snapshot change", () => {
    const cloudSession = createSession(MS_TILE.Cloud);
    const airSession = createSession(MS_TILE.Air);

    const cloudKey = buildLegacyGameDrawStateKey(
      cloudSession,
      null,
      null,
      "Lynx",
      false,
      null,
      "legacy",
      true,
      true,
    );
    const airKey = buildLegacyGameDrawStateKey(
      airSession,
      null,
      null,
      "Lynx",
      false,
      null,
      "legacy",
      true,
      true,
    );

    expect(cloudKey).not.toBe(airKey);
  });
});
