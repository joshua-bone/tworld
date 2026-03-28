import { describe, expect, it } from "vitest";
import {
  createPortableItem,
  destroyPortableItem,
  findPortableAttachedItem,
  findPortableItemBySerial,
  portableItemDropProjection,
  setPortableItemAttachedState,
  setPortableItemCarriedState,
  setPortableItemDetachedState,
  setPortableItemMapState,
  type PortableItemAttachedState,
  type PortableItemBase,
  type PortableItemCarriedState,
  type PortableItemDetachedState,
  type PortableItemMapState,
  type PortableItemStore,
} from "@game-core/impl/portableItems";

type TestPortableState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemAttachedState<"actor">;

interface TestPortableItem extends PortableItemBase<"tools", TestPortableState> {}

interface TestPortableStore extends PortableItemStore<TestPortableItem> {}

function createStore(): TestPortableStore {
  return {
    portableItems: [],
    nextPortableItemSerial: 1,
  };
}

describe("portableItems", () => {
  it("supports carried, detached, attached, and map lifecycle transitions", () => {
    const store = createStore();
    const item = createPortableItem(store, (serial): TestPortableItem => ({
      serial,
      tileId: 71,
      inventorySlot: "tools",
      state: { mode: "carried" },
    }));

    setPortableItemAttachedState(item, "actor", 9);
    expect(findPortableAttachedItem(store.portableItems, "tools", "actor", 9)?.serial).toBe(item.serial);
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

  it("supports serial lookup and destruction", () => {
    const store = createStore();
    const item = createPortableItem(store, (serial): TestPortableItem => ({
      serial,
      tileId: 40,
      inventorySlot: "tools",
      state: { mode: "map", pos: 3, z: 1 },
    }));

    expect(findPortableItemBySerial(store.portableItems, item.serial)?.tileId).toBe(40);
    destroyPortableItem(store, item.serial);
    expect(findPortableItemBySerial(store.portableItems, item.serial)).toBeUndefined();
  });
});
