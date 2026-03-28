import type { EngineState } from "@game-core/api/model";
import { applyActorFloorImpactAction } from "@game-core/impl/floorImpact";
import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import { mapHash } from "@game-core/impl/hash";
import { actorInventoryUseKey } from "@game-core/impl/actorLocalInventory";
import {
  noArrival,
  type ArrivalResult,
} from "@game-core/api/movementOutcomes";
import {
  lynxButtonAction,
  lynxChipEnterAction,
  lynxDoorKeyIndex,
  lynxTileForcedFloorKind,
} from "@ruleset-lynx/impl/catalog";
import { collectLynxActorTile, projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
import { lynxFloorImpactAction } from "@ruleset-lynx/impl/floorImpactPolicy";
import { MS_TILE } from "@ruleset-ms/api/tiles";
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
  const chipInventory = projectLynxActorInventoryOwner(MS_TILE.Chip, context.state.inventory);
  const cell = context.state.map.cells[pos];
  if (!cell) {
    return noArrival();
  }

  const enteredTileId = cell.top.id;
  const floorImpactAction = lynxFloorImpactAction(lynxChipEnterAction(cell.top.id));
  if (floorImpactAction === null) {
    return noArrival();
  }

  const arrival = applyActorFloorImpactAction(floorImpactAction, {
    clearFloor: () => {
      replaceTopTile(context.state.map.cells, pos, { ...cell.top, id: MS_TILE.Empty });
      context.state.map.hash = mapHash(context.state.map.cells);
    },
    consumeEnteredOverlay: () => {
      promoteBottomTile(context.state.map.cells, pos, MS_TILE.Empty);
      context.state.map.hash = mapHash(context.state.map.cells);
    },
    popupWall: () => {
      replaceTopTile(context.state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
      context.state.map.hash = mapHash(context.state.map.cells);
    },
    collectTile: () => collectLynxActorTile(MS_TILE.Chip, context.state.inventory, cell.top.id),
    afterCollect: (resolution) => {
      if (resolution.slot === "tools") {
        context.queueCollectedTool(pos, enteredTileId);
      }
    },
    tryOpenDoor: () => {
      const keyIndex = lynxDoorKeyIndex(cell.top.id);
      return keyIndex !== null && actorInventoryUseKey(chipInventory, keyIndex, { consume: keyIndex !== 3 });
    },
    tryOpenSocket: () => context.state.inventory.chipsNeeded === 0,
    clearBootsAndTools: () => context.applyThiefHook(),
    resolveButtonEffects: () => context.resolveButtonEffects(pos, cell.top.id),
    soundEffects: context.soundBits,
  });
  return arrival;
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
  const floorAfterMove = context.state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;

  switch (lynxChipEnterAction(floorAfterMove)) {
    case "water-death":
      if (!context.hasBoot(MS_TILE.Boots_Water)) {
        return {
          chipDir,
          ...context.failChip(
            chipPos,
            chipDir,
            endGameTicksElapsed,
            endGameResult,
            endGameAnimationTileId,
            endGameAnimationFrame,
            "drowned",
          ),
        };
      }
      break;
    case "fire-death":
      if (!context.hasBoot(MS_TILE.Boots_Fire)) {
        return {
          chipDir,
          ...context.failChip(
            chipPos,
            chipDir,
            endGameTicksElapsed,
            endGameResult,
            endGameAnimationTileId,
            endGameAnimationFrame,
            "burned",
          ),
        };
      }
      break;
    case "explode-bomb":
      promoteBottomTile(context.state.map.cells, chipPos, MS_TILE.Empty);
      context.state.map.hash = mapHash(context.state.map.cells);
      return {
        chipDir,
        ...context.failChip(
          chipPos,
          chipDir,
          endGameTicksElapsed,
          endGameResult,
          endGameAnimationTileId,
          endGameAnimationFrame,
          "bombed",
        ),
      };
  }

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
  if (lynxButtonAction(floorAfterMove) === "spring-trap") {
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
