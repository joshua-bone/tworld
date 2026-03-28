import type { EngineState } from "@game-core/api/model";
import type { ActorArrivalOutcome } from "@game-core/api/actorInteractions";
import { actorInventoryClearBoots, actorInventoryClearTools, actorInventoryHasBoot, actorInventoryUseKey, type ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { mapHash } from "@game-core/impl/hash";
import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { lynxChipEnterAction, lynxDoorKeyIndex } from "@ruleset-lynx/impl/catalog";
import { collectLynxActorTile } from "@ruleset-lynx/impl/actorCollections";
import { lynxActorArrivalOutcome } from "@ruleset-lynx/impl/actorInteractions";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";

export interface LynxActorArrivalContext {
  state: EngineState;
  inventoryOwner: ActorLocalInventoryOwner;
  runtimeEntry: LynxStatefulActorRuntimeEntry | null;
  soundBits: {
    doorOpened: number;
    socketOpened: number;
    tileEmptied: number;
    wallCreated: number;
    bootsStolen: number;
    itemCollected: number;
    icCollected: number;
  };
  resolveButtonEffects(pos: number, tileId: number): number;
}

export function canLynxActorEnterTile(
  floorId: number,
  inventory: Pick<EngineState["inventory"], "chipsNeeded">,
  inventoryOwner: ActorLocalInventoryOwner,
): boolean {
  if (floorId === MS_TILE.Socket) {
    return inventory.chipsNeeded === 0;
  }

  const keyIndex = lynxDoorKeyIndex(floorId);
  if (keyIndex !== null) {
    return actorInventoryUseKey(inventoryOwner, keyIndex, { consume: false });
  }
  return true;
}

export function lynxRuntimeActorArrivalOutcome(
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
  return lynxActorArrivalOutcome(floorId, actorId);
}

export function applyLynxActorArrivalEffects(
  context: LynxActorArrivalContext,
  actorId: number,
  pos: number,
): number {
  const cell = context.state.map.cells[pos];
  if (!cell) {
    return 0;
  }

  const keyIndex = lynxDoorKeyIndex(cell.top.id);
  if (keyIndex !== null && actorInventoryUseKey(context.inventoryOwner, keyIndex, { consume: keyIndex !== 3 })) {
    promoteBottomTile(context.state.map.cells, pos, MS_TILE.Empty);
    context.state.map.hash = mapHash(context.state.map.cells);
    return context.soundBits.doorOpened;
  }

  switch (lynxChipEnterAction(cell.top.id)) {
    case "open-socket":
      if (context.state.inventory.chipsNeeded === 0) {
        promoteBottomTile(context.state.map.cells, pos, MS_TILE.Empty);
        context.state.map.hash = mapHash(context.state.map.cells);
        return context.soundBits.socketOpened;
      }
      break;
    case "clear-floor":
      replaceTopTile(context.state.map.cells, pos, { ...cell.top, id: MS_TILE.Empty });
      context.state.map.hash = mapHash(context.state.map.cells);
      return context.soundBits.tileEmptied;
    case "popup-wall":
      replaceTopTile(context.state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
      context.state.map.hash = mapHash(context.state.map.cells);
      return context.soundBits.wallCreated;
    case "collect-chip": {
      const collected = collectLynxActorTile(actorId, context.state.inventory, cell.top.id, {
        actorSerial: context.runtimeEntry?.actorSerial,
        runtimeEntry: context.runtimeEntry,
      });
      if (collected.collected) {
        promoteBottomTile(context.state.map.cells, pos, MS_TILE.Empty);
        context.state.map.hash = mapHash(context.state.map.cells);
        return collected.collectedChip ? context.soundBits.icCollected : context.soundBits.itemCollected;
      }
      break;
    }
    case "collect-item": {
      const collected = collectLynxActorTile(actorId, context.state.inventory, cell.top.id, {
        actorSerial: context.runtimeEntry?.actorSerial,
        runtimeEntry: context.runtimeEntry,
      });
      if (collected.collected) {
        promoteBottomTile(context.state.map.cells, pos, MS_TILE.Empty);
        context.state.map.hash = mapHash(context.state.map.cells);
        return context.soundBits.itemCollected;
      }
      break;
    }
    case "steal-boots":
      actorInventoryClearBoots(context.inventoryOwner);
      actorInventoryClearTools(context.inventoryOwner);
      return context.soundBits.bootsStolen;
    default:
      break;
  }

  return 0;
}
