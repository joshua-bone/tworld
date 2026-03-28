import type { EngineState } from "@game-core/api/model";
import {
  collectActorChipProgress,
  collectActorInventoryItem,
  type ActorItemCollectionResolution,
} from "@game-core/impl/actorCollection";
import {
  createActorInventoryOwnerId,
  projectActorLocalInventoryOwner,
  type ActorKeysBootsInventory,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorGlobalProgressKind,
  lynxActorItemCollectionKind,
  lynxActorLocalInventoryMode,
  lynxInventoryIndex,
  lynxInventorySlot,
} from "@ruleset-lynx/impl/catalog";

export type LynxActorInventoryProjection = Pick<EngineState["inventory"], "keys" | "boots" | "tools">;
export type LynxActorProgressProjection = Pick<EngineState["inventory"], "chipsNeeded">;
export type LynxActorInventoryState = LynxActorInventoryProjection & LynxActorProgressProjection;
export type LynxActorLocalInventoryState = ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null;

export interface LynxActorTileCollectionResolution extends ActorItemCollectionResolution {
  collectedChip: boolean;
}

export function projectLynxActorInventoryOwner(
  actorId: number,
  inventory: LynxActorInventoryProjection,
  localInventory: LynxActorLocalInventoryState = null,
): ActorLocalInventoryOwner {
  const projectedInventory = actorId === MS_TILE.Chip ? inventory : localInventory;
  return projectActorLocalInventoryOwner(createActorInventoryOwnerId("lynx", actorId), lynxActorLocalInventoryMode(actorId), projectedInventory);
}

export function collectLynxActorTile(
  actorId: number,
  inventory: LynxActorInventoryState,
  tileId: number,
  localInventory: LynxActorLocalInventoryState = null,
): LynxActorTileCollectionResolution {
  if (tileId === MS_TILE.ICChip) {
    const collectedChip = collectActorChipProgress(inventory, lynxActorGlobalProgressKind(actorId));
    return {
      collected: collectedChip,
      collectedChip,
      slot: null,
      index: null,
    };
  }

  const slot = lynxInventorySlot(tileId);
  const index = lynxInventoryIndex(tileId);
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
      projectLynxActorInventoryOwner(actorId, inventory, localInventory),
      lynxActorItemCollectionKind(actorId),
      slot,
      index,
    ),
    collectedChip: false,
  };
}
