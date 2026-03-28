import type { EngineState } from "@game-core/api/model";
import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import { mapHash } from "@game-core/impl/hash";
import { actorInventoryUseKey } from "@game-core/impl/actorLocalInventory";
import {
  completedArrival,
  noArrival,
  resolvedArrival,
  type ArrivalResult,
} from "@game-core/api/movementOutcomes";
import {
  lynxButtonAction,
  lynxChipEnterAction,
  lynxDoorKeyIndex,
  lynxTileForcedFloorKind,
} from "@ruleset-lynx/impl/catalog";
import { projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
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
    trapEntered: number;
    chipWins: number;
  };
  resolveButtonEffects(pos: number, tileId: number): number;
  applyThiefHook(): boolean;
  collectItemSound(pos: number): number;
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
    "state" | "soundBits" | "resolveButtonEffects" | "applyThiefHook"
  >,
  pos: number,
): ArrivalResult {
  const chipInventory = projectLynxActorInventoryOwner(MS_TILE.Chip, context.state.inventory);
  const cell = context.state.map.cells[pos];
  if (!cell) {
    return noArrival();
  }

  const keyIndex = lynxDoorKeyIndex(cell.top.id);
  if (keyIndex !== null && actorInventoryUseKey(chipInventory, keyIndex, { consume: keyIndex !== 3 })) {
    promoteBottomTile(context.state.map.cells, pos, MS_TILE.Empty);
    context.state.map.hash = mapHash(context.state.map.cells);
    return resolvedArrival(context.soundBits.doorOpened);
  }

  switch (lynxChipEnterAction(cell.top.id)) {
    case "open-socket":
      if (context.state.inventory.chipsNeeded === 0) {
        promoteBottomTile(context.state.map.cells, pos, MS_TILE.Empty);
        context.state.map.hash = mapHash(context.state.map.cells);
        return resolvedArrival(context.soundBits.socketOpened);
      }
      break;
    case "clear-floor":
      replaceTopTile(context.state.map.cells, pos, { ...cell.top, id: MS_TILE.Empty });
      context.state.map.hash = mapHash(context.state.map.cells);
      return resolvedArrival(context.soundBits.tileEmptied);
    case "popup-wall":
      replaceTopTile(context.state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
      context.state.map.hash = mapHash(context.state.map.cells);
      return resolvedArrival(context.soundBits.wallCreated);
    case "steal-boots":
      return context.applyThiefHook() ? resolvedArrival(context.soundBits.bootsStolen) : noArrival();
    case "button":
      return resolvedArrival(context.resolveButtonEffects(pos, cell.top.id));
    case "trap":
      return resolvedArrival(context.soundBits.trapEntered);
    case "exit":
      return completedArrival(context.soundBits.chipWins);
  }

  return noArrival();
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

  context.state.soundEffects |= context.collectItemSound(chipPos);
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
