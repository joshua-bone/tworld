import { describe, expect, it } from "vitest";
import { characterizePortableItemArchetypes } from "@game-core/impl/statefulElementTestSupport";
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
        family: "sandbag",
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
  characterizePortableItemArchetypes("portable item archetypes", {
    expectedTileId: MS_TILE.Sandbag,
    actorSerial: 41,
    dropLocation: { pos: 9, z: 2 },
    mapLocation: { pos: 11, z: 2 },
    createStore,
    createInventory,
    project: projectMsPortableToolState,
    findCarriedSerial: (store) => store.portableItems.find((item) => item.state.mode === "carried")?.serial,
    readCarriedTile: (inventory) => inventory.tools[0] ?? 0,
    readDropProjection: (store) => store.primedToolDrop,
    activate: activateMsPortableTool,
    findAttachedSerial: (store, actorSerial) => findMsPortableToolAttachedToActor(store, actorSerial)?.serial,
    detachToDrop: (store, inventory, serial, pos, z) => detachMsPortableToolToDrop(store, inventory, serial, pos, z, "primed"),
    detachToMap: detachMsPortableToolToMap,
    findMapState: (store, serial) => {
      const item = store.portableItems.find((portableItem) => portableItem.serial === serial);
      return item?.state.mode === "map" ? item.state : undefined;
    },
    destroy: destroyMsPortableTool,
    summarizeItems: (store) => store.portableItems.map((item) => ({ serial: item.serial, state: { mode: item.state.mode } })),
  });

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
