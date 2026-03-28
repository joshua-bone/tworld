import { describe, expect, it } from "vitest";
import { characterizePortableItemArchetypes } from "@game-core/impl/statefulElementTestSupport";
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
        family: "sandbag",
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
  characterizePortableItemArchetypes("portable item archetypes", {
    expectedTileId: MS_TILE.Sandbag,
    actorSerial: 41,
    dropLocation: { pos: 9, z: 2 },
    mapLocation: { pos: 11, z: 2 },
    createStore,
    createInventory,
    project: projectLynxPortableToolState,
    findCarriedSerial: (store) => store.portableItems.find((item) => item.state.mode === "carried")?.serial,
    readCarriedTile: (inventory) => inventory.tools[0] ?? 0,
    readDropProjection: (store) => store.primedToolDrop,
    activate: activateLynxPortableTool,
    findAttachedSerial: (store, actorSerial) => findLynxPortableToolAttachedToActor(store, actorSerial)?.serial,
    detachToDrop: detachLynxPortableToolToDrop,
    detachToMap: detachLynxPortableToolToMap,
    findMapState: (store, serial) => {
      const item = store.portableItems.find((portableItem) => portableItem.serial === serial);
      return item?.state.mode === "map" ? item.state : undefined;
    },
    destroy: destroyLynxPortableTool,
    summarizeItems: (store) => store.portableItems.map((item) => ({ serial: item.serial, state: { mode: item.state.mode } })),
  });

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
