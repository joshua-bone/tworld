import type { EngineMapCell, EngineState } from "@game-core/api/model";
import {
  activatePortableItemFamily,
  carriedPortableItemForFamily,
  clearPortableItemFamilyInventory,
  collectPortableItemsFromLayers,
  destroyPortableItemFamily,
  detachPortableItemFamilyToDrop,
  detachPortableItemFamilyToMap,
  findPortableItemFamilyAttachedToActor,
  mapPortableItemForFamilyAt,
  primePortableItemFamilyDrop,
  primedPortableItemForFamily,
  projectPortableItemFamilyState,
  queuePortableItemFamilyReplacement,
  reconcilePortableItemFamilyProjection,
  settlePortableItemFamilyDrop,
  type PortableItemBase,
  type PortableItemAttachedState,
  type PortableItemCarriedState,
  type PortableItemDetachedState,
  type PortableItemDropProjection,
  type PortableItemFamilyDescriptor,
  type PortableItemFamilyPolicy,
  type PortableItemMapState,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";
import { replaceTopTile } from "@game-core/impl/board";
import { lynxInventorySlot, lynxPortableItemFamily } from "@ruleset-lynx/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxPrimedToolDrop extends PortableItemDropProjection {}

export type LynxToolInventoryProjection = PortableToolInventoryProjection;
type LynxPortableItemFamily = NonNullable<ReturnType<typeof lynxPortableItemFamily>>;
type LynxPortableInventorySlot = "tools";

export type LynxPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemAttachedState<"actor">;

export interface LynxPortableItem extends PortableItemBase<LynxPortableItemFamily, LynxPortableInventorySlot, LynxPortableItemState> {}

export interface LynxPortableToolStateStore extends PortableItemStore<LynxPortableItem> {
  primedToolDrop: LynxPrimedToolDrop | null;
}

export type LynxRunWithLayer = <T>(z: number, run: () => T) => T;

function identifyLynxPortableItem(tileId: number): PortableItemFamilyDescriptor<LynxPortableItemFamily, LynxPortableInventorySlot> | null {
  const family = lynxPortableItemFamily(tileId);
  const inventorySlot = lynxInventorySlot(tileId);
  if (!family || inventorySlot !== "tools") {
    return null;
  }
  return {
    family,
    inventorySlot,
  };
}

const LYNX_SANDBAG_PORTABLE_ITEM_POLICY: PortableItemFamilyPolicy<
  "sandbag",
  "tools",
  LynxPortableItemState,
  LynxPortableItem,
  LynxToolInventoryProjection
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
    state: {
      mode: "map",
      pos,
      z,
    },
  }),
};

function carriedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return carriedPortableItemForFamily(store, LYNX_SANDBAG_PORTABLE_ITEM_POLICY);
}

export function primedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return primedPortableItemForFamily(store, LYNX_SANDBAG_PORTABLE_ITEM_POLICY);
}

function lynxPortableMapToolItemAt(
  store: LynxPortableToolStateStore,
  tileId: number,
  pos: number,
  z: number,
): LynxPortableItem | undefined {
  return mapPortableItemForFamilyAt(store, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, tileId, pos, z);
}

export function collectLynxPortableItemsFromLayers(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
): LynxPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    identifyLynxPortableItem,
    ({ serial, family, tileId, inventorySlot, pos, z }): LynxPortableItem => ({
      serial,
      family,
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
  const projection = projectPortableItemFamilyState(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY);
  store.primedToolDrop = projection.primedDrop;
}

export function reconcileLynxPortableToolProjection(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
): void {
  const projection = reconcilePortableItemFamilyProjection(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY);
  store.primedToolDrop = projection.primedDrop;
}

export function clearLynxToolInventory(store: LynxPortableToolStateStore, inventory: LynxToolInventoryProjection): void {
  const projection = clearPortableItemFamilyInventory(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY);
  store.primedToolDrop = projection.primedDrop;
}

export function primeLynxToolDrop(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  pos: number,
  z: number,
): boolean {
  const primed = primePortableItemFamilyDrop(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, pos, z);
  projectLynxPortableToolState(store, inventory);
  return primed;
}

export function queueLynxToolInventoryReplacement(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  tileId: number,
  pos: number,
  z: number,
): void {
  queuePortableItemFamilyReplacement(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, tileId, pos, z);
  projectLynxPortableToolState(store, inventory);
}

export function activateLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const activated = activatePortableItemFamily(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, serial, actorSerial);
  projectLynxPortableToolState(store, inventory);
  return activated;
}

export function findLynxPortableToolAttachedToActor(
  store: LynxPortableToolStateStore,
  actorSerial: number,
): LynxPortableItem | undefined {
  return findPortableItemFamilyAttachedToActor(store, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, actorSerial);
}

export function detachLynxPortableToolToMap(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
): boolean {
  const detached = detachPortableItemFamilyToMap(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, serial, pos, z);
  projectLynxPortableToolState(store, inventory);
  return detached;
}

export function detachLynxPortableToolToDrop(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
): boolean {
  const detached = detachPortableItemFamilyToDrop(
    store,
    inventory,
    LYNX_SANDBAG_PORTABLE_ITEM_POLICY,
    serial,
    pos,
    z,
  );
  projectLynxPortableToolState(store, inventory);
  return detached;
}

export function destroyLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
): boolean {
  const destroyed = destroyPortableItemFamily(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, serial);
  projectLynxPortableToolState(store, inventory);
  return destroyed;
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
  settlePortableItemFamilyDrop(store, inventory, LYNX_SANDBAG_PORTABLE_ITEM_POLICY, pos, z, (primed) =>
    withLayer(z, () => {
      if (primed.tileId === MS_TILE.Sandbag && replaceLynxSettledSandbagWater(state, pos)) {
        return "destroyed";
      }

      const cell = state.map.cells[pos];
      if (!cell) {
        return "destroyed";
      }

      cell.bottom = { ...cell.top };
      cell.top = { id: primed.tileId, state: 0 };
      return "mapped";
    }),
  );
  projectLynxPortableToolState(store, inventory);
}
