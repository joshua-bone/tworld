import type { EngineState } from "@game-core/api/model";
import { topTileIdOr } from "@game-core/impl/board";
import { canAdvancePosition, nextPosition } from "@game-core/impl/grid";
import { mapHash } from "@game-core/impl/hash";
import { advanceTimer, syncTimerSecondsPlayed } from "@game-core/impl/timer";
import { lynxButtonAction, lynxChipMoveSoundAction, lynxTileHasTag } from "@ruleset-lynx/impl/catalog";
import type {
  LynxEndGameResult,
  LynxEndGameState,
  LynxPostMoveResolution,
} from "@ruleset-lynx/impl/turnState";
import type { LynxMoveKind } from "@ruleset-lynx/impl/verticalMovement";
import { MS_DIRECTION, MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_STATUS_FLAG, MS_TICKS_PER_SECOND, MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxPostMoveResolutionContext {
  state: EngineState;
  applyCompletedMove(
    chipPos: number,
    chipDir: number,
    chipMoveKind: LynxMoveKind,
    endGameTicksElapsed: number | null,
    endGameResult: LynxEndGameResult | null,
    endGameAnimationTileId: number | null,
    endGameAnimationFrame: number | null,
  ): LynxEndGameState & { chipPos: number; chipDir: number };
  chipMovementSpeed(floorId: number, moveKind?: LynxMoveKind): number;
  springTrap(pos: number): void;
  resolveTeleports(chipPos: number, chipDir: number, chipMoving: number): number;
  clearDeferredBlockPushes(): void;
}

export interface LynxTrapReleaseProbe {
  status: "blocked" | "enter" | "push-only";
}

export interface LynxTrapReleaseContext {
  state: EngineState;
  markTrapReleaseCantMove(): void;
  addCantMove(): void;
  findTargetBlock(targetPos: number): boolean;
  probeTargetCell(targetPos: number, dir: number, claimedCell: boolean): LynxTrapReleaseProbe;
  targetCellAllowsPush(probe: LynxTrapReleaseProbe): boolean;
  targetCellAllowsEntry(probe: LynxTrapReleaseProbe): boolean;
  tryPushBlock(targetPos: number, dir: number): boolean;
  canEnterAfterPushingBlock(targetPos: number, dir: number, probe: LynxTrapReleaseProbe): boolean;
  revealHiddenWall(targetPos: number): boolean;
  settlePrimedToolDrop(originPos: number, originZ: number): void;
  activeLayerZ(): number;
  chipMovementSpeed(floorId: number, moveKind?: LynxMoveKind): number;
  applyCompletedMove(
    chipPos: number,
    chipDir: number,
    chipMoveKind: LynxMoveKind,
    endGameTicksElapsed: number | null,
    endGameResult: LynxEndGameResult | null,
    endGameAnimationTileId: number | null,
    endGameAnimationFrame: number | null,
  ): LynxEndGameState & { chipPos: number; chipDir: number };
}

export interface LynxTickBookkeepingContext {
  state: EngineState;
  soundBits: {
    fireWalking: number;
    waterWalking: number;
    iceWalking: number;
    skatingForward: number;
    skatingTurn: number;
    slideWalking: number;
    sliding: number;
  };
  hasBoot(tileId: number): boolean;
  resetFloorSounds(): void;
  updateViewFromMovement(
    chipPos: number,
    chipDir: number,
    chipMoving: number,
    chipMoveKind: LynxMoveKind,
  ): void;
  finalizeEndGame(
    endGameTicksElapsed: number | null,
    endGameResult: LynxEndGameResult | null,
  ): Pick<LynxEndGameState, "endGameTicksElapsed" | "endGameResult">;
}

export function resolveLynxPostChipMovement(
  context: LynxPostMoveResolutionContext,
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
): LynxPostMoveResolution {
  let chipArrivedThisTick = false;
  if (chipMoving > 0) {
    const floor = topTileIdOr(context.state.map.cells, chipPos, MS_TILE.Empty);
    const speed = context.chipMovementSpeed(floor, chipMoveKind);

    chipMoving = Math.max(0, chipMoving - speed);
    if (chipMoving === 0) {
      chipArrivedThisTick = true;
      const completed = context.applyCompletedMove(
        chipPos,
        chipDir,
        chipMoveKind,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      );
      chipPos = completed.chipPos;
      chipDir = completed.chipDir;
      chipMoveKind = "planar";
      endGameTicksElapsed = completed.endGameTicksElapsed;
      endGameResult = completed.endGameResult;
      endGameAnimationTileId = completed.endGameAnimationTileId;
      endGameAnimationFrame = completed.endGameAnimationFrame;
    }
  }

  if (
    !chipArrivedThisTick &&
    chipMoving === 0 &&
    lynxButtonAction(topTileIdOr(context.state.map.cells, chipPos, MS_TILE.Empty)) === "spring-trap"
  ) {
    context.springTrap(chipPos);
  }

  chipPos = context.resolveTeleports(chipPos, chipDir, chipMoving);
  context.clearDeferredBlockPushes();
  context.state.map.hash = mapHash(context.state.map.cells);

  return {
    chipPos,
    chipDir,
    chipMoving,
    chipMoveKind,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  };
}

export function advanceLynxChipTrapRelease(
  context: LynxTrapReleaseContext,
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
): {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
  if (!lynxTileHasTag(topTileIdOr(context.state.map.cells, chipPos, MS_TILE.Empty), "trap") || chipDir === MS_DIRECTION.none) {
    return {
      chipPos,
      chipDir,
      chipMoving,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  if (chipMoving <= 0) {
    if (!canAdvancePosition(chipPos, chipDir, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
      context.markTrapReleaseCantMove();
      context.addCantMove();
      return {
        chipPos,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      };
    }

    const targetPos = nextPosition(chipPos, chipDir, MS_GRID_WIDTH);
    const target = context.state.map.cells[targetPos];
    const targetHasBlock = target !== undefined && context.findTargetBlock(targetPos);
    const targetEntryProbe = context.probeTargetCell(targetPos, chipDir, targetHasBlock);
    const pushedBlock =
      targetHasBlock && context.targetCellAllowsPush(targetEntryProbe)
        ? context.tryPushBlock(targetPos, chipDir)
        : false;
    const canEnterTarget =
      !!target &&
      (targetHasBlock
        ? pushedBlock && context.canEnterAfterPushingBlock(targetPos, chipDir, targetEntryProbe)
        : context.revealHiddenWall(targetPos)
          ? false
          : context.targetCellAllowsEntry(targetEntryProbe));

    if (!canEnterTarget) {
      context.markTrapReleaseCantMove();
      context.addCantMove();
      return {
        chipPos,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      };
    }

    context.settlePrimedToolDrop(chipPos, context.activeLayerZ());
    chipPos = targetPos;
    chipMoving = 8;
  }

  const floor = topTileIdOr(context.state.map.cells, chipPos, MS_TILE.Empty);
  const speed = context.chipMovementSpeed(floor);
  chipMoving = Math.max(0, chipMoving - speed);
  if (chipMoving === 0) {
    const completed = context.applyCompletedMove(
      chipPos,
      chipDir,
      "planar",
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    );
    chipPos = completed.chipPos;
    chipDir = completed.chipDir;
    endGameTicksElapsed = completed.endGameTicksElapsed;
    endGameResult = completed.endGameResult;
    endGameAnimationTileId = completed.endGameAnimationTileId;
    endGameAnimationFrame = completed.endGameAnimationFrame;
  }

  return {
    chipPos,
    chipDir,
    chipMoving,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  };
}

export function finalizeLynxTickBookkeeping(
  context: LynxTickBookkeepingContext,
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
): Pick<LynxEndGameState, "endGameTicksElapsed" | "endGameResult"> {
  context.state.timer = advanceTimer(context.state.timer, 1, MS_TICKS_PER_SECOND);
  context.updateViewFromMovement(chipPos, chipDir, chipMoving, chipMoveKind);
  const displayFloor = topTileIdOr(context.state.map.cells, chipPos, MS_TILE.Empty);
  if (lynxTileHasTag(displayFloor, "hint") && chipMoving === 0) {
    context.state.statusFlags |= MS_STATUS_FLAG.ShowHint;
  } else {
    context.state.statusFlags &= ~MS_STATUS_FLAG.ShowHint;
  }

  if (chipMoving > 0) {
    context.resetFloorSounds();
    switch (
      lynxChipMoveSoundAction(displayFloor, {
        hasFireBoots: context.hasBoot(MS_TILE.Boots_Fire),
        hasWaterBoots: context.hasBoot(MS_TILE.Boots_Water),
        hasIceBoots: context.hasBoot(MS_TILE.Boots_Ice),
        hasSlideBoots: context.hasBoot(MS_TILE.Boots_Slide),
      })
    ) {
      case "fire-walk":
        context.state.soundEffects |= context.soundBits.fireWalking;
        break;
      case "water-walk":
        context.state.soundEffects |= context.soundBits.waterWalking;
        break;
      case "ice-walk":
        context.state.soundEffects |= context.soundBits.iceWalking;
        break;
      case "skate-forward":
        context.state.soundEffects |= context.soundBits.skatingForward;
        break;
      case "skate-turn":
        context.state.soundEffects |= context.soundBits.skatingTurn;
        break;
      case "slide-walk":
        context.state.soundEffects |= context.soundBits.slideWalking;
        break;
      case "slide":
        context.state.soundEffects |= context.soundBits.sliding;
        break;
    }
  }

  const finalizedEndGame = context.finalizeEndGame(endGameTicksElapsed, endGameResult);
  context.state.timer = syncTimerSecondsPlayed(context.state.timer, MS_TICKS_PER_SECOND);
  context.state.map.hash = mapHash(context.state.map.cells);
  return finalizedEndGame;
}
