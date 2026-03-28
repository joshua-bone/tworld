import { describe, expect, it } from "vitest";
import {
  actorInventoryCollectIndexedItem,
  actorInventoryHasBoot,
  actorInventoryHasKey,
} from "@game-core/impl/actorLocalInventory";
import {
  createStatefulActorLocalInventoryState,
  projectStatefulActorLocalInventoryOwner,
  statefulActorLocalInventory,
} from "@game-core/impl/statefulActorLocalInventory";

describe("statefulActorLocalInventory", () => {
  it("creates runtime-local inventory payloads from actor capability modes", () => {
    expect(createStatefulActorLocalInventoryState("none")).toEqual({
      localInventory: null,
    });
    expect(createStatefulActorLocalInventoryState("keys-boots")).toEqual({
      localInventory: {
        keys: [0, 0, 0, 0],
        boots: [0, 0, 0, 0],
      },
    });
  });

  it("projects per-serial owners from runtime entries", () => {
    const entry = {
      actorSerial: 41,
      kind: "bowling-ball",
      state: createStatefulActorLocalInventoryState("keys-boots"),
    } as const;

    const owner = projectStatefulActorLocalInventoryOwner("ms-actor", 41, "keys-boots", entry);
    expect(owner.ownerId).toBe("ms-actor:41");
    expect(owner.mode).toBe("keys-boots");
    expect(statefulActorLocalInventory(entry)).toBe(owner.mode === "keys-boots" ? owner.inventory : null);
  });

  it("lets runtime-owned inventories behave like ordinary actor owners", () => {
    const entry = {
      actorSerial: 99,
      kind: "ghost",
      state: createStatefulActorLocalInventoryState("keys-boots"),
    } as const;

    const owner = projectStatefulActorLocalInventoryOwner("lynx-actor", 99, "keys-boots", entry);
    expect(actorInventoryCollectIndexedItem(owner, "keys", 1)).toBe(true);
    expect(actorInventoryCollectIndexedItem(owner, "boots", 2)).toBe(true);
    expect(actorInventoryHasKey(owner, 1)).toBe(true);
    expect(actorInventoryHasBoot(owner, 2)).toBe(true);
  });
});
