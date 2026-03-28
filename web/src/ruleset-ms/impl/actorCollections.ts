import type { EngineState } from "@game-core/api/model";
import {
  collectActorChipProgress,
  collectActorInventoryItem,
  type ActorItemCollectionResolution,
} from "@game-core/impl/actorCollection";
import {
  projectActorLocalInventoryOwner,
  type ActorKeysBootsInventory,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorGlobalProgressKind,
  msActorItemCollectionKind,
  msActorLocalInventoryMode,
  msInventoryIndex,
  msInventorySlot,
} from "@ruleset-ms/impl/catalog";

export type MsActorInventoryProjection = Pick<EngineState["inventory"], "keys" | "boots" | "tools">;
export type MsActorProgressProjection = Pick<EngineState["inventory"], "chipsNeeded">;
export type MsActorInventoryState = MsActorInventoryProjection & MsActorProgressProjection;
export type MsActorLocalInventoryState = ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null;

export interface MsActorTileCollectionResolution extends ActorItemCollectionResolution {
  collectedChip: boolean;
}

export function projectMsActorInventoryOwner(
  actorId: number,
  inventory: MsActorInventoryProjection,
  localInventory: MsActorLocalInventoryState = null,
): ActorLocalInventoryOwner {
  const projectedInventory = actorId === MS_TILE.Chip ? inventory : localInventory;
  return projectActorLocalInventoryOwner(`ms:${actorId}`, msActorLocalInventoryMode(actorId), projectedInventory);
}

export function collectMsActorTile(
  actorId: number,
  inventory: MsActorInventoryState,
  tileId: number,
  localInventory: MsActorLocalInventoryState = null,
): MsActorTileCollectionResolution {
  if (tileId === MS_TILE.ICChip) {
    const collectedChip = collectActorChipProgress(inventory, msActorGlobalProgressKind(actorId));
    return {
      collected: collectedChip,
      collectedChip,
      slot: null,
      index: null,
    };
  }

  const slot = msInventorySlot(tileId);
  const index = msInventoryIndex(tileId);
  if (slot === null || index === null) {
    return {
      collected: false,
      collectedChip: false,
      slot: null,
      index: null,
    };
  }

  return {
    ...collectActorInventoryItem(
      projectMsActorInventoryOwner(actorId, inventory, localInventory),
      msActorItemCollectionKind(actorId),
      slot,
      index,
    ),
    collectedChip: false,
  };
}
