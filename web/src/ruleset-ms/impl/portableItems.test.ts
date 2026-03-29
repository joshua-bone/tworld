import { describe, expect, it } from "vitest";
import { createMovingBowlingBallState, createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import { characterizePortableItemArchetypes } from "@game-core/impl/statefulElementTestSupport";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  activateMsPortableTool,
  carryMsPortableTool,
  cloneMsPortableTool,
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

function createHookStore(): MsPortableToolStateStore {
  return {
    portableItems: [
      {
        serial: 1,
        family: "hook",
        tileId: MS_TILE.Hook,
        inventorySlot: "tools",
        state: { mode: "carried" },
      },
    ],
    nextPortableItemSerial: 2,
    primedToolDrop: null,
    pendingToolDropAfterSettle: null,
  };
}

function createHookInventory(): MsToolInventoryProjection {
  return {
    tools: [MS_TILE.Hook],
  };
}

function createBowlingBallStore(): MsPortableToolStateStore {
  return {
    portableItems: [
      {
        serial: 1,
        family: "bowling-ball",
        tileId: MS_TILE.BowlingBall_Still,
        inventorySlot: "tools",
        bowlingBallState: createStillBowlingBallState(MS_DIRECTION.east),
        state: { mode: "carried" },
      },
    ],
    nextPortableItemSerial: 2,
    primedToolDrop: null,
    pendingToolDropAfterSettle: null,
  };
}

function createBowlingBallInventory(): MsToolInventoryProjection {
  return {
    tools: [MS_TILE.BowlingBall_Still],
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

  it("supports a second portable item family without sandbag-specific assumptions", () => {
    const store = createHookStore();
    const inventory = createHookInventory();

    expect(activateMsPortableTool(store, inventory, 1, 41)).toBe(true);
    expect(findMsPortableToolAttachedToActor(store, 41)?.family).toBe("hook");
    expect(detachMsPortableToolToDrop(store, inventory, 1, 9, 2, "primed")).toBe(true);
    expect(store.primedToolDrop).toEqual({
      tileId: MS_TILE.Hook,
      pos: 9,
      z: 2,
    });
  });

  it("can carry a mapped portable item and clone an attached one", () => {
    const store = createStore();
    const inventory: MsToolInventoryProjection = { tools: [0] };
    store.portableItems[0]!.state = { mode: "map", pos: 11, z: 2 };

    expect(carryMsPortableTool(store, inventory, 1)).toBe(true);
    expect(inventory.tools).toEqual([MS_TILE.Sandbag]);

    expect(activateMsPortableTool(store, inventory, 1, 41)).toBe(true);
    const cloned = cloneMsPortableTool(store, inventory, 1);
    expect(cloned).toMatchObject({
      serial: 2,
      family: "sandbag",
      state: { mode: "attached", attachmentKind: "actor", attachmentId: 41 },
    });
  });

  it("preserves bowling-ball family state through attach, detach, and clone", () => {
    const store = createBowlingBallStore();
    const inventory = createBowlingBallInventory();

    expect(activateMsPortableTool(store, inventory, 1, 41)).toBe(true);
    const attached = findMsPortableToolAttachedToActor(store, 41);
    expect(attached).toMatchObject({
      family: "bowling-ball",
      tileId: MS_TILE.BowlingBall_Still,
      bowlingBallState: createMovingBowlingBallState(MS_DIRECTION.east),
    });

    expect(detachMsPortableToolToDrop(store, inventory, 1, 9, 2, "primed")).toBe(true);
    expect(store.portableItems[0]?.bowlingBallState).toEqual(createStillBowlingBallState(MS_DIRECTION.east));

    expect(activateMsPortableTool(store, inventory, 1, 41)).toBe(true);
    const cloned = cloneMsPortableTool(store, inventory, 1);
    expect(cloned).toMatchObject({
      serial: 2,
      family: "bowling-ball",
      bowlingBallState: createMovingBowlingBallState(MS_DIRECTION.east),
      state: { mode: "attached", attachmentKind: "actor", attachmentId: 41 },
    });
  });
});
