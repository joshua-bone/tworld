import { describe, expect, it } from "vitest";
import type { EngineState } from "@game-core/api/model";
import { createStatefulActorRuntimeStore, setStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { expectOverlayPresent } from "@game-core/impl/testOverlays";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import { MS_DIRECTION, MS_FLOOR_STATE, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import { createCell, createEngineState } from "@ruleset-ms/impl/testSupport";

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

    expectOverlayPresent(frame.tileOverlays, {
      z: 1,
      pos: 1,
      kind: "hidden-wall-reveal",
    });
  });

  it("projects push-pickup reveal overlays with tile ids from runtime state", () => {
    const cells = [createCell(0, MS_TILE.Empty), createCell(1, MS_TILE.Empty)];
    const engine = createEngineState(cells) as EngineState & {
      msRuntimeState?: {
        tileOverlays?: Array<{
          z: number;
          pos: number;
          kind: "push-pickup-reveal";
          ttl: number;
          tileId: number;
        }>;
      };
    };
    engine.msRuntimeState = {
      tileOverlays: [{ z: 1, pos: 1, kind: "push-pickup-reveal", ttl: 3, tileId: MS_TILE.Key_Yellow }],
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

    expectOverlayPresent(frame.tileOverlays, {
      z: 1,
      pos: 1,
      kind: "push-pickup-reveal",
      tileId: MS_TILE.Key_Yellow,
    });
  });

  it("projects carried tool overlays from the primed drop state", () => {
    const cells = [createCell(0, MS_TILE.Empty), createCell(1, MS_TILE.Empty)];
    const session = {
      state: {
        engine: createEngineState(cells),
        internal: {
          chipZ: 1,
          traps: [],
          portableTools: {
            primedToolDrop: {
              tileId: MS_TILE.Sandbag,
              pos: 1,
              z: 1,
            },
          },
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

    expectOverlayPresent(frame.tileOverlays, {
      z: 1,
      pos: 1,
      kind: "carried-tool",
      tileId: MS_TILE.Sandbag,
    });
    expect(
      frame.tileOverlays.find((overlay) => overlay.kind === "carried-tool" && overlay.pos === 1)?.render,
    ).toEqual({
      mode: "tile",
      tileId: MS_TILE.Sandbag,
      artworkSpriteId: "sandbag",
      alpha: 0.25,
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
          visual: expect.objectContaining({
            kind: "creature",
            tileId: MS_TILE.Blob,
          }),
        }),
        expect.objectContaining({
          id: MS_TILE.Block,
          pos: 1,
          dir: MS_DIRECTION.south,
          hidden: false,
          visual: expect.objectContaining({
            kind: "creature",
            tileId: MS_TILE.Block,
          }),
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
          visual: expect.objectContaining({
            kind: "creature",
            tileId: MS_TILE.Ball,
          }),
        }),
        expect.objectContaining({
          id: MS_TILE.Block,
          pos: 1,
          dir: MS_DIRECTION.south,
          hidden: false,
          decorations: expect.arrayContaining([
            expect.objectContaining({
              kind: "support-marker",
              floorTileId: MS_TILE.CloneMachine,
            }),
          ]),
        }),
      ]),
    );
  });

  it("projects bowling ball visuals from stateful actor runtime kind", () => {
    const cells = [createCell(0, MS_TILE.Empty)];
    const runtimeActors = createStatefulActorRuntimeStore();
    setStatefulActorRuntime(runtimeActors, {
      actorSerial: 17,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });
    const session = {
      state: {
        engine: createEngineState(cells),
        internal: {
          chipZ: 1,
          traps: [],
          statefulActors: runtimeActors,
          creatures: [
            {
              serial: 17,
              id: MS_TILE.Ball,
              pos: 0,
              z: 1,
              dir: MS_DIRECTION.east,
              moving: 0,
              frame: 0,
              hidden: false,
            },
          ],
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

    expect(frame.render?.actors[0]?.visual).toMatchObject({
      kind: "creature",
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_moving",
    });
  });
});
