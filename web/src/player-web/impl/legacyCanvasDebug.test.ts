import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { buildLegacyCanvasDebugReadout } from "@player-web/impl/legacyCanvasDebug";
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

function createSession(): InteractiveGameSession {
  const lowerCells = [createCell(0, 1, MS_TILE.Empty, MS_TILE.Empty)];
  const upperCells = [createCell(0, 2, MS_TILE.Air, MS_TILE.Empty)];

  return {
    request: {
      levelNumber: 1,
      randomSeed: 123,
      ruleset: "Lynx",
      seriesFile: "debug-test.dac",
    },
    mode: "manual",
    hintText: null,
    frame: {
      snapshot: {
        phase: "tick",
        input: "none",
        inputCode: 0,
        status: "playing",
        tick: 4,
        currentTime: 4,
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
      tileOverlays: [
        {
          z: 2,
          pos: 0,
          kind: "support",
          render: {
            mode: "outline",
            style: "support",
          },
        },
      ],
      render: {
        chip: {
          pos: 0,
          z: 2,
          dir: MS_DIRECTION.east,
          moving: 2,
          pushing: false,
          hidden: false,
          failed: false,
          endGameAnimationTileId: null,
          endGameAnimationFrame: null,
          visual: {
            kind: "creature",
            tileId: MS_TILE.Chip,
          },
        },
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
            },
          },
        ],
        animations: [
          {
            pos: 0,
            z: 2,
            frame: 3,
            tileId: MS_TILE.Water,
          },
        ],
      },
    },
    history: {
      enabled: true,
      initialTick: 0,
      currentTick: 4,
      latestTick: 4,
      checkpointTicks: [0],
      previousTick: 3,
      previousCheckpointTick: 0,
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

describe("buildLegacyCanvasDebugReadout", () => {
  it("returns a layered readout with overlays and render occupants for the hovered cell", () => {
    expect(buildLegacyCanvasDebugReadout(createSession(), 0)).toEqual([
      "ruleset=Lynx mode=manual tick=4 time=4 phase=tick",
      "hover pos=0 x=0 y=0 currentZ=2 visibleLayers=2",
      "current: top=Air(62) state=0 bottom=Empty(1) state=0",
      "layer z=2: top=Air(62) state=0 bottom=Empty(1) state=0",
      "layer z=1: top=Empty(1) state=0 bottom=Empty(1) state=0",
      "overlay z=2 kind=support tile=- render=outline:support",
      "chip z=2 dir=east moving=2 pushing=false hidden=false failed=false visual=Chip(64)",
      "actor z=2 id=BowlingBall(116) dir=east moving=4 frame=1 hidden=false visual=BowlingBall(116)",
      "animation z=2 tile=Water(14) frame=3",
    ]);
  });

  it("returns no lines when there is no active session or hover target", () => {
    expect(buildLegacyCanvasDebugReadout(null, 0)).toEqual([]);
    expect(buildLegacyCanvasDebugReadout(createSession(), null)).toEqual([]);
  });
});
