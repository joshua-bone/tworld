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
export type LynxActorRuntimeInventoryEntry = StatefulActorInventoryEntry<string, StatefulActorLocalInventoryState>;

export interface LynxActorTileCollectionResolution extends ActorItemCollectionResolution {
  collectedChip: boolean;
}

export interface LynxActorInventoryOwnerOptions {
  actorSerial?: number;
  localInventory?: LynxActorLocalInventoryState;
  runtimeEntry?: LynxActorRuntimeInventoryEntry | null;
}

export function projectLynxActorInventoryOwner(
  actorId: number,
  inventory: LynxActorInventoryProjection,
  options: LynxActorInventoryOwnerOptions = {},
): ActorLocalInventoryOwner {
  if (actorId === MS_TILE.Chip) {
    return projectActorLocalInventoryOwner(
      createActorInventoryOwnerId("lynx", actorId),
      lynxActorLocalInventoryMode(actorId),
      inventory,
    );
  }

  if (options.actorSerial !== undefined && options.runtimeEntry) {
    return projectStatefulActorLocalInventoryOwner(
      "lynx-actor",
      options.actorSerial,
      lynxActorLocalInventoryMode(actorId),
      options.runtimeEntry,
    );
  }

  return projectActorLocalInventoryOwner(
    createActorInventoryOwnerId("lynx", actorId),
    lynxActorLocalInventoryMode(actorId),
    options.localInventory ?? null,
  );
}

export function collectLynxActorTile(
  actorId: number,
  inventory: LynxActorInventoryState,
  tileId: number,
  options: LynxActorInventoryOwnerOptions = {},
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
      projectLynxActorInventoryOwner(actorId, inventory, options),
      lynxActorItemCollectionKind(actorId),
      slot,
      index,
    ),
    collectedChip: false,
  };
}
