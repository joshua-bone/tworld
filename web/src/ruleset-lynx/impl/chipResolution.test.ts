import { describe, expect, it, vi } from "vitest";
import { createBoardAtZ, createCell, createEngineState, pos } from "@ruleset-lynx/impl/testSupport";
import {
  advanceLynxChipTrapRelease,
  finalizeLynxTickBookkeeping,
  resolveLynxPostChipMovement,
  type LynxPostMoveResolutionContext,
  type LynxTickBookkeepingContext,
  type LynxTrapReleaseContext,
} from "@ruleset-lynx/impl/chipResolution";
import { MS_DIRECTION, MS_STATUS_FLAG, MS_TILE } from "@ruleset-ms/api/tiles";

function createPostMoveContext(overrides: Partial<LynxPostMoveResolutionContext> = {}): LynxPostMoveResolutionContext {
  const cells = createBoardAtZ(1);
  const state = createEngineState(cells);
  return {
    state,
    resolveCompletedMove: (
      chipPos,
      chipDir,
      _chipMoveKind,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    ) => ({
      chipPos,
      chipDir,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    }),
    chipMovementSpeed: () => 4,
    springTrap: () => {},
    resolveTeleports: (chipPos) => chipPos,
    clearDeferredBlockPushes: () => {},
    ...overrides,
  };
}

function createTrapReleaseContext(overrides: Partial<LynxTrapReleaseContext> = {}): LynxTrapReleaseContext {
  const cells = createBoardAtZ(1);
  const state = createEngineState(cells);
  return {
    state,
    markTrapReleaseCantMove: () => {},
    addCantMove: () => {},
    findTargetBlock: () => false,
    probeTargetCell: () => ({ status: "blocked" }),
    targetCellAllowsPush: () => false,
    targetCellAllowsEntry: () => false,
    tryPushBlock: () => false,
    canEnterAfterPushingBlock: () => false,
    revealHiddenWall: () => false,
    settlePrimedToolDrop: () => {},
    activeLayerZ: () => 1,
    chipMovementSpeed: () => 4,
    resolveCompletedMove: (
      chipPos,
      chipDir,
      _chipMoveKind,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    ) => ({
      chipPos,
      chipDir,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    }),
    ...overrides,
  };
}

function createTickBookkeepingContext(overrides: Partial<LynxTickBookkeepingContext> = {}): LynxTickBookkeepingContext {
  const cells = createBoardAtZ(1);
  const state = createEngineState(cells);
  return {
    state,
    soundBits: {
      fireWalking: 1,
      waterWalking: 2,
      iceWalking: 4,
      skatingForward: 8,
      skatingTurn: 16,
      slideWalking: 32,
      sliding: 64,
    },
    hasBoot: () => false,
    resetFloorSounds: () => {},
    updateViewFromMovement: () => {},
    finalizeEndGame: (endGameTicksElapsed, endGameResult) => ({ endGameTicksElapsed, endGameResult }),
    ...overrides,
  };
}

describe("lynx chipResolution", () => {
  it("springs brown-button traps after stationary post-move resolution", () => {
    const chipPos = pos(1, 1);
    const springTrap = vi.fn();
    const clearDeferredBlockPushes = vi.fn();
    const context = createPostMoveContext({ springTrap, clearDeferredBlockPushes });
    context.state.map.cells[chipPos] = createCell(chipPos, MS_TILE.Button_Brown);

    const result = resolveLynxPostChipMovement(context, chipPos, MS_DIRECTION.east, 0, "planar", null, null, null, null);

    expect(result.chipPos).toBe(chipPos);
    expect(springTrap).toHaveBeenCalledWith(chipPos);
    expect(clearDeferredBlockPushes).toHaveBeenCalledTimes(1);
  });

  it("marks trap-release movement blocked when Chip cannot leave a trap", () => {
    const chipPos = pos(1, 1);
    const markTrapReleaseCantMove = vi.fn();
    const addCantMove = vi.fn();
    const settlePrimedToolDrop = vi.fn();
    const context = createTrapReleaseContext({ markTrapReleaseCantMove, addCantMove, settlePrimedToolDrop });
    context.state.map.cells[chipPos] = createCell(chipPos, MS_TILE.Beartrap);

    const result = advanceLynxChipTrapRelease(context, chipPos, MS_DIRECTION.east, 0, null, null, null, null);

    expect(result.chipPos).toBe(chipPos);
    expect(result.chipMoving).toBe(0);
    expect(markTrapReleaseCantMove).toHaveBeenCalledTimes(1);
    expect(addCantMove).toHaveBeenCalledTimes(1);
    expect(settlePrimedToolDrop).not.toHaveBeenCalled();
  });

  it("shows hint text while stationary on hint tiles during tick bookkeeping", () => {
    const chipPos = pos(1, 1);
    const updateViewFromMovement = vi.fn();
    const finalizeEndGame = vi.fn((endGameTicksElapsed: number | null, endGameResult: "completed" | "failed" | null) => ({
      endGameTicksElapsed,
      endGameResult,
    }));
    const context = createTickBookkeepingContext({ updateViewFromMovement, finalizeEndGame });
    context.state.map.cells[chipPos] = createCell(chipPos, MS_TILE.HintButton);

    const result = finalizeLynxTickBookkeeping(context, chipPos, MS_DIRECTION.south, 0, "planar", null, null);

    expect(result).toEqual({ endGameTicksElapsed: null, endGameResult: null });
    expect(updateViewFromMovement).toHaveBeenCalledWith(chipPos, MS_DIRECTION.south, 0, "planar");
    expect(finalizeEndGame).toHaveBeenCalledWith(null, null);
    expect(context.state.statusFlags & MS_STATUS_FLAG.ShowHint).toBe(MS_STATUS_FLAG.ShowHint);
  });
});
