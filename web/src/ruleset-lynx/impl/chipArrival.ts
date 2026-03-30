import type { EngineState } from "@game-core/api/model";
import {
  completedArrival,
  noArrival,
  resolvedArrival,
  type ArrivalResult,
} from "@game-core/api/movementOutcomes";
import {
  lynxButtonAction,
  lynxTileForcedFloorKind,
} from "@ruleset-lynx/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { type LynxChipEnterTileBehaviorContext } from "@ruleset-lynx/impl/chipEnterBehavior";
import { type LynxChipFinishEnterTileBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/concrete/registration";
import { lookupLynxTileLifecyclePhase } from "@ruleset-lynx/impl/tileLifecycleRegistration";
import type {
  LynxEndGameResult,
  LynxEndGameState,
} from "@ruleset-lynx/impl/turnState";
import type { LynxMoveKind } from "@ruleset-lynx/impl/verticalMovement";

export interface LynxCompletedChipMoveContext {
  state: EngineState;
  soundBits: {
    doorOpened: number;
    socketOpened: number;
    tileEmptied: number;
    wallCreated: number;
    bootsStolen: number;
    itemCollected: number;
    icCollected: number;
    trapEntered: number;
    chipWins: number;
  };
  resolveButtonEffects(pos: number, tileId: number): number;
  applyThiefHook(): boolean;
  queueCollectedTool(pos: number, tileId: number): void;
  springTrap(pos: number): void;
  hasBoot(tileId: number): boolean;
  applyIceWallTurn(dir: number, floorId: number): number;
  failChip(
    chipPos: number,
    chipDir: number,
    endGameTicksElapsed: number | null,
    endGameResult: LynxEndGameResult | null,
    endGameAnimationTileId: number | null,
    endGameAnimationFrame: number | null,
    reason: "drowned" | "burned" | "bombed",
  ): LynxEndGameState & { chipPos: number };
  startCompletedEndGame(
    endGameTicksElapsed: number | null,
    endGameResult: LynxEndGameResult | null,
    endGameAnimationTileId: number | null,
    endGameAnimationFrame: number | null,
  ): LynxEndGameState;
}

function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
}

export function applyLynxChipArrivalEffects(
  context: Pick<
    LynxCompletedChipMoveContext,
    "state" | "soundBits" | "resolveButtonEffects" | "applyThiefHook" | "queueCollectedTool"
  >,
  pos: number,
): ArrivalResult {
  let soundEffects = 0;
  let resolved = false;
  let completed = false;

  for (let depth = 0; depth < 8; depth += 1) {
    const cell = context.state.map.cells[pos];
    if (!cell) {
      break;
    }

    const enteredTileId = cell.top.id;
    const topStateBeforeResolution = cell.top.state;
    let continueIntoRevealedLowerTile = false;
    const beginEnter = lookupLynxTileLifecyclePhase(enteredTileId, "begin-enter");
    if (beginEnter === null) {
      break;
    }
    const behaviorContext: LynxChipEnterTileBehaviorContext = {
      phase: "begin-enter",
      tileId: enteredTileId,
      actorId: MS_TILE.Chip,
      runtime: context,
      pos,
      soundEffects,
      resolved,
      completed,
      continueIntoRevealedLowerTile,
    };
    beginEnter(behaviorContext);
    soundEffects = behaviorContext.soundEffects;
    resolved = behaviorContext.resolved;
    completed = behaviorContext.completed;
    continueIntoRevealedLowerTile = behaviorContext.continueIntoRevealedLowerTile;
    if (
      completed ||
      !continueIntoRevealedLowerTile ||
      (cell.top.id === enteredTileId && cell.top.state === topStateBeforeResolution)
    ) {
      break;
    }
  }

  if (completed) {
    return completedArrival(soundEffects);
  }
  if (resolved) {
    return resolvedArrival(soundEffects);
  }
  return noArrival(soundEffects);
}

export function applyCompletedLynxChipMove(
  context: LynxCompletedChipMoveContext,
  chipPos: number,
  chipDir: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
): LynxEndGameState & { chipPos: number; chipDir: number } {
  const arrival = applyLynxChipArrivalEffects(context, chipPos);
  context.state.soundEffects |= arrival.soundEffects;
  if (arrival.status === "completed" && endGameTicksElapsed === null) {
    const endGame = context.startCompletedEndGame(
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    );
    endGameTicksElapsed = endGame.endGameTicksElapsed;
    endGameResult = endGame.endGameResult;
    endGameAnimationTileId = endGame.endGameAnimationTileId;
    endGameAnimationFrame = endGame.endGameAnimationFrame;
  }

  const resolvedFloorAfterMove = context.state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
  const finishEnter = lookupLynxTileLifecyclePhase(resolvedFloorAfterMove, "complete-enter");
  if (finishEnter !== null) {
    const behaviorContext: LynxChipFinishEnterTileBehaviorContext = {
      phase: "complete-enter",
      tileId: resolvedFloorAfterMove,
      actorId: MS_TILE.Chip,
      runtime: context,
      chipPos,
      chipDir,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
      finished: false,
    };
    finishEnter(behaviorContext);
    chipPos = behaviorContext.chipPos;
    endGameTicksElapsed = behaviorContext.endGameTicksElapsed;
    endGameResult = behaviorContext.endGameResult;
    endGameAnimationTileId = behaviorContext.endGameAnimationTileId;
    endGameAnimationFrame = behaviorContext.endGameAnimationFrame;
    if (behaviorContext.finished) {
      return {
        chipPos,
        chipDir,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      };
    }
  }

  if (lynxButtonAction(resolvedFloorAfterMove) === "spring-trap") {
    context.springTrap(chipPos);
  }
  if (isLynxIce(resolvedFloorAfterMove)) {
    chipDir = chipMoveKind === "air" ? chipDir : context.applyIceWallTurn(chipDir, resolvedFloorAfterMove);
  }

  return {
    chipPos,
    chipDir,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  };
}
