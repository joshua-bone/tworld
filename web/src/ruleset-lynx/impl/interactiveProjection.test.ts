import { describe, expect, it } from "vitest";
import type { EngineState } from "@game-core/api/model";
import { createPetCarrierState } from "@game-core/impl/petCarrier";
import { createStatefulActorRuntimeStore, setStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { expectOverlayPresent } from "@game-core/impl/testOverlays";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { createCell, createEngineState } from "@ruleset-lynx/impl/testSupport";

describe("projectLynxInteractiveFrame", () => {
  it("marks held-button beartraps as visually open in the projected frame only", () => {
    const cells = [createCell(0, MS_TILE.Button_Brown), createCell(1, MS_TILE.Beartrap)];
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [{ from: 0, to: 1 }],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: createEngineState(cells),
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 2,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 8,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [
        {
          serial: 1,
          id: MS_TILE.Block,
          pos: 0,
          z: 1,
          dir: 0,
          intentDir: 0,
          forcedDir: 0,
          teleported: false,
          moving: 0,
          frame: 0,
          hidden: false,
          pushed: false,
          deferPush: false,
          deferPushArmed: false,
          reversePending: false,
          dormant: false,
          animationReserved: false,
        },
      ],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expect(frame.cells[1]?.top.state & LYNX_CELL_FLAG.TrapOpen).not.toBe(0);
    expect(session.state.map.cells[1]?.top.state & LYNX_CELL_FLAG.TrapOpen).toBe(0);
  });

  it("does not mutate the previous projected trap cell when a held-open render state appears", () => {
    const cells = [createCell(0, MS_TILE.Button_Brown), createCell(1, MS_TILE.Beartrap)];
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [{ from: 0, to: 1 }],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;

    const previousSession = {
      level,
      state: createEngineState(cells),
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 2,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 8,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;
    const previousFrame = projectLynxInteractiveFrame(previousSession, "tick");

    const nextSession = {
      ...previousSession,
      lastInput: {
        tick: 1,
        inputCode: 0,
        inputName: "none",
      },
      actors: [
        {
          serial: 1,
          id: MS_TILE.Block,
          pos: 0,
          z: 1,
          dir: 0,
          intentDir: 0,
          forcedDir: 0,
          teleported: false,
          moving: 0,
          frame: 0,
          hidden: false,
          pushed: false,
          deferPush: false,
          deferPushArmed: false,
          reversePending: false,
          dormant: false,
          animationReserved: false,
        },
      ],
    } as unknown as LynxInteractiveSessionState;

    const nextFrame = projectLynxInteractiveFrame(nextSession, "tick", previousFrame);

    expect(previousFrame.cells[1]?.top.state & LYNX_CELL_FLAG.TrapOpen).toBe(0);
    expect(nextFrame.cells[1]?.top.state & LYNX_CELL_FLAG.TrapOpen).not.toBe(0);
    expect(nextFrame.cells[1]).not.toBe(previousFrame.cells[1]);
  });

  it("projects hidden-wall reveal overlays from runtime state", () => {
    const cells = [createCell(0, MS_TILE.Empty), createCell(1, MS_TILE.HiddenWall_Perm)];
    const engine = createEngineState(cells) as EngineState & {
      lynxRuntimeState?: {
        visuals?: {
          animations: [];
          tileOverlays?: Array<{
            z: number;
            pos: number;
            kind: "hidden-wall-reveal";
            ttl: number;
          }>;
        };
        chipRuntime?: {
          chipTeleported: boolean;
        };
        portableTools?: {
          primedToolDrop?: { tileId: number; pos: number; z: number } | null;
        };
      };
    };
    engine.lynxRuntimeState = {
      visuals: {
        animations: [],
        tileOverlays: [{ z: 1, pos: 1, kind: "hidden-wall-reveal", ttl: 10 }],
      },
      portableTools: {
        primedToolDrop: null,
      },
      chipRuntime: {
        chipTeleported: false,
      },
    };
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: engine,
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 0,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 0,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expectOverlayPresent(frame.tileOverlays, {
      z: 1,
      pos: 1,
      kind: "hidden-wall-reveal",
    });
  });

  it("projects blue-wall reveal overlays from runtime state", () => {
    const cells = [createCell(0, MS_TILE.Empty), createCell(1, MS_TILE.BlueWall_Real)];
    const engine = createEngineState(cells) as EngineState & {
      lynxRuntimeState?: {
        visuals?: {
          animations: [];
          tileOverlays?: Array<{
            z: number;
            pos: number;
            kind: "blue-wall-reveal";
            ttl: number;
          }>;
        };
        chipRuntime?: {
          chipTeleported: boolean;
        };
        portableTools?: {
          primedToolDrop?: { tileId: number; pos: number; z: number } | null;
        };
      };
    };
    engine.lynxRuntimeState = {
      visuals: {
        animations: [],
        tileOverlays: [{ z: 1, pos: 1, kind: "blue-wall-reveal", ttl: 0x7fff_ffff }],
      },
      portableTools: {
        primedToolDrop: null,
      },
      chipRuntime: {
        chipTeleported: false,
      },
    };
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: engine,
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 0,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 0,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expectOverlayPresent(frame.tileOverlays, {
      z: 1,
      pos: 1,
      kind: "blue-wall-reveal",
    });
  });

  it("marks sandbag-held beartraps as visually open in the projected frame only", () => {
    const cells = [createCell(0, MS_TILE.Sandbag, MS_TILE.Button_Brown), createCell(1, MS_TILE.Beartrap)];
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [{ from: 0, to: 1 }],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: createEngineState(cells),
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 2,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 8,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expect(frame.cells[1]?.top.state & LYNX_CELL_FLAG.TrapOpen).not.toBe(0);
    expect(session.state.map.cells[1]?.top.state & LYNX_CELL_FLAG.TrapOpen).toBe(0);
  });

  it("projects carried tool overlays from runtime state", () => {
    const cells = [createCell(0, MS_TILE.Empty), createCell(1, MS_TILE.Empty)];
    const engine = createEngineState(cells) as EngineState & {
      lynxRuntimeState?: {
        visuals?: {
          animations: [];
          tileOverlays?: Array<{
            z: number;
            pos: number;
            kind: "hidden-wall-reveal";
            ttl: number;
          }>;
        };
        chipRuntime?: {
          chipTeleported: boolean;
        };
        portableTools?: {
          primedToolDrop?: { tileId: number; pos: number; z: number } | null;
        };
      };
    };
    engine.lynxRuntimeState = {
      visuals: {
        animations: [],
        tileOverlays: [],
      },
      portableTools: {
        primedToolDrop: { tileId: MS_TILE.Sandbag, pos: 1, z: 1 },
      },
      chipRuntime: {
        chipTeleported: false,
      },
    };
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: engine,
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 0,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 0,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

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

  it("projects chip and actor visual descriptors for renderer consumers", () => {
    const cells = [createCell(0, MS_TILE.Wall_South), createCell(1, MS_TILE.CloneMachine)];
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: createEngineState(cells),
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 0,
      chipZ: 1,
      chipDir: MS_DIRECTION.east,
      chipMoving: 4,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: true,
      actors: [
        {
          serial: 1,
          id: MS_TILE.Block,
          pos: 0,
          z: 1,
          dir: MS_DIRECTION.east,
          moving: 0,
          frame: 0,
          hidden: false,
          animationReserved: false,
        },
      ],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expect(frame.render?.chip?.visual).toMatchObject({
      kind: "creature",
      tileId: MS_TILE.Pushing_Chip,
      dir: MS_DIRECTION.east,
    });
    expect(frame.render?.actors[0]).toMatchObject({
      visual: {
        kind: "creature",
        tileId: MS_TILE.Block,
        dir: MS_DIRECTION.east,
      },
      decorations: expect.arrayContaining([
        expect.objectContaining({
          kind: "thin-wall-overlay",
          tileId: MS_TILE.Wall_South,
        }),
      ]),
    });
  });

  it("projects bowling ball visuals from stateful actor runtime kind", () => {
    const cells = [createCell(0, MS_TILE.Empty)];
    const engine = createEngineState(cells) as EngineState & {
      lynxRuntimeState?: {
        visuals?: {
          animations: [];
          tileOverlays?: [];
        };
        chipRuntime?: {
          chipTeleported: boolean;
        };
        portableTools?: {
          primedToolDrop?: null;
        };
        statefulActors?: ReturnType<typeof createStatefulActorRuntimeStore>;
      };
    };
    engine.lynxRuntimeState = {
      visuals: {
        animations: [],
        tileOverlays: [],
      },
      portableTools: {
        primedToolDrop: null,
      },
      chipRuntime: {
        chipTeleported: false,
      },
      statefulActors: createStatefulActorRuntimeStore(),
    };
    setStatefulActorRuntime(engine.lynxRuntimeState.statefulActors!, {
      actorSerial: 17,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: engine,
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 1,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 0,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [
        {
          serial: 17,
          id: MS_TILE.Ball,
          pos: 0,
          z: 1,
          dir: MS_DIRECTION.east,
          moving: 0,
          frame: 0,
          hidden: false,
          animationReserved: false,
        },
      ],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expect(frame.render?.actors[0]?.visual).toMatchObject({
      kind: "creature",
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_moving",
    });
  });

  it("uses the chip's current z-layer cells even when state.map.cells is stale", () => {
    const lower = [createCell(0, MS_TILE.Cloud)];
    const upper = [createCell(0, MS_TILE.Air)];
    const engine = createEngineState(lower);
    const layers = [
      { z: 1, cells: lower, traps: [], cloners: [], creaturePositions: [], hintText: "" },
      { z: 2, cells: upper, traps: [], cloners: [], creaturePositions: [], hintText: "" },
    ] satisfies NonNullable<LynxLevel["layers"]>;
    engine.map.layers = layers;
    engine.map.cells = lower;
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells: lower,
      layers,
      traps: [],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: engine,
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 0,
      chipZ: 2,
      chipDir: 0,
      chipMoving: 0,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expect(frame.currentZ).toBe(2);
    expect(frame.cells[0]?.top.id).toBe(MS_TILE.Air);
    expect(frame.visibleLayers[1]?.cells[0]?.top.id).toBe(MS_TILE.Cloud);
  });

  it("projects occupied pet carrier render state for mapped cells and carried inventory", () => {
    const cells = [createCell(0, MS_TILE.PetCarrier, MS_TILE.Dirt)];
    const engine = createEngineState(cells) as EngineState & {
      lynxRuntimeState?: unknown;
    };
    engine.inventory.tools = [MS_TILE.PetCarrier];
    engine.lynxRuntimeState = {
      visuals: {
        animations: [],
        tileOverlays: [],
      },
      portableTools: {
        portableItems: [
          {
            serial: 1,
            family: "pet-carrier",
            tileId: MS_TILE.PetCarrier,
            inventorySlot: "tools",
            petCarrierState: createPetCarrierState({
              occupant: {
                actorId: MS_TILE.IceBlock,
                dir: MS_DIRECTION.west,
              },
            }),
            state: {
              mode: "map",
              pos: 0,
              z: 1,
            },
          },
          {
            serial: 2,
            family: "pet-carrier",
            tileId: MS_TILE.PetCarrier,
            inventorySlot: "tools",
            petCarrierState: createPetCarrierState({
              occupant: {
                actorId: MS_TILE.Bug,
                dir: MS_DIRECTION.south,
              },
            }),
            state: {
              mode: "carried",
            },
          },
        ],
        nextPortableItemSerial: 3,
        primedToolDrop: null,
      },
      chipRuntime: {
        chipTeleported: false,
      },
      statefulActors: createStatefulActorRuntimeStore(),
    };
    const level = {
      number: 1,
      timeLimitTicks: 0,
      chipsNeeded: 0,
      hintText: "",
      cells,
      traps: [],
      cloners: [],
      creaturePositions: [],
      statusFlags: 0,
    } satisfies LynxLevel;
    const session = {
      level,
      state: engine,
      lastInput: {
        tick: 0,
        inputCode: 0,
        inputName: "none",
      },
      recordedMoves: [],
      replayPlan: null,
      chipPos: 1,
      chipZ: 1,
      chipDir: 0,
      chipMoving: 0,
      chipMoveKind: "planar",
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      chipPushing: false,
      actors: [],
      endGameTicksElapsed: null,
      endGameResult: null,
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    } as unknown as LynxInteractiveSessionState;

    const frame = projectLynxInteractiveFrame(session, "tick");

    expect(
      frame.tileOverlays.find((overlay) => overlay.kind === "portable-item-state" && overlay.pos === 0)?.render,
    ).toEqual({
      mode: "tile",
      tileId: MS_TILE.PetCarrier,
      artworkSpriteId: "pet_carrier",
      alpha: 1,
      petCarrierRender: {
        baseTileId: MS_TILE.Dirt,
        occupant: {
          kind: "creature",
          tileId: MS_TILE.IceBlock,
          artworkSpriteId: "ice_block",
          dir: MS_DIRECTION.west,
          moving: 0,
          frame: 0,
        },
      },
    });
    expect(frame.inventoryRender?.tools?.[0]).toEqual({
      mode: "tile",
      tileId: MS_TILE.PetCarrier,
      artworkSpriteId: "pet_carrier",
      alpha: 1,
      petCarrierRender: {
        baseTileId: MS_TILE.Empty,
        occupant: {
          kind: "creature",
          tileId: MS_TILE.Bug,
          dir: MS_DIRECTION.south,
          moving: 0,
          frame: 0,
        },
      },
    });
  });
});
