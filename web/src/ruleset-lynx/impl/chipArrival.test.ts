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
      trapEntered: 32,
      chipWins: 64,
    },
    resolveButtonEffects: () => 0,
    applyThiefHook: () => false,
    collectItemSound: () => 0,
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
    expect(context.state.soundEffects & 64).not.toBe(0);
  });
});
