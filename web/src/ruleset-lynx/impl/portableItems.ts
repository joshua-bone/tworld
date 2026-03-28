import type { EngineMapCell, EngineState } from "@game-core/api/model";
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
  type PortableItemDropProjection,
  type PortableItemLocatedState,
  type PortableItemMapState,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";
import { replaceTopTile } from "@game-core/impl/board";
import { lynxInventorySlot } from "@ruleset-lynx/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxPrimedToolDrop extends PortableItemDropProjection {}

export type LynxToolInventoryProjection = PortableToolInventoryProjection;

export type LynxPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemLocatedState<"primed">;

export interface LynxPortableItem extends PortableItemBase<"tools", LynxPortableItemState> {}

export interface LynxPortableToolStateStore extends PortableItemStore<LynxPortableItem> {
  primedToolDrop: LynxPrimedToolDrop | null;
}

export type LynxRunWithLayer = <T>(z: number, run: () => T) => T;

function carriedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return findPortableItemByMode(store.portableItems, "tools", "carried");
}

export function primedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return findPortableItemByMode(store.portableItems, "tools", "primed");
}

function lynxPortableMapToolItemAt(
  store: LynxPortableToolStateStore,
  tileId: number,
  pos: number,
  z: number,
): LynxPortableItem | undefined {
  return findPortableMapItemAt(store.portableItems, "tools", tileId, pos, z);
}

function createLynxCarriedPortableToolItem(store: LynxPortableToolStateStore, tileId: number): LynxPortableItem {
  return createPortableItem(store, (serial): LynxPortableItem => ({
    serial,
    tileId,
    inventorySlot: "tools",
    state: { mode: "carried" },
  }));
}

export function collectLynxPortableItemsFromLayers(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
): LynxPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    "tools",
    lynxInventorySlot,
    ({ serial, tileId, inventorySlot, pos, z }): LynxPortableItem => ({
      serial,
      tileId,
      inventorySlot,
      state: {
        mode: "map",
        pos,
        z,
      },
    }),
  );
}

export function projectLynxPortableToolState(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
): void {
  projectCarriedPortableToolTile(inventory, carriedLynxPortableToolItem(store));
  store.primedToolDrop = portableItemDropProjection(primedLynxPortableToolItem(store), ["primed"]);
}

export function reconcileLynxPortableToolProjection(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
): void {
  const projectedTileId = inventory.tools[0] ?? 0;
  const carried = carriedLynxPortableToolItem(store);
  if (projectedTileId === 0) {
    if (carried) {
      removePortableItem(store, carried.serial);
    }
    projectLynxPortableToolState(store, inventory);
    return;
  }

  if (carried) {
    carried.tileId = projectedTileId;
  } else {
    createLynxCarriedPortableToolItem(store, projectedTileId);
  }
  projectLynxPortableToolState(store, inventory);
}

export function clearLynxToolInventory(store: LynxPortableToolStateStore, inventory: LynxToolInventoryProjection): void {
  const carried = carriedLynxPortableToolItem(store);
  if (carried) {
    removePortableItem(store, carried.serial);
  }
  projectLynxPortableToolState(store, inventory);
}

export function primeLynxToolDrop(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  pos: number,
  z: number,
): boolean {
  const carried = carriedLynxPortableToolItem(store);
  if (!carried || primedLynxPortableToolItem(store)) {
    return false;
  }

  carried.state = {
    mode: "primed",
    pos,
    z,
  };
  projectLynxPortableToolState(store, inventory);
  return true;
}

export function queueLynxToolInventoryReplacement(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  tileId: number,
  pos: number,
  z: number,
): void {
  let collected = lynxPortableMapToolItemAt(store, tileId, pos, z);
  if (!collected) {
    collected = createPortableItem(store, (serial): LynxPortableItem => ({
      serial,
      tileId,
      inventorySlot: "tools",
      state: {
        mode: "map",
        pos,
        z,
      },
    }));
  }

  const displaced = carriedLynxPortableToolItem(store);
  collected.state = { mode: "carried" };
  if (displaced && displaced.serial !== collected.serial) {
    displaced.state = {
      mode: "primed",
      pos,
      z,
    };
  }
  projectLynxPortableToolState(store, inventory);
}

function replaceLynxSettledSandbagWater(state: EngineState, pos: number): boolean {
  const cell = state.map.cells[pos];
  if (!cell) {
    return false;
  }

  if (cell.top.id === MS_TILE.Water) {
    replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Dirt });
    return true;
  }

  if (cell.bottom.id === MS_TILE.Water) {
    cell.bottom = { ...cell.bottom, id: MS_TILE.Dirt };
    return true;
  }

  return false;
}

export function settleLynxPrimedToolDrop(
  state: EngineState,
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  pos: number,
  z: number,
  withLayer: LynxRunWithLayer,
): void {
  const primed = primedLynxPortableToolItem(store);
  if (!primed || primed.state.mode !== "primed" || primed.state.pos !== pos || primed.state.z !== z) {
    return;
  }

  withLayer(z, () => {
    if (primed.tileId === MS_TILE.Sandbag && replaceLynxSettledSandbagWater(state, pos)) {
      removePortableItem(store, primed.serial);
      return;
    }

    const cell = state.map.cells[pos];
    if (!cell) {
      return;
    }

    primed.state = {
      mode: "map",
      pos,
      z,
    };
    cell.bottom = { ...cell.top };
    cell.top = { id: primed.tileId, state: 0 };
  });
  projectLynxPortableToolState(store, inventory);
}
