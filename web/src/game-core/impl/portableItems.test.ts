import { describe, expect, it } from "vitest";
import {
  activatePortableItemFamily,
  carriedPortableItemForFamily,
  collectPortableItemsFromLayers,
  createPortableItem,
  destroyPortableItemFamily,
  detachPortableItemFamilyToDrop,
  findPortableItemBySerial,
  findPortableItemFamilyAttachedToActor,
  mapPortableItemForFamilyAt,
  portableItemDropProjection,
  projectPortableItemFamilyState,
  queuePortableItemFamilyReplacement,
  setPortableItemAttachedState,
  setPortableItemCarriedState,
  setPortableItemDetachedState,
  setPortableItemMapState,
  type PortableItemAttachedState,
  type PortableItemBase,
  type PortableItemCarriedState,
  type PortableItemDetachedState,
  type PortableItemFamilyDescriptor,
  type PortableItemFamilyPolicy,
  type PortableItemMapState,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";

type TestPortableState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemAttachedState<"actor">;

interface SandbagPortableItem extends PortableItemBase<"sandbag", "tools", TestPortableState> {}

interface HookPortableItem extends PortableItemBase<"hook", "tools", TestPortableState> {}

type TestPortableItem = SandbagPortableItem | HookPortableItem;

interface SandbagPortableStore extends PortableItemStore<SandbagPortableItem> {}

interface TestPortableStore extends PortableItemStore<TestPortableItem> {}
type TestInventory = PortableToolInventoryProjection;

function createSandbagStore(): SandbagPortableStore {
  return {
    portableItems: [],
    nextPortableItemSerial: 1,
  };
}

function createStore(): TestPortableStore {
  return {
    portableItems: [],
    nextPortableItemSerial: 1,
  };
}

const SANDBAG_POLICY: PortableItemFamilyPolicy<
  "sandbag",
  "tools",
  TestPortableState,
  SandbagPortableItem,
  TestInventory
> = {
  family: "sandbag",
  inventorySlot: "tools",
  attachmentKind: "actor",
  primedMode: "primed",
  displacedMode: () => "primed",
  projection: {
    readCarriedTile: (inventory) => inventory.tools[0] ?? 0,
    writeCarriedTile: (inventory, tileId) => {
      inventory.tools = [tileId];
    },
  },
  createCarriedItem: ({ serial, family, inventorySlot, tileId }) => ({
    serial,
    family,
    tileId,
    inventorySlot,
    state: { mode: "carried" },
  }),
  createMapItem: ({ serial, family, inventorySlot, tileId, pos, z }) => ({
    serial,
    family,
    tileId,
    inventorySlot,
    state: { mode: "map", pos, z },
  }),
};

const HOOK_POLICY: PortableItemFamilyPolicy<"hook", "tools", TestPortableState, HookPortableItem, TestInventory> = {
  family: "hook",
  inventorySlot: "tools",
  attachmentKind: "actor",
  primedMode: "primed",
  displacedMode: () => "primed",
  projection: SANDBAG_POLICY.projection,
  createCarriedItem: ({ serial, family, inventorySlot, tileId }) => ({
    serial,
    family,
    tileId,
    inventorySlot,
    state: { mode: "carried" },
  }),
  createMapItem: ({ serial, family, inventorySlot, tileId, pos, z }) => ({
    serial,
    family,
    tileId,
    inventorySlot,
    state: { mode: "map", pos, z },
  }),
};

describe("portableItems", () => {
  it("supports carried, detached, attached, and map lifecycle transitions", () => {
    const store = createSandbagStore();
    const item = createPortableItem(store, (serial): SandbagPortableItem => ({
      serial,
      family: "sandbag",
      tileId: 71,
      inventorySlot: "tools",
      state: { mode: "carried" },
    }));

    setPortableItemAttachedState(item, "actor", 9);
    expect(findPortableItemFamilyAttachedToActor(store, SANDBAG_POLICY, 9)?.serial).toBe(item.serial);
    expect(portableItemDropProjection(item, ["map", "primed"])).toBeNull();

    setPortableItemDetachedState(item, "primed", 15, 2);
    expect(portableItemDropProjection(item, ["primed"])).toEqual({
      tileId: 71,
      pos: 15,
      z: 2,
    });

    setPortableItemMapState(item, 15, 2);
    expect(portableItemDropProjection(item, ["map"])).toEqual({
      tileId: 71,
      pos: 15,
      z: 2,
    });

    setPortableItemCarriedState(item);
    expect(item.state).toEqual({ mode: "carried" });
  });

  it("supports serial lookup and family-aware destruction", () => {
    const store = createSandbagStore();
    const item = createPortableItem(store, (serial): SandbagPortableItem => ({
      serial,
      family: "sandbag",
      tileId: 40,
      inventorySlot: "tools",
      state: { mode: "map", pos: 3, z: 1 },
    }));

    expect(findPortableItemBySerial(store.portableItems, item.serial)?.tileId).toBe(40);
    expect(destroyPortableItemFamily(store, { tools: [0] }, SANDBAG_POLICY, item.serial)).toBe(true);
    expect(findPortableItemBySerial(store.portableItems, item.serial)).toBeUndefined();
  });

  it("collects multiple portable families from layers even when they share an inventory slot", () => {
    const items = collectPortableItemsFromLayers(
      [
        {
          z: 1,
          cells: [
            {
              position: { x: 0, y: 0, z: 1, pos: 0 },
              top: { id: 71, state: 0 },
              bottom: { id: 0, state: 0 },
            },
            {
              position: { x: 1, y: 0, z: 1, pos: 1 },
              top: { id: 72, state: 0 },
              bottom: { id: 0, state: 0 },
            },
          ],
        },
      ],
      (tileId): PortableItemFamilyDescriptor<"sandbag" | "hook", "tools"> | null => {
        if (tileId === 71) {
          return { family: "sandbag", inventorySlot: "tools" };
        }
        if (tileId === 72) {
          return { family: "hook", inventorySlot: "tools" };
        }
        return null;
      },
      ({ serial, family, inventorySlot, tileId, pos, z }): TestPortableItem => ({
        serial,
        family,
        inventorySlot,
        tileId,
        state: { mode: "map", pos, z },
      }),
    );

    expect(items.map((item) => ({ family: item.family, tileId: item.tileId }))).toEqual([
      { family: "sandbag", tileId: 71 },
      { family: "hook", tileId: 72 },
    ]);
  });

  it("handles projection and attachment by family instead of by inventory slot", () => {
    const store = createStore();
    const inventory: TestInventory = { tools: [0] };
    store.portableItems.push(
      {
        serial: 1,
        family: "sandbag",
        tileId: 71,
        inventorySlot: "tools",
        state: { mode: "map", pos: 4, z: 1 },
      },
      {
        serial: 2,
        family: "hook",
        tileId: 72,
        inventorySlot: "tools",
        state: { mode: "map", pos: 8, z: 1 },
      },
    );

    queuePortableItemFamilyReplacement(store, inventory, SANDBAG_POLICY, 71, 4, 1);
    expect(carriedPortableItemForFamily(store, SANDBAG_POLICY)?.serial).toBe(1);
    expect(mapPortableItemForFamilyAt(store, HOOK_POLICY, 72, 8, 1)?.serial).toBe(2);
    expect(projectPortableItemFamilyState(store, inventory, SANDBAG_POLICY).primedDrop).toBeNull();

    expect(activatePortableItemFamily(store, inventory, SANDBAG_POLICY, 1, 41)).toBe(true);
    expect(findPortableItemFamilyAttachedToActor(store, SANDBAG_POLICY, 41)?.serial).toBe(1);

    expect(detachPortableItemFamilyToDrop(store, inventory, SANDBAG_POLICY, 1, 12, 2)).toBe(true);
    expect(projectPortableItemFamilyState(store, inventory, SANDBAG_POLICY).primedDrop).toEqual({
      tileId: 71,
      pos: 12,
      z: 2,
    });
    expect(projectPortableItemFamilyState(store, inventory, HOOK_POLICY).primedDrop).toBeNull();
  });
});
