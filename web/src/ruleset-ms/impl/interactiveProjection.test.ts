import { describe, expect, it } from "vitest";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import { MS_FLOOR_STATE, MS_TILE } from "@ruleset-ms/api/tiles";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";

function createCell(pos: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: {
      x: pos % 32,
      y: Math.floor(pos / 32),
      z: 1,
      pos,
    },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function createEngineState(cells: EngineMapCell[]): EngineState {
  return {
    request: {
      seriesFile: "test.dat",
      levelNumber: 1,
      ruleset: "MS",
    },
    status: "playing",
    timer: {
      tick: 0,
      currentTime: 0,
      timeOffset: 0,
      secondsPlayed: 0,
      timeLimit: 0,
    },
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      chipsNeeded: 0,
    },
    replay: {
      cursor: 0,
      stepping: 0,
      moveCount: 0,
      bestTimeTicks: 0,
      initialRandomSlideDirection: "north",
      randomState: {
        main: {
          initial: "0",
          value: "0",
          shared: false,
        },
        lynx: {
          prng1: 0,
          prng2: 0,
        },
      },
    },
    chip: null,
    actors: [],
    map: {
      hash: "",
      creaturesHash: "",
      creatureCount: 0,
      cells,
    },
    view: {
      x: 0,
      y: 0,
    },
    soundEffects: 0,
    statusFlags: 0,
    lastMove: {
      code: 0,
      name: "none",
    },
  };
}

describe("projectMsInteractiveFrame", () => {
  it("marks held-button beartraps as visually open in the projected frame only", () => {
    const cells = [createCell(0, MS_TILE.Block_Static, MS_TILE.Button_Brown), createCell(1, MS_TILE.Beartrap)];
    const session = {
      state: {
        engine: createEngineState(cells),
        internal: {
          chipZ: 1,
          traps: [{ from: 0, to: 1 }],
        },
      },
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
    } as unknown as MsInteractiveSessionState;

    const frame = projectMsInteractiveFrame(session, "tick");

    expect(frame.cells[1]?.top.state & MS_FLOOR_STATE.TrapOpen).not.toBe(0);
    expect(session.state.engine.map.cells[1]?.top.state & MS_FLOOR_STATE.TrapOpen).toBe(0);
  });
});
