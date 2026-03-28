import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  activateMsPortableTool,
  destroyMsPortableTool,
  detachMsPortableToolToDrop,
  detachMsPortableToolToMap,
  findMsPortableToolAttachedToActor,
  projectMsPortableToolState,
  type MsPortableToolStateStore,
  type MsToolInventoryProjection,
} from "@ruleset-ms/impl/portableItems";

function createStore(): MsPortableToolStateStore {
  return {
    portableItems: [
      {
        serial: 1,
        tileId: MS_TILE.Sandbag,
        inventorySlot: "tools",
        state: { mode: "carried" },
      },
    ],
    nextPortableItemSerial: 2,
    primedToolDrop: null,
    pendingToolDropAfterSettle: null,
  };
}

function createInventory(): MsToolInventoryProjection {
  return {
    tools: [MS_TILE.Sandbag],
  };
}

describe("ms portableItems lifecycle", () => {
  it("can activate a carried portable item onto an actor and clear the carried projection", () => {
    const store = createStore();
    const inventory = createInventory();

    expect(activateMsPortableTool(store, inventory, 1, 41)).toBe(true);
    expect(findMsPortableToolAttachedToActor(store, 41)?.serial).toBe(1);
    expect(inventory.tools).toEqual([0]);
    expect(store.primedToolDrop).toBeNull();
  });

  it("can detach an attached portable item back to map or drop states", () => {
    const store = createStore();
    const inventory = createInventory();
    activateMsPortableTool(store, inventory, 1, 41);

    expect(detachMsPortableToolToDrop(store, inventory, 1, 9, 2, "primed")).toBe(true);
    expect(store.primedToolDrop).toEqual({
      tileId: MS_TILE.Sandbag,
      pos: 9,
      z: 2,
    });

    expect(detachMsPortableToolToMap(store, inventory, 1, 11, 2)).toBe(true);
    expect(store.portableItems[0]?.state).toEqual({ mode: "map", pos: 11, z: 2 });
  });

  it("can destroy an activated portable item", () => {
    const store = createStore();
    const inventory = createInventory();
    activateMsPortableTool(store, inventory, 1, 41);

    expect(destroyMsPortableTool(store, inventory, 1)).toBe(true);
    expect(store.portableItems).toEqual([]);
    projectMsPortableToolState(store, inventory);
    expect(inventory.tools).toEqual([0]);
  });
});
