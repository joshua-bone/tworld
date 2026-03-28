import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  activateLynxPortableTool,
  destroyLynxPortableTool,
  detachLynxPortableToolToDrop,
  detachLynxPortableToolToMap,
  findLynxPortableToolAttachedToActor,
  projectLynxPortableToolState,
  type LynxPortableToolStateStore,
  type LynxToolInventoryProjection,
} from "@ruleset-lynx/impl/portableItems";

function createStore(): LynxPortableToolStateStore {
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
  };
}

function createInventory(): LynxToolInventoryProjection {
  return {
    tools: [MS_TILE.Sandbag],
  };
}

describe("lynx portableItems lifecycle", () => {
  it("can activate a carried portable item onto an actor and clear the carried projection", () => {
    const store = createStore();
    const inventory = createInventory();

    expect(activateLynxPortableTool(store, inventory, 1, 41)).toBe(true);
    expect(findLynxPortableToolAttachedToActor(store, 41)?.serial).toBe(1);
    expect(inventory.tools).toEqual([0]);
    expect(store.primedToolDrop).toBeNull();
  });

  it("can detach an attached portable item back to map or drop states", () => {
    const store = createStore();
    const inventory = createInventory();
    activateLynxPortableTool(store, inventory, 1, 41);

    expect(detachLynxPortableToolToDrop(store, inventory, 1, 9, 2)).toBe(true);
    expect(store.primedToolDrop).toEqual({
      tileId: MS_TILE.Sandbag,
      pos: 9,
      z: 2,
    });

    expect(detachLynxPortableToolToMap(store, inventory, 1, 11, 2)).toBe(true);
    expect(store.portableItems[0]?.state).toEqual({ mode: "map", pos: 11, z: 2 });
  });

  it("can destroy an activated portable item", () => {
    const store = createStore();
    const inventory = createInventory();
    activateLynxPortableTool(store, inventory, 1, 41);

    expect(destroyLynxPortableTool(store, inventory, 1)).toBe(true);
    expect(store.portableItems).toEqual([]);
    projectLynxPortableToolState(store, inventory);
    expect(inventory.tools).toEqual([0]);
  });
});
