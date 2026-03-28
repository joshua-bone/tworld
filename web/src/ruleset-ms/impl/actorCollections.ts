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
import {
  projectStatefulActorLocalInventoryOwner,
  type StatefulActorInventoryEntry,
  type StatefulActorLocalInventoryState,
} from "@game-core/impl/statefulActorLocalInventory";
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
export type MsActorRuntimeInventoryEntry = StatefulActorInventoryEntry<string, StatefulActorLocalInventoryState>;

export interface MsActorTileCollectionResolution extends ActorItemCollectionResolution {
  collectedChip: boolean;
}

export interface MsActorInventoryOwnerOptions {
  actorSerial?: number;
  localInventory?: MsActorLocalInventoryState;
  runtimeEntry?: MsActorRuntimeInventoryEntry | null;
}

export function projectMsActorInventoryOwner(
  actorId: number,
  inventory: MsActorInventoryProjection,
  options: MsActorInventoryOwnerOptions = {},
): ActorLocalInventoryOwner {
  if (actorId === MS_TILE.Chip) {
    return projectActorLocalInventoryOwner(createActorInventoryOwnerId("ms", actorId), msActorLocalInventoryMode(actorId), inventory);
  }

  if (options.actorSerial !== undefined && options.runtimeEntry) {
    return projectStatefulActorLocalInventoryOwner(
      "ms-actor",
      options.actorSerial,
      msActorLocalInventoryMode(actorId),
      options.runtimeEntry,
    );
  }

  return projectActorLocalInventoryOwner(
    createActorInventoryOwnerId("ms", actorId),
    msActorLocalInventoryMode(actorId),
    options.localInventory ?? null,
  );
}

export function collectMsActorTile(
  actorId: number,
  inventory: MsActorInventoryState,
  tileId: number,
  options: MsActorInventoryOwnerOptions = {},
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
      projectMsActorInventoryOwner(actorId, inventory, options),
      msActorItemCollectionKind(actorId),
      slot,
      index,
    ),
    collectedChip: false,
  };
}
