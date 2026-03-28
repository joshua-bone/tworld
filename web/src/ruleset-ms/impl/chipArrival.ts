import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { popBoardTile } from "@game-core/impl/board";
import {
  actorInventoryClearBoots,
  actorInventoryHasBoot,
  actorInventoryUseKey,
} from "@game-core/impl/actorLocalInventory";
import { MS_FLOOR_STATE, MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msChipEnterAction,
  msDoorKeyIndex,
  msIsActorTile,
} from "@ruleset-ms/impl/catalog";
import { collectMsActorTile, projectMsActorInventoryOwner } from "@ruleset-ms/impl/actorCollections";
import {
  clearMsToolInventory,
  queueMsToolInventoryReplacement,
  type MsPortableToolStateStore,
} from "@ruleset-ms/impl/portableItems";

export interface MsChipEntryState {
  chipStatus: "okay" | "drowned" | "burned" | "bombed" | "outoftime" | "collided";
}

export interface MsChipEntryContext {
  inventory: EngineState["inventory"];
  portableTools: MsPortableToolStateStore;
  runtimeCellZ(pos: number): number;
}

export interface MsChipEnteredTileResolution {
  enteredTeleport: boolean;
  soundEffects: number;
  floorTileBeforeMove: EngineMapCell["top"];
  movementFloorTile: EngineMapCell["top"];
}

export function applyMsChipEnterEffects(
  cells: EngineMapCell[],
  chip: MsChipEntryState,
  context: MsChipEntryContext,
  nextPos: number,
): MsChipEnteredTileResolution {
  const nextCell = cells[nextPos]!;
  let floorTileBeforeMove = nextCell.top;
  let movementFloorTile = floorTileBeforeMove;
  const floor = floorTileBeforeMove.id;
  const chipInventory = projectMsActorInventoryOwner(MS_TILE.Chip, context.inventory);
  let enteredTeleport = false;
  let soundEffects = 0;

  switch (msChipEnterAction(floor)) {
    case "clear-floor":
      popBoardTile(cells, nextPos, MS_TILE.Empty);
      break;
    case "collect-chip":
      if (collectMsActorTile(MS_TILE.Chip, context.inventory, floor).collected) {
        popBoardTile(cells, nextPos, MS_TILE.Empty);
        soundEffects |= 1 << MS_SOUND.IcCollected;
      }
      break;
    case "popup-wall":
      if (nextCell.top.id === MS_TILE.Empty) {
        popBoardTile(cells, nextPos, MS_TILE.Empty);
      } else {
        floorTileBeforeMove.id = MS_TILE.Wall;
      }
      break;
    case "open-door": {
      const index = msDoorKeyIndex(floor);
      if (index !== null) {
        actorInventoryUseKey(chipInventory, index, { consume: floor !== MS_TILE.Door_Green });
      }
      popBoardTile(cells, nextPos, MS_TILE.Empty);
      soundEffects |= 1 << MS_SOUND.DoorOpened;
      break;
    }
    case "collect-item": {
      const collected = collectMsActorTile(MS_TILE.Chip, context.inventory, floor);
      if (collected.collected) {
        if (collected.slot === "tools") {
          queueMsToolInventoryReplacement(
            context.portableTools,
            context.inventory,
            floor,
            nextPos,
            context.runtimeCellZ(nextPos),
          );
        }
        popBoardTile(cells, nextPos, MS_TILE.Empty);
        if (collected.slot === "tools") {
          movementFloorTile = nextCell.top;
        }
        soundEffects |= 1 << MS_SOUND.ItemCollected;
      }
      break;
    }
    case "open-socket":
      popBoardTile(cells, nextPos, MS_TILE.Empty);
      soundEffects |= 1 << MS_SOUND.SocketOpened;
      break;
    case "steal-boots":
      actorInventoryClearBoots(chipInventory);
      clearMsToolInventory(context.portableTools, context.inventory);
      soundEffects |= 1 << MS_SOUND.BootsStolen;
      break;
    case "explode-bomb":
      chip.chipStatus = "bombed";
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      break;
    case "water-death":
      if (!actorInventoryHasBoot(chipInventory, 3)) {
        chip.chipStatus = "drowned";
      }
      break;
    case "fire-death":
      if (!actorInventoryHasBoot(chipInventory, 2)) {
        chip.chipStatus = "burned";
      }
      break;
    case "teleport":
      if ((floorTileBeforeMove.state & MS_FLOOR_STATE.Broken) === 0) {
        enteredTeleport = true;
      }
      break;
    case "collision":
      if (msIsActorTile(floor)) {
        chip.chipStatus = "collided";
      }
      break;
    case "none":
      break;
  }

  return {
    enteredTeleport,
    soundEffects,
    floorTileBeforeMove,
    movementFloorTile,
  };
}
