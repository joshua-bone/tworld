import { describe, expect, it } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  buildLegacyGameDrawStateKey,
  shouldBypassLegacyGameDrawStateMemoization,
} from "@player-web/impl/legacyCanvasMapRenderer";
import type { EngineMapCell } from "@game-core/api/model";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createCell(pos: number, z: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: {
      x: pos % 32,
      y: Math.floor(pos / 32),
      z,
      pos,
    },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function createSession(
  currentLayerTopId: number,
  renderOverrides: Partial<NonNullable<InteractiveGameSession["frame"]["render"]>> = {},
): InteractiveGameSession {
  const lowerCells = [createCell(0, 1, MS_TILE.Empty)];
  const upperCells = [createCell(0, 2, currentLayerTopId)];

  return {
    request: {
      seriesFile: "cloud-test.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123,
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
      cells: upperCells,
      currentZ: 2,
      visibleLayers: [
        { z: 2, cells: upperCells },
        { z: 1, cells: lowerCells },
      ],
      tileOverlays: [],
      render: {
        chip: null,
        actors: [],
        animations: [],
        ...renderOverrides,
      },
    },
    history: {
      enabled: true,
      initialTick: -1,
      currentTick: 10,
      latestTick: 10,
      checkpointTicks: [-1, 10],
      previousTick: 9,
      previousCheckpointTick: -1,
      timelineId: "main",
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
  it("changes when the current visible layer cell contents change", () => {
    const before = createSession(MS_TILE.Cloud);
    const after = createSession(MS_TILE.Air);

    expect(
      buildLegacyGameDrawStateKey(before, null, null, "Lynx", false, null, "legacy", true, true),
    ).not.toBe(
      buildLegacyGameDrawStateKey(after, null, null, "Lynx", false, null, "legacy", true, true),
    );
  });

  it("changes when only render-state visuals change", () => {
    const before = createSession(MS_TILE.Empty, {
      actors: [
        {
          id: MS_TILE.BowlingBall,
          pos: 0,
          z: 2,
          dir: MS_DIRECTION.east,
          moving: 4,
          frame: 1,
          hidden: false,
          visual: {
            kind: "creature",
            tileId: MS_TILE.BowlingBall,
            artworkSpriteId: "bowling_ball_moving",
            dir: MS_DIRECTION.east,
            moving: 4,
            frame: 1,
          },
        },
      ],
    });
    const after = createSession(MS_TILE.Empty, {
      actors: [
        {
          id: MS_TILE.BowlingBall,
          pos: 0,
          z: 2,
          dir: MS_DIRECTION.east,
          moving: 0,
          frame: 0,
          hidden: false,
          visual: {
            kind: "creature",
            tileId: MS_TILE.BowlingBall,
            artworkSpriteId: "bowling_ball_moving",
            dir: MS_DIRECTION.east,
            moving: 0,
            frame: 0,
          },
        },
      ],
    });

    expect(
      buildLegacyGameDrawStateKey(before, null, null, "Lynx", false, null, "legacy", true, true),
    ).not.toBe(
      buildLegacyGameDrawStateKey(after, null, null, "Lynx", false, null, "legacy", true, true),
    );
  });
});

describe("shouldBypassLegacyGameDrawStateMemoization", () => {
  it("bypasses gameplay memoization for layered Lynx sessions", () => {
    expect(shouldBypassLegacyGameDrawStateMemoization(createSession(MS_TILE.Cloud))).toBe(true);
  });

  it("keeps memoization for non-layered sessions and non-Lynx rulesets", () => {
    const lynxSingleLayer = createSession(MS_TILE.Empty);
    lynxSingleLayer.frame.visibleLayers = [lynxSingleLayer.frame.visibleLayers[0]!];
    const msLayered = createSession(MS_TILE.Cloud);
    msLayered.request.ruleset = "MS";

    expect(shouldBypassLegacyGameDrawStateMemoization(lynxSingleLayer)).toBe(false);
    expect(shouldBypassLegacyGameDrawStateMemoization(msLayered)).toBe(false);
    expect(shouldBypassLegacyGameDrawStateMemoization(null)).toBe(false);
  });
});
