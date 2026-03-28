import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { ACTOR_INTERACTION_TARGET_KIND } from "@game-core/api/actorInteractions";
import { actorFloorImpactTeleports, applyActorFloorImpactAction } from "@game-core/impl/floorImpact";
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
} from "@ruleset-ms/impl/catalog";
import { msActorInteractionOutcome, msActorThiefOutcome } from "@ruleset-ms/impl/actorInteractions";
import { collectMsActorTile, projectMsActorInventoryOwner } from "@ruleset-ms/impl/actorCollections";
import { msFloorImpactAction } from "@ruleset-ms/impl/floorImpactPolicy";
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
  const floorImpactAction = msFloorImpactAction(msChipEnterAction(floor));
  if (floorImpactAction === "destroy-bomb") {
    chip.chipStatus = "bombed";
    soundEffects |= 1 << MS_SOUND.BombExplodes;
  } else if (floorImpactAction === "destroy-water") {
    if (!actorInventoryHasBoot(chipInventory, 3)) {
      chip.chipStatus = "drowned";
    }
  } else if (floorImpactAction === "destroy-fire") {
    if (!actorInventoryHasBoot(chipInventory, 2)) {
      chip.chipStatus = "burned";
    }
  } else if (floorImpactAction !== null && actorFloorImpactTeleports(floorImpactAction)) {
    if ((floorTileBeforeMove.state & MS_FLOOR_STATE.Broken) === 0) {
      enteredTeleport = true;
    }
  } else if (floorImpactAction !== null) {
    soundEffects |= applyActorFloorImpactAction(floorImpactAction, {
      clearFloor: () => {
        popBoardTile(cells, nextPos, MS_TILE.Empty);
      },
      popupWall: () => {
        if (nextCell.top.id === MS_TILE.Empty) {
          popBoardTile(cells, nextPos, MS_TILE.Empty);
          return;
        }
        floorTileBeforeMove.id = MS_TILE.Wall;
      },
      collectTile: () => collectMsActorTile(MS_TILE.Chip, context.inventory, floor),
      afterCollect: (collected) => {
        if (collected.slot !== "tools") {
          return;
        }
        queueMsToolInventoryReplacement(
          context.portableTools,
          context.inventory,
          floor,
          nextPos,
          context.runtimeCellZ(nextPos),
        );
        movementFloorTile = nextCell.top;
      },
      tryOpenDoor: () => {
        const index = msDoorKeyIndex(floor);
        return index !== null && actorInventoryUseKey(chipInventory, index, { consume: floor !== MS_TILE.Door_Green });
      },
      tryOpenSocket: () => true,
      clearBootsAndTools: () => {
        if (msActorThiefOutcome(MS_TILE.Chip) !== "steal-boots-tools") {
          return false;
        }
        actorInventoryClearBoots(chipInventory);
        clearMsToolInventory(context.portableTools, context.inventory);
        return true;
      },
      soundEffects: {
        doorOpened: 1 << MS_SOUND.DoorOpened,
        socketOpened: 1 << MS_SOUND.SocketOpened,
        bootsStolen: 1 << MS_SOUND.BootsStolen,
        itemCollected: 1 << MS_SOUND.ItemCollected,
        icCollected: 1 << MS_SOUND.IcCollected,
        wallCreated: 0,
      },
    }).soundEffects;
  } else {
    switch (msChipEnterAction(floor)) {
    case "collision":
      if (
        msActorInteractionOutcome(MS_TILE.Chip, {
          kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
          actorId: floor,
          tileId: floor,
        }).chipFails
      ) {
        chip.chipStatus = "collided";
      }
      break;
    case "none":
      break;
    case "explode-bomb":
    case "water-death":
    case "fire-death":
    case "teleport":
      break;
    }
  }

  return {
    enteredTeleport,
    soundEffects,
    floorTileBeforeMove,
    movementFloorTile,
  };
}
