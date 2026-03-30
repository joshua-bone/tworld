import { describe, expect, it } from "vitest";
import {
  applyCompletedLynxChipMove,
  applyLynxChipArrivalEffects,
  type LynxCompletedChipMoveContext,
} from "@ruleset-lynx/impl/chipArrival";
import { createBoardAtZ, createCell, createEngineState } from "@ruleset-lynx/impl/testSupport";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createContext(overrides: Partial<LynxCompletedChipMoveContext> = {}): LynxCompletedChipMoveContext {
  const cells = createBoardAtZ(1);
  const state = createEngineState(cells);
  return {
    state,
    soundBits: {
      doorOpened: 1,
      socketOpened: 2,
      tileEmptied: 4,
      wallCreated: 8,
      bootsStolen: 16,
      itemCollected: 32,
      icCollected: 64,
      trapEntered: 128,
      chipWins: 256,
    },
    resolveButtonEffects: () => 0,
    applyThiefHook: () => false,
    queueCollectedTool: () => {},
    springTrap: () => {},
    hasBoot: () => false,
    applyIceWallTurn: (dir) => dir,
    failChip: (chipPos, _chipDir, endGameTicksElapsed, endGameResult, endGameAnimationTileId, endGameAnimationFrame) => ({
      chipPos,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    }),
    startCompletedEndGame: (endGameTicksElapsed, _endGameResult, _endGameAnimationTileId, _endGameAnimationFrame) => ({
      endGameTicksElapsed: endGameTicksElapsed ?? 0,
      endGameResult: "completed",
      endGameAnimationTileId: null,
      endGameAnimationFrame: null,
    }),
    ...overrides,
  };
}

describe("lynx chip arrival", () => {
  it("opens green doors without consuming the green key", () => {
    const context = createContext();
    context.state.inventory.keys[3] = 1;
    context.state.map.cells[34] = createCell(34, MS_TILE.Door_Green, MS_TILE.Empty);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(1);
    expect(context.state.inventory.keys[3]).toBe(1);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Empty);
  });

  it("starts completed endgame flow when chip reaches the exit", () => {
    const context = createContext();
    context.state.map.cells[34] = createCell(34, MS_TILE.Exit, MS_TILE.Empty);

    const completed = applyCompletedLynxChipMove(context, 34, MS_DIRECTION.east, "planar", null, null, null, null);

    expect(completed.endGameResult).toBe("completed");
    expect(completed.endGameTicksElapsed).toBe(0);
    expect(context.state.soundEffects & 256).not.toBe(0);
  });

  it("opens sockets when the chip requirement is already satisfied", () => {
    const context = createContext();
    context.state.map.cells[34] = createCell(34, MS_TILE.Socket, MS_TILE.Empty);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(2);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Empty);
  });

  it("clears fake blue walls through the concrete tile behavior seam", () => {
    const context = createContext();
    context.state.map.cells[34] = createCell(34, MS_TILE.BlueWall_Fake, MS_TILE.Empty);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(4);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Empty);
  });

  it("leaves sockets closed when chips are still needed", () => {
    const context = createContext();
    context.state.inventory.chipsNeeded = 1;
    context.state.map.cells[34] = createCell(34, MS_TILE.Socket, MS_TILE.Empty);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("none");
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Socket);
  });

  it("collects tools and queues portable replacement from chip arrival", () => {
    const queued: Array<{ pos: number; tileId: number }> = [];
    const context = createContext({
      queueCollectedTool: (pos, tileId) => {
        queued.push({ pos, tileId });
      },
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.Hook, MS_TILE.Empty);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(32);
    expect(queued).toEqual([{ pos: 34, tileId: MS_TILE.Hook }]);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Empty);
  });

  it("queues bowling-ball portable pickup through the same chip arrival seam", () => {
    const queued: Array<{ pos: number; tileId: number }> = [];
    const context = createContext({
      queueCollectedTool: (pos, tileId) => {
        queued.push({ pos, tileId });
      },
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.BowlingBall_Still, MS_TILE.Empty);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(32);
    expect(queued).toEqual([{ pos: 34, tileId: MS_TILE.BowlingBall_Still }]);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Empty);
  });

  it("collects a portable item and then resolves the revealed lower popup wall", () => {
    const queued: Array<{ pos: number; tileId: number }> = [];
    const context = createContext({
      queueCollectedTool: (pos, tileId) => {
        queued.push({ pos, tileId });
      },
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.BowlingBall_Still, MS_TILE.PopupWall);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(40);
    expect(queued).toEqual([{ pos: 34, tileId: MS_TILE.BowlingBall_Still }]);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Wall);
  });

  it("does not immediately resolve a revealed lower ice floor after collecting a portable item", () => {
    const queued: Array<{ pos: number; tileId: number }> = [];
    const context = createContext({
      queueCollectedTool: (pos, tileId) => {
        queued.push({ pos, tileId });
      },
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.BowlingBall_Still, MS_TILE.Ice);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(32);
    expect(queued).toEqual([{ pos: 34, tileId: MS_TILE.BowlingBall_Still }]);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Ice);
  });

  it("does not immediately resolve a revealed lower IC chip after collecting a non-portable pickup", () => {
    const context = createContext();
    context.state.inventory.chipsNeeded = 3;
    context.state.map.cells[34] = createCell(34, MS_TILE.Key_Red, MS_TILE.ICChip);

    const arrival = applyLynxChipArrivalEffects(context, 34);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(32);
    expect(context.state.inventory.keys[0]).toBe(1);
    expect(context.state.inventory.chipsNeeded).toBe(3);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.ICChip);
    expect(context.state.map.cells[34]?.bottom.id).toBe(MS_TILE.Empty);
  });

  it("drowns Chip after collecting a portable item that reveals water", () => {
    const context = createContext();
    context.state.map.cells[34] = createCell(34, MS_TILE.Sandbag, MS_TILE.Water);

    const completed = applyCompletedLynxChipMove(context, 34, MS_DIRECTION.east, "planar", null, null, null, null);

    expect(completed.chipPos).toBe(34);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Water);
  });

  it("drowns Chip on direct water through the complete-enter tile seam", () => {
    let failureReason: string | null = null;
    const context = createContext({
      failChip: (
        chipPos,
        _chipDir,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
        reason,
      ) => {
        failureReason = reason;
        return {
          chipPos,
          endGameTicksElapsed,
          endGameResult,
          endGameAnimationTileId,
          endGameAnimationFrame,
        };
      },
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.Water, MS_TILE.Empty);

    applyCompletedLynxChipMove(context, 34, MS_DIRECTION.east, "planar", null, null, null, null);

    expect(failureReason).toBe("drowned");
  });

  it("burns Chip on direct fire through the complete-enter tile seam", () => {
    let failureReason: string | null = null;
    const context = createContext({
      failChip: (
        chipPos,
        _chipDir,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
        reason,
      ) => {
        failureReason = reason;
        return {
          chipPos,
          endGameTicksElapsed,
          endGameResult,
          endGameAnimationTileId,
          endGameAnimationFrame,
        };
      },
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.Fire, MS_TILE.Empty);

    applyCompletedLynxChipMove(context, 34, MS_DIRECTION.east, "planar", null, null, null, null);

    expect(failureReason).toBe("burned");
  });

  it("bombs Chip after collecting a portable item that reveals a bomb", () => {
    const context = createContext();
    context.state.map.cells[34] = createCell(34, MS_TILE.Hook, MS_TILE.Bomb);

    const completed = applyCompletedLynxChipMove(context, 34, MS_DIRECTION.east, "planar", null, null, null, null);

    expect(completed.chipPos).toBe(34);
    expect(context.state.map.cells[34]?.top.id).toBe(MS_TILE.Empty);
  });
});
