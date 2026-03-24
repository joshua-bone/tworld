import { describe, expect, it } from "vitest";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import { MS_DIRECTION, MS_FLOOR_STATE, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
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

  it("projects hidden-wall reveal overlays from runtime state", () => {
    const cells = [createCell(0, MS_TILE.Empty), createCell(1, MS_TILE.HiddenWall_Perm)];
    const engine = createEngineState(cells) as EngineState & {
      msRuntimeState?: {
        tileOverlays?: Array<{
          z: number;
          pos: number;
          kind: "hidden-wall-reveal";
          ttl: number;
        }>;
      };
    };
    engine.msRuntimeState = {
      tileOverlays: [{ z: 1, pos: 1, kind: "hidden-wall-reveal", ttl: 10 }],
    };
    const session = {
      state: {
        engine,
        internal: {
          chipZ: 1,
          traps: [],
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

    expect(frame.tileOverlays).toContainEqual({
      z: 1,
      pos: 1,
      kind: "hidden-wall-reveal",
    });
  });

  it("projects tracked creature and block directions into render actors", () => {
    const cells = [createCell(0, MS_TILE.Empty), createCell(1, MS_TILE.Empty)];
    const session = {
      state: {
        engine: createEngineState(cells),
        internal: {
          chipZ: 1,
          traps: [],
          creatures: [
            {
              id: MS_TILE.Blob,
              pos: 0,
              z: 1,
              dir: MS_DIRECTION.east,
              moving: 0,
              frame: 0,
              hidden: false,
            },
          ],
          blocks: [
            {
              pos: 1,
              z: 1,
              dir: MS_DIRECTION.south,
              hidden: false,
            },
          ],
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

    expect(frame.render?.chip).toBeNull();
    expect(frame.render?.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: MS_TILE.Blob,
          pos: 0,
          dir: MS_DIRECTION.east,
          hidden: false,
        }),
        expect.objectContaining({
          id: MS_TILE.Block,
          pos: 1,
          dir: MS_DIRECTION.south,
          hidden: false,
        }),
      ]),
    );
  });

  it("falls back to engine actors for stationary cloner occupants", () => {
    const cells = [
      createCell(0, msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east), MS_TILE.CloneMachine),
      createCell(1, msCreatureTile(MS_TILE.Block, MS_DIRECTION.south), MS_TILE.CloneMachine),
    ];
    const engine = createEngineState(cells);
    engine.actors = [
      {
        id: MS_TILE.Ball,
        layer: 1,
        dir: "east",
        position: {
          x: 0,
          y: 0,
          z: 1,
          pos: 0,
        },
        state: 0,
      },
      {
        id: MS_TILE.Block,
        layer: 1,
        dir: "south",
        position: {
          x: 1,
          y: 0,
          z: 1,
          pos: 1,
        },
        state: 0,
      },
    ];
    const session = {
      state: {
        engine,
        internal: {
          chipZ: 1,
          traps: [],
          creatures: [],
          blocks: [],
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

    expect(frame.render?.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: MS_TILE.Ball,
          pos: 0,
          dir: MS_DIRECTION.east,
          hidden: false,
        }),
        expect.objectContaining({
          id: MS_TILE.Block,
          pos: 1,
          dir: MS_DIRECTION.south,
          hidden: false,
        }),
      ]),
    );
  });
});
