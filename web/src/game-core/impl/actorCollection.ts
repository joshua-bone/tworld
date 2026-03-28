import type {
  ActorCollectibleSlot,
  ActorGlobalProgressKind,
  ActorItemCollectionKind,
} from "@game-core/api/actorCapabilities";
import { actorCollectionAllowsSlot, actorCollectsChips } from "@game-core/api/actorCapabilities";
import { actorInventoryCollectIndexedItem, type ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";

export interface ActorGlobalProgressState {
  chipsNeeded: number;
}

export interface ActorItemCollectionResolution {
  collected: boolean;
  slot: ActorCollectibleSlot | null;
  index: number | null;
}

export function collectActorChipProgress(
  progress: ActorGlobalProgressState,
  globalProgressKind: ActorGlobalProgressKind,
): boolean {
  if (!actorCollectsChips(globalProgressKind)) {
    return false;
  }

  progress.chipsNeeded = Math.max(0, progress.chipsNeeded - 1);
  return true;
}

export function collectActorInventoryItem(
  owner: ActorLocalInventoryOwner,
  itemCollectionKind: ActorItemCollectionKind,
  slot: ActorCollectibleSlot,
  index: number,
): ActorItemCollectionResolution {
  if (!actorCollectionAllowsSlot(itemCollectionKind, slot)) {
    return {
      collected: false,
      slot: null,
      index: null,
    };
  }

  if (slot === "tools") {
    return owner.mode === "keys-boots-tools"
      ? {
          collected: true,
          slot,
          index,
        }
      : {
          collected: false,
          slot: null,
          index: null,
        };
  }

  return actorInventoryCollectIndexedItem(owner, slot, index)
    ? {
        collected: true,
        slot,
        index,
      }
    : {
        collected: false,
        slot: null,
        index: null,
      };
}
