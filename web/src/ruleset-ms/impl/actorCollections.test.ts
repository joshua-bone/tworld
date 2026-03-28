import { describe, expect, it } from "vitest";
import { collectMsActorTile, projectMsActorInventoryOwner } from "@ruleset-ms/impl/actorCollections";
import { createActorLocalInventory } from "@game-core/impl/actorLocalInventory";
import { createStatefulActorLocalInventoryState } from "@game-core/impl/statefulActorLocalInventory";
import { MS_TILE } from "@ruleset-ms/api/tiles";

function createChipInventory() {
  return {
    keys: [0, 0, 0, 0] as [number, number, number, number],
    boots: [0, 0, 0, 0] as [number, number, number, number],
    tools: [0] as [number],
    chipsNeeded: 2,
  };
}

describe("ms actorCollections", () => {
  it("projects the shared chip inventory as the chip actor owner", () => {
    const inventory = createChipInventory();
    const owner = projectMsActorInventoryOwner(MS_TILE.Chip, inventory);

    expect(owner.mode).toBe("keys-boots-tools");
    expect(owner.mode === "keys-boots-tools" ? owner.inventory : null).toBe(inventory);
  });

  it("collects chips into global progress and inventory items into actor-local state", () => {
    const chipInventory = createChipInventory();
    const chipCollected = collectMsActorTile(MS_TILE.Chip, chipInventory, MS_TILE.ICChip);
    expect(chipCollected.collected).toBe(true);
    expect(chipCollected.collectedChip).toBe(true);
    expect(chipInventory.chipsNeeded).toBe(1);

    const itemCollected = collectMsActorTile(MS_TILE.Chip, chipInventory, MS_TILE.Key_Red);
    expect(itemCollected).toMatchObject({
      collected: true,
      collectedChip: false,
      slot: "keys",
      index: 0,
    });
    expect(chipInventory.keys[0]).toBe(1);
  });

  it("uses actor-local inventory when projecting non-chip actors", () => {
    const chipInventory = createChipInventory();
    const localInventory = createActorLocalInventory("keys-boots");
    const collected = collectMsActorTile(MS_TILE.Ball, chipInventory, MS_TILE.Boots_Ice, { localInventory });

    expect(collected.collected).toBe(false);
    expect(collected.slot).toBeNull();
    expect(localInventory.boots[0]).toBe(0);
  });

  it("projects and mutates per-instance stateful actor inventory for bowling balls", () => {
    const chipInventory = createChipInventory();
    const runtimeEntry = {
      actorSerial: 41,
      kind: "bowling-ball",
      state: createStatefulActorLocalInventoryState("keys-boots"),
    };

    const owner = projectMsActorInventoryOwner(MS_TILE.BowlingBall, chipInventory, {
      actorSerial: 41,
      runtimeEntry,
    });
    expect(owner.ownerId).toBe("ms-actor:41");
    expect(owner.mode).toBe("keys-boots");

    const keyCollected = collectMsActorTile(MS_TILE.BowlingBall, chipInventory, MS_TILE.Key_Red, {
      actorSerial: 41,
      runtimeEntry,
    });
    const chipCollected = collectMsActorTile(MS_TILE.BowlingBall, chipInventory, MS_TILE.ICChip, {
      actorSerial: 41,
      runtimeEntry,
    });

    expect(keyCollected).toMatchObject({
      collected: true,
      collectedChip: false,
      slot: "keys",
      index: 0,
    });
    expect(runtimeEntry.state.localInventory?.keys[0]).toBe(1);
    expect(chipCollected.collectedChip).toBe(true);
    expect(chipInventory.chipsNeeded).toBe(1);
  });
});
