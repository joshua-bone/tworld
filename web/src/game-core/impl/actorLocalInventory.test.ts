import { describe, expect, it } from "vitest";
import {
  actorInventoryClearBoots,
  actorInventoryClearTools,
  actorInventoryCollectIndexedItem,
  actorInventoryHasBoot,
  actorInventoryHasKey,
  actorInventoryUseKey,
  createActorLocalInventory,
  createKeysBootsActorLocalInventoryOwner,
  createKeysBootsToolsActorLocalInventoryOwner,
  createNoActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";

describe("actorLocalInventory", () => {
  it("creates empty inventory models for future actor owners", () => {
    expect(createActorLocalInventory("none")).toBeNull();
    expect(createActorLocalInventory("keys-boots")).toEqual({
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
    });
    expect(createActorLocalInventory("keys-boots-tools")).toEqual({
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      tools: [0],
    });
  });

  it("treats a no-inventory owner as unable to collect or use items", () => {
    const owner = createNoActorLocalInventoryOwner("ghost");

    expect(actorInventoryHasKey(owner, 0)).toBe(false);
    expect(actorInventoryHasBoot(owner, 1)).toBe(false);
    expect(actorInventoryUseKey(owner, 0)).toBe(false);
    expect(actorInventoryCollectIndexedItem(owner, "keys", 0)).toBe(false);
    expect(actorInventoryClearBoots(owner)).toBe(false);
    expect(actorInventoryClearTools(owner)).toBe(false);
  });

  it("supports keys and boots for a keys-boots owner", () => {
    const owner = createKeysBootsActorLocalInventoryOwner("fake-player", createActorLocalInventory("keys-boots"));

    expect(actorInventoryCollectIndexedItem(owner, "keys", 3)).toBe(true);
    expect(actorInventoryCollectIndexedItem(owner, "boots", 2)).toBe(true);
    expect(actorInventoryHasKey(owner, 3)).toBe(true);
    expect(actorInventoryHasBoot(owner, 2)).toBe(true);

    expect(actorInventoryUseKey(owner, 3, { consume: false })).toBe(true);
    expect(owner.inventory.keys[3]).toBe(1);
    expect(actorInventoryUseKey(owner, 3)).toBe(true);
    expect(owner.inventory.keys[3]).toBe(0);

    expect(actorInventoryClearBoots(owner)).toBe(true);
    expect(owner.inventory.boots).toEqual([0, 0, 0, 0]);
    expect(actorInventoryClearTools(owner)).toBe(false);
  });

  it("supports tools clearing for a keys-boots-tools owner", () => {
    const owner = createKeysBootsToolsActorLocalInventoryOwner("chip", createActorLocalInventory("keys-boots-tools"));

    owner.inventory.tools = [71];
    expect(actorInventoryClearTools(owner)).toBe(true);
    expect(owner.inventory.tools).toEqual([0]);
  });
});
