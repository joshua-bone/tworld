import type { ActorLocalInventoryMode } from "@game-core/api/actorCapabilities";
import type { InventorySlots, ToolInventorySlots } from "@game-core/api/model";

declare const actorInventoryOwnerIdBrand: unique symbol;
export type ActorInventoryOwnerId = string & { readonly [actorInventoryOwnerIdBrand]: "ActorInventoryOwnerId" };

export function createActorInventoryOwnerId(scope: string, actorId: number | string): ActorInventoryOwnerId {
  return `${scope}:${actorId}` as ActorInventoryOwnerId;
}

export interface ActorKeysBootsInventory {
  keys: InventorySlots;
  boots: InventorySlots;
}

export interface ActorKeysBootsToolsInventory extends ActorKeysBootsInventory {
  tools: ToolInventorySlots;
}

export interface NoActorLocalInventoryOwner {
  ownerId: ActorInventoryOwnerId;
  mode: "none";
  inventory: null;
}

export interface KeysBootsActorLocalInventoryOwner {
  ownerId: ActorInventoryOwnerId;
  mode: "keys-boots";
  inventory: ActorKeysBootsInventory;
}

export interface KeysBootsToolsActorLocalInventoryOwner {
  ownerId: ActorInventoryOwnerId;
  mode: "keys-boots-tools";
  inventory: ActorKeysBootsToolsInventory;
}

export type ActorLocalInventoryOwner =
  | NoActorLocalInventoryOwner
  | KeysBootsActorLocalInventoryOwner
  | KeysBootsToolsActorLocalInventoryOwner;

export function projectActorLocalInventoryOwner(
  ownerId: ActorInventoryOwnerId,
  mode: ActorLocalInventoryMode,
  inventory: ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null,
): ActorLocalInventoryOwner {
  if (mode === "none" || inventory === null) {
    return createNoActorLocalInventoryOwner(ownerId);
  }

  return mode === "keys-boots-tools"
    ? createKeysBootsToolsActorLocalInventoryOwner(ownerId, inventory as ActorKeysBootsToolsInventory)
    : createKeysBootsActorLocalInventoryOwner(ownerId, inventory as ActorKeysBootsInventory);
}

export function createActorLocalInventory(mode: "none"): null;
export function createActorLocalInventory(mode: "keys-boots"): ActorKeysBootsInventory;
export function createActorLocalInventory(mode: "keys-boots-tools"): ActorKeysBootsToolsInventory;
export function createActorLocalInventory(mode: ActorLocalInventoryMode): ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null {
  if (mode === "none") {
    return null;
  }

  const inventory: ActorKeysBootsInventory = {
    keys: [0, 0, 0, 0] as InventorySlots,
    boots: [0, 0, 0, 0] as InventorySlots,
  };
  if (mode === "keys-boots") {
    return inventory;
  }

  return {
    ...inventory,
    tools: [0] as ToolInventorySlots,
  };
}

export function createNoActorLocalInventoryOwner(ownerId: ActorInventoryOwnerId): NoActorLocalInventoryOwner {
  return {
    ownerId,
    mode: "none",
    inventory: null,
  };
}

export function createKeysBootsActorLocalInventoryOwner(
  ownerId: ActorInventoryOwnerId,
  inventory: ActorKeysBootsInventory,
): KeysBootsActorLocalInventoryOwner {
  return {
    ownerId,
    mode: "keys-boots",
    inventory,
  };
}

export function createKeysBootsToolsActorLocalInventoryOwner(
  ownerId: ActorInventoryOwnerId,
  inventory: ActorKeysBootsToolsInventory,
): KeysBootsToolsActorLocalInventoryOwner {
  return {
    ownerId,
    mode: "keys-boots-tools",
    inventory,
  };
}

export function actorInventoryHasKey(owner: ActorLocalInventoryOwner, index: number): boolean {
  return owner.mode !== "none" && owner.inventory.keys[index] > 0;
}

export function actorInventoryUseKey(
  owner: ActorLocalInventoryOwner,
  index: number,
  options: {
    consume?: boolean;
  } = {},
): boolean {
  if (owner.mode === "none" || owner.inventory.keys[index] === 0) {
    return false;
  }

  if (options.consume ?? true) {
    owner.inventory.keys[index] -= 1;
  }
  return true;
}

export function actorInventoryHasBoot(owner: ActorLocalInventoryOwner, index: number): boolean {
  return owner.mode !== "none" && owner.inventory.boots[index] > 0;
}

export function actorInventoryCollectIndexedItem(
  owner: ActorLocalInventoryOwner,
  slot: "keys" | "boots",
  index: number,
): boolean {
  if (owner.mode === "none") {
    return false;
  }

  owner.inventory[slot][index] += 1;
  return true;
}

export function actorInventoryClearBoots(owner: ActorLocalInventoryOwner): boolean {
  if (owner.mode === "none") {
    return false;
  }

  owner.inventory.boots = [0, 0, 0, 0] as InventorySlots;
  return true;
}

export function actorInventoryClearTools(owner: ActorLocalInventoryOwner): boolean {
  if (owner.mode !== "keys-boots-tools") {
    return false;
  }

  owner.inventory.tools = [0] as ToolInventorySlots;
  return true;
}
