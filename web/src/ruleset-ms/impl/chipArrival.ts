import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { popBoardTile } from "@game-core/impl/board";
import { actorCollectionAllowsSlot, actorCollectsChips } from "@game-core/api/actorCapabilities";
import {
  actorInventoryClearBoots,
  actorInventoryCollectIndexedItem,
  actorInventoryHasBoot,
  actorInventoryUseKey,
  createKeysBootsToolsActorLocalInventoryOwner,
  createNoActorLocalInventoryOwner,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import { MS_FLOOR_STATE, MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorGlobalProgressKind,
  msActorItemCollectionKind,
  msActorLocalInventoryMode,
  msChipEnterAction,
  msDoorKeyIndex,
  msInventoryIndex,
  msInventorySlot,
  msIsActorTile,
} from "@ruleset-ms/impl/catalog";
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

function msChipInventoryOwner(
  inventory: Pick<EngineState["inventory"], "keys" | "boots" | "tools">,
): ActorLocalInventoryOwner {
  return msActorLocalInventoryMode(MS_TILE.Chip) === "keys-boots-tools"
    ? createKeysBootsToolsActorLocalInventoryOwner("chip", inventory as ActorKeysBootsToolsInventory)
    : createNoActorLocalInventoryOwner("chip");
}

export function resolveMsChipEnteredTile(
  cells: EngineMapCell[],
  chip: MsChipEntryState,
  context: MsChipEntryContext,
  nextPos: number,
): MsChipEnteredTileResolution {
  const nextCell = cells[nextPos]!;
  let floorTileBeforeMove = nextCell.top;
  let movementFloorTile = floorTileBeforeMove;
  const floor = floorTileBeforeMove.id;
  const chipInventory = msChipInventoryOwner(context.inventory);
  const chipItemCollectionKind = msActorItemCollectionKind(MS_TILE.Chip);
  const chipGlobalProgressKind = msActorGlobalProgressKind(MS_TILE.Chip);
  let enteredTeleport = false;
  let soundEffects = 0;

  switch (msChipEnterAction(floor)) {
    case "clear-floor":
      popBoardTile(cells, nextPos, MS_TILE.Empty);
      break;
    case "collect-chip":
      if (actorCollectsChips(chipGlobalProgressKind)) {
        context.inventory.chipsNeeded = Math.max(0, context.inventory.chipsNeeded - 1);
      }
      popBoardTile(cells, nextPos, MS_TILE.Empty);
      soundEffects |= 1 << MS_SOUND.IcCollected;
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
      const slot = msInventorySlot(floor);
      const index = msInventoryIndex(floor);
      if (slot !== null && index !== null && actorCollectionAllowsSlot(chipItemCollectionKind, slot)) {
        if (slot === "tools") {
          queueMsToolInventoryReplacement(
            context.portableTools,
            context.inventory,
            floor,
            nextPos,
            context.runtimeCellZ(nextPos),
          );
        } else {
          actorInventoryCollectIndexedItem(chipInventory, slot, index);
        }
        popBoardTile(cells, nextPos, MS_TILE.Empty);
        if (slot === "tools") {
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
