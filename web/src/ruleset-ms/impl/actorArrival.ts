import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { applyActorFloorImpactAction } from "@game-core/impl/floorImpact";
import {
  actorInventoryClearBoots,
  actorInventoryClearTools,
  actorInventoryHasBoot,
  actorInventoryUseKey,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import type { ActorArrivalOutcome } from "@game-core/api/actorInteractions";
import { MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msChipEnterAction,
  msDoorKeyIndex,
} from "@ruleset-ms/impl/catalog";
import { collectMsActorTile } from "@ruleset-ms/impl/actorCollections";
import { msActorArrivalOutcome } from "@ruleset-ms/impl/actorInteractions";
import { applyMsConcreteTileActorArrivalEffects } from "@ruleset-ms/impl/elements/tiles/concrete/registration";
import { msFloorImpactAction } from "@ruleset-ms/impl/floorImpactPolicy";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";

export interface MsActorArrivalContext {
  inventory: EngineState["inventory"];
  inventoryOwner: ActorLocalInventoryOwner;
  runtimeEntry: MsStatefulActorRuntimeEntry | null;
}

function standingFloorTile(cell: EngineMapCell): EngineMapCell["bottom"] {
  return cell.bottom;
}

export function canMsActorEnterTile(
  floorId: number,
  actorId: number,
  inventory: Pick<EngineState["inventory"], "chipsNeeded">,
  inventoryOwner: ActorLocalInventoryOwner,
): boolean {
  void actorId;
  if (floorId === MS_TILE.Socket) {
    return inventory.chipsNeeded === 0;
  }

  const doorKeyIndex = msDoorKeyIndex(floorId);
  if (doorKeyIndex !== null) {
    return actorInventoryUseKey(inventoryOwner, doorKeyIndex, { consume: false });
  }
  return true;
}

export function msRuntimeActorArrivalOutcome(
  floorId: number,
  actorId: number,
  inventoryOwner: ActorLocalInventoryOwner,
): ActorArrivalOutcome {
  if (floorId === MS_TILE.Water && actorInventoryHasBoot(inventoryOwner, 3)) {
    return "none";
  }
  if (floorId === MS_TILE.Fire && actorInventoryHasBoot(inventoryOwner, 2)) {
    return "none";
  }
  return msActorArrivalOutcome(floorId, actorId);
}

export function applyMsActorArrivalEffects(
  cells: EngineMapCell[],
  actorId: number,
  pos: number,
  context: MsActorArrivalContext,
): number {
  const cell = cells[pos];
  if (!cell) {
    return 0;
  }

  const floorTile = standingFloorTile(cell);
  const floorId = floorTile.id;
  const concreteSoundEffects = applyMsConcreteTileActorArrivalEffects(cells, pos, floorId);
  if (concreteSoundEffects !== null) {
    return concreteSoundEffects;
  }
  const floorImpactAction = msFloorImpactAction(msChipEnterAction(floorId));
  if (floorImpactAction === null) {
    return 0;
  }

  return applyActorFloorImpactAction(floorImpactAction, {
    clearFloor: () => {
      floorTile.id = MS_TILE.Empty;
      floorTile.state = 0;
    },
    popupWall: () => {
      floorTile.id = MS_TILE.Wall;
      floorTile.state = 0;
    },
    collectTile: () =>
      collectMsActorTile(actorId, context.inventory, floorId, {
        actorSerial: context.runtimeEntry?.actorSerial,
        runtimeEntry: context.runtimeEntry,
      }),
    tryOpenDoor: () => {
      const keyIndex = msDoorKeyIndex(floorId);
      return keyIndex !== null && actorInventoryUseKey(context.inventoryOwner, keyIndex, { consume: floorId !== MS_TILE.Door_Green });
    },
    tryOpenSocket: () => context.inventory.chipsNeeded === 0,
    clearBootsAndTools: () => {
      actorInventoryClearBoots(context.inventoryOwner);
      actorInventoryClearTools(context.inventoryOwner);
    },
    soundEffects: {
      doorOpened: 1 << MS_SOUND.DoorOpened,
      socketOpened: 1 << MS_SOUND.SocketOpened,
      bootsStolen: 1 << MS_SOUND.BootsStolen,
      itemCollected: 1 << MS_SOUND.ItemCollected,
      icCollected: 1 << MS_SOUND.IcCollected,
    },
  }).soundEffects;
}
