import { describe, expect, it } from "vitest";
import { createMovingBowlingBallState, createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import {
  PET_CARRIER_ACTION_COOLDOWN_TICKS,
  PORTABLE_ITEM_MOB_OCCUPANCY_POLICY,
  createPetCarrierCooldownState,
  createPetCarrierState,
} from "@game-core/impl/petCarrier";
import { characterizePortableItemArchetypes } from "@game-core/impl/statefulElementTestSupport";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  activateLynxPortableTool,
  carryLynxPortableTool,
  cloneLynxPortableTool,
  collectLynxPortableItemsFromLayers,
  destroyLynxPortableTool,
  detachLynxPortableToolToDrop,
  detachLynxPortableToolToMap,
  findLynxPortableToolAttachedToActor,
  isLynxPetCarrierCaptureEligibleTileId,
  isLynxPetCarrierPortableItem,
  isLynxSpecialItemClassTileId,
  lynxPortableItemMobOccupancyPolicy,
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

function createHookStore(): LynxPortableToolStateStore {
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
  };
}

function createHookInventory(): LynxToolInventoryProjection {
  return {
    tools: [MS_TILE.Hook],
  };
}

function createBowlingBallStore(): LynxPortableToolStateStore {
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
  };
}

function createBowlingBallInventory(): LynxToolInventoryProjection {
  return {
    tools: [MS_TILE.BowlingBall_Still],
  };
}

function createPetCarrierStore(occupied = false): LynxPortableToolStateStore {
  return {
    portableItems: [
      {
        serial: 1,
        family: "pet-carrier",
        tileId: MS_TILE.PetCarrier,
        inventorySlot: "tools",
        petCarrierState: createPetCarrierState({
          occupant: occupied
            ? {
                actorId: MS_TILE.Bug,
                dir: MS_DIRECTION.east,
                runtimeState: {
                  nested: {
                    count: 1,
                  },
                },
              }
            : null,
          cooldown: occupied ? createPetCarrierCooldownState("after-snatch") : undefined,
        }),
        state: { mode: "carried" },
      },
    ],
    nextPortableItemSerial: 2,
    primedToolDrop: null,
  };
}

function createPetCarrierInventory(): LynxToolInventoryProjection {
  return {
    tools: [MS_TILE.PetCarrier],
  };
}

function createMapCell(topId: number, bottomId = MS_TILE.Empty, z = 1, pos = 0) {
  return {
    position: { x: pos % 32, y: Math.floor(pos / 32), z, pos },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
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

  it("supports a second portable item family without sandbag-specific assumptions", () => {
    const store = createHookStore();
    const inventory = createHookInventory();

    expect(activateLynxPortableTool(store, inventory, 1, 41)).toBe(true);
    expect(findLynxPortableToolAttachedToActor(store, 41)?.family).toBe("hook");
    expect(detachLynxPortableToolToDrop(store, inventory, 1, 9, 2)).toBe(true);
    expect(store.primedToolDrop).toEqual({
      tileId: MS_TILE.Hook,
      pos: 9,
      z: 2,
    });
  });

  it("can carry a mapped portable item and clone an attached one", () => {
    const store = createStore();
    const inventory: LynxToolInventoryProjection = { tools: [0] };
    store.portableItems[0]!.state = { mode: "map", pos: 11, z: 2 };

    expect(carryLynxPortableTool(store, inventory, 1)).toBe(true);
    expect(inventory.tools).toEqual([MS_TILE.Sandbag]);

    expect(activateLynxPortableTool(store, inventory, 1, 41)).toBe(true);
    const cloned = cloneLynxPortableTool(store, inventory, 1);
    expect(cloned).toMatchObject({
      serial: 2,
      family: "sandbag",
      state: { mode: "attached", attachmentKind: "actor", attachmentId: 41 },
    });
  });

  it("preserves bowling-ball family state through attach, detach, and clone", () => {
    const store = createBowlingBallStore();
    const inventory = createBowlingBallInventory();

    expect(activateLynxPortableTool(store, inventory, 1, 41)).toBe(true);
    const attached = findLynxPortableToolAttachedToActor(store, 41);
    expect(attached).toMatchObject({
      family: "bowling-ball",
      tileId: MS_TILE.BowlingBall_Still,
      bowlingBallState: createMovingBowlingBallState(MS_DIRECTION.east),
    });

    expect(detachLynxPortableToolToDrop(store, inventory, 1, 9, 2)).toBe(true);
    expect(store.portableItems[0]?.bowlingBallState).toEqual(createStillBowlingBallState(MS_DIRECTION.east));

    expect(activateLynxPortableTool(store, inventory, 1, 41)).toBe(true);
    const cloned = cloneLynxPortableTool(store, inventory, 1);
    expect(cloned).toMatchObject({
      serial: 2,
      family: "bowling-ball",
      bowlingBallState: createMovingBowlingBallState(MS_DIRECTION.east),
      state: { mode: "attached", attachmentKind: "actor", attachmentId: 41 },
    });
  });

  it("preserves pet carrier occupant and cooldown state through attach, detach, and clone", () => {
    const store = createPetCarrierStore(true);
    const inventory = createPetCarrierInventory();

    expect(activateLynxPortableTool(store, inventory, 1, 41)).toBe(true);
    const attached = findLynxPortableToolAttachedToActor(store, 41);
    expect(isLynxPetCarrierPortableItem(attached)).toBe(true);
    if (!isLynxPetCarrierPortableItem(attached)) {
      throw new Error("expected attached pet carrier");
    }
    expect(attached.petCarrierState).toMatchObject({
      occupant: {
        actorId: MS_TILE.Bug,
        dir: MS_DIRECTION.east,
      },
      cooldown: {
        kind: "after-snatch",
        remainingTicks: PET_CARRIER_ACTION_COOLDOWN_TICKS,
      },
    });

    expect(detachLynxPortableToolToDrop(store, inventory, 1, 9, 2)).toBe(true);
    const primed = store.portableItems[0];
    expect(isLynxPetCarrierPortableItem(primed)).toBe(true);
    if (!isLynxPetCarrierPortableItem(primed)) {
      throw new Error("expected primed pet carrier");
    }
    expect(primed.petCarrierState.occupant?.actorId).toBe(MS_TILE.Bug);

    expect(activateLynxPortableTool(store, inventory, 1, 41)).toBe(true);
    const cloned = cloneLynxPortableTool(store, inventory, 1);
    expect(isLynxPetCarrierPortableItem(cloned)).toBe(true);
    if (!isLynxPetCarrierPortableItem(cloned)) {
      throw new Error("expected cloned pet carrier");
    }
    expect(cloned.petCarrierState).toMatchObject({
      occupant: {
        actorId: MS_TILE.Bug,
      },
      cooldown: {
        kind: "after-snatch",
        remainingTicks: PET_CARRIER_ACTION_COOLDOWN_TICKS,
      },
    });

    ((cloned.petCarrierState.occupant?.runtimeState as { nested: { count: number } }).nested).count = 9;
    expect(((attached.petCarrierState.occupant?.runtimeState as { nested: { count: number } }).nested).count).toBe(1);
  });

  it("classifies special-item tiles and pet carrier occupancy policy through shared helpers", () => {
    expect(isLynxSpecialItemClassTileId(MS_TILE.Sandbag)).toBe(true);
    expect(isLynxSpecialItemClassTileId(MS_TILE.Hook)).toBe(true);
    expect(isLynxSpecialItemClassTileId(MS_TILE.PetCarrier)).toBe(true);
    expect(isLynxSpecialItemClassTileId(MS_TILE.BowlingBall_Still)).toBe(true);
    expect(isLynxSpecialItemClassTileId(MS_TILE.BowlingBall)).toBe(true);
    expect(isLynxSpecialItemClassTileId(MS_TILE.Bug)).toBe(false);

    expect(isLynxPetCarrierCaptureEligibleTileId(MS_TILE.Bug)).toBe(true);
    expect(isLynxPetCarrierCaptureEligibleTileId(MS_TILE.Block_Static)).toBe(true);
    expect(isLynxPetCarrierCaptureEligibleTileId(MS_TILE.IceBlock_Static)).toBe(true);
    expect(isLynxPetCarrierCaptureEligibleTileId(MS_TILE.Chip)).toBe(false);
    expect(isLynxPetCarrierCaptureEligibleTileId(MS_TILE.BowlingBall)).toBe(false);

    const emptyCarrier = createPetCarrierStore(false).portableItems[0];
    const occupiedCarrier = createPetCarrierStore(true).portableItems[0];
    expect(lynxPortableItemMobOccupancyPolicy(emptyCarrier, MS_TILE.Bug)).toBe(
      PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.autoCapture,
    );
    expect(lynxPortableItemMobOccupancyPolicy(emptyCarrier, MS_TILE.BowlingBall)).toBe(
      PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default,
    );
    expect(lynxPortableItemMobOccupancyPolicy(occupiedCarrier, MS_TILE.Bug)).toBe(
      PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.actingWall,
    );
    expect(lynxPortableItemMobOccupancyPolicy(occupiedCarrier, MS_TILE.Chip)).toBe(
      PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default,
    );
  });

  it("hydrates mapped Lynx pet carriers from loaded occupant state", () => {
    const items = collectLynxPortableItemsFromLayers(
      [{ z: 1, cells: [createMapCell(MS_TILE.PetCarrier)] }],
      new Map([
        ["1:0", {
          actorId: MS_TILE.Bug,
          dir: MS_DIRECTION.south,
        }],
      ]),
    );

    expect(items).toHaveLength(1);
    expect(isLynxPetCarrierPortableItem(items[0])).toBe(true);
    if (!isLynxPetCarrierPortableItem(items[0])) {
      throw new Error("expected mapped pet carrier");
    }
    expect(items[0].petCarrierState).toEqual(createPetCarrierState({
      occupant: {
        actorId: MS_TILE.Bug,
        dir: MS_DIRECTION.south,
      },
    }));
  });
});
