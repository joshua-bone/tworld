import { describe, expect, it } from "vitest";
import { collectActorChipProgress, collectActorInventoryItem } from "@game-core/impl/actorCollection";
import {
  createActorInventoryOwnerId,
  createActorLocalInventory,
  createKeysBootsToolsActorLocalInventoryOwner,
  createNoActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";

describe("actorCollection", () => {
  it("updates global chip progress only for actors that collect chips", () => {
    const progress = { chipsNeeded: 3 };

    expect(collectActorChipProgress(progress, "collect-chips")).toBe(true);
    expect(progress.chipsNeeded).toBe(2);
    expect(collectActorChipProgress(progress, "none")).toBe(false);
    expect(progress.chipsNeeded).toBe(2);
  });

  it("collects key and boot items into actor-owned inventory", () => {
    const owner = createKeysBootsToolsActorLocalInventoryOwner(
      createActorInventoryOwnerId("test", "chip"),
      createActorLocalInventory("keys-boots-tools"),
    );

    expect(collectActorInventoryItem(owner, "keys-boots-tools", "keys", 1)).toEqual({
      collected: true,
      slot: "keys",
      index: 1,
    });
    expect(owner.inventory.keys[1]).toBe(1);

    expect(collectActorInventoryItem(owner, "keys-boots-tools", "boots", 2)).toEqual({
      collected: true,
      slot: "boots",
      index: 2,
    });
    expect(owner.inventory.boots[2]).toBe(1);
  });

  it("treats tool collection as a queued actor capability instead of mutating inventory immediately", () => {
    const owner = createKeysBootsToolsActorLocalInventoryOwner(
      createActorInventoryOwnerId("test", "chip"),
      createActorLocalInventory("keys-boots-tools"),
    );

    expect(collectActorInventoryItem(owner, "keys-boots-tools", "tools", 0)).toEqual({
      collected: true,
      slot: "tools",
      index: 0,
    });
    expect(owner.inventory.tools).toEqual([0]);
  });

  it("rejects collection when actor policy or owner inventory does not support it", () => {
    const noOwner = createNoActorLocalInventoryOwner(createActorInventoryOwnerId("test", "ghost"));

    expect(collectActorInventoryItem(noOwner, "none", "keys", 0)).toEqual({
      collected: false,
      slot: null,
      index: null,
    });
    expect(collectActorInventoryItem(noOwner, "keys-boots-tools", "tools", 0)).toEqual({
      collected: false,
      slot: null,
      index: null,
    });
  });
});
