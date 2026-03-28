import { describe, expect, it } from "vitest";
import type { EngineState } from "@game-core/api/model";
import { expectOverlayPresent } from "@game-core/impl/testOverlays";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import { MS_TILE } from "@ruleset-ms/api/tiles";
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
  });
});
