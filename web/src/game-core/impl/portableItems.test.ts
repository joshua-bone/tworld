import { describe, expect, it } from "vitest";
import {
  collectPortableItemsFromLayers,
  createPortableItem,
  findPortableItemByMode,
  findPortableMapItemAt,
  portableItemDropProjection,
  projectCarriedPortableToolTile,
  removePortableItem,
  type PortableItemBase,
  type PortableItemCarriedState,
  type PortableItemLocatedState,
  type PortableItemMapState,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";
import type { EngineMapCell } from "@game-core/api/model";

type TestPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemLocatedState<"primed">
  | PortableItemLocatedState<"pending-primed">;

interface TestPortableItem extends PortableItemBase<"tools", TestPortableItemState> {}

function testCell(pos: number, z: number, topId: number): EngineMapCell {
  return {
    position: { pos, x: pos % 32, y: Math.floor(pos / 32), z },
    top: { id: topId, state: 0 },
    bottom: { id: 0, state: 0 },
  };
}

function createTestPortableItemStore(): PortableItemStore<TestPortableItem> {
  return {
    portableItems: [],
    nextPortableItemSerial: 1,
  };
}

describe("portableItems", () => {
  it("collects portable items from runtime layers by inventory slot", () => {
    const items = collectPortableItemsFromLayers(
      [
        { z: 1, cells: [testCell(0, 1, 7), testCell(1, 1, 0)] },
        { z: 3, cells: [testCell(2, 3, 9)] },
      ],
      "tools",
      (tileId) => (tileId === 7 || tileId === 9 ? "tools" : null),
      ({ serial, tileId, inventorySlot, pos, z }) => ({
        serial,
        tileId,
        inventorySlot,
        state: { mode: "map", pos, z },
      }),
    );

    expect(items).toEqual([
      {
        serial: 1,
        tileId: 7,
        inventorySlot: "tools",
        state: { mode: "map", pos: 0, z: 1 },
      },
      {
        serial: 2,
        tileId: 9,
        inventorySlot: "tools",
        state: { mode: "map", pos: 2, z: 3 },
      },
    ]);
  });

  it("creates, finds, projects, and removes portable items from a store", () => {
    const store = createTestPortableItemStore();
    const inventory: PortableToolInventoryProjection = { tools: [0] };
    const carried = createPortableItem(store, (serial): TestPortableItem => ({
      serial,
      tileId: 42,
      inventorySlot: "tools",
      state: { mode: "carried" },
    }));

    expect(findPortableItemByMode(store.portableItems, "tools", "carried")).toBe(carried);
    projectCarriedPortableToolTile(inventory, carried);
    expect(inventory.tools).toEqual([42]);

    removePortableItem(store, carried.serial);
    expect(store.portableItems).toEqual([]);

    projectCarriedPortableToolTile(inventory, undefined);
    expect(inventory.tools).toEqual([0]);
  });

  it("finds map items and builds drop projections only for located modes", () => {
    const store = createTestPortableItemStore();
    const mapItem = createPortableItem(store, (serial): TestPortableItem => ({
      serial,
      tileId: 17,
      inventorySlot: "tools",
      state: { mode: "map", pos: 10, z: 2 },
    }));
    const primedItem = createPortableItem(store, (serial): TestPortableItem => ({
      serial,
      tileId: 18,
      inventorySlot: "tools",
      state: { mode: "primed", pos: 11, z: 2 },
    }));

    expect(findPortableMapItemAt(store.portableItems, "tools", 17, 10, 2)).toBe(mapItem);
    expect(portableItemDropProjection(mapItem, ["map"])).toEqual({
      tileId: 17,
      pos: 10,
      z: 2,
    });
    expect(portableItemDropProjection(primedItem, ["primed"])).toEqual({
      tileId: 18,
      pos: 11,
      z: 2,
    });
    expect(portableItemDropProjection({ ...primedItem, state: { mode: "carried" } }, ["primed"])).toBeNull();
  });
});
