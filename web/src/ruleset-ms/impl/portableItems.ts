import type { EngineMapCell } from "@game-core/api/model";
import { bottomTile, pushBoardTile, replaceTopTile, topTile } from "@game-core/impl/board";
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
  pendingPortableItemForFamily,
  primePortableItemFamilyDrop,
  primedPortableItemForFamily,
  projectPortableItemFamilyState,
  queuePortableItemFamilyReplacement,
  reconcilePortableItemFamilyProjection,
  settlePortableItemFamilyDrop,
  type PortableItemBase,
  type PortableItemAttachedState,
  type PortableItemCarriedState,
  type PortableItemDropProjection,
  type PortableItemDetachedState,
  type PortableItemFamilyDescriptor,
  type PortableItemFamilyPolicy,
  type PortableItemMapState,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msInventorySlot, msIsOverlayFloorTile, msPortableItemFamily } from "@ruleset-ms/impl/catalog";

export interface MsPrimedToolDrop extends PortableItemDropProjection {}

export type MsToolInventoryProjection = PortableToolInventoryProjection;
type MsPortableItemFamily = NonNullable<ReturnType<typeof msPortableItemFamily>>;
type MsPortableInventorySlot = "tools";

export type MsPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemDetachedState<"pending-primed">
  | PortableItemAttachedState<"actor">;

export interface MsPortableItem extends PortableItemBase<MsPortableItemFamily, MsPortableInventorySlot, MsPortableItemState> {}

export interface MsPortableToolStateStore extends PortableItemStore<MsPortableItem> {
  primedToolDrop: MsPrimedToolDrop | null;
  pendingToolDropAfterSettle: MsPrimedToolDrop | null;
}

function identifyMsPortableItem(tileId: number): PortableItemFamilyDescriptor<MsPortableItemFamily, MsPortableInventorySlot> | null {
  const family = msPortableItemFamily(tileId);
  const inventorySlot = msInventorySlot(tileId);
  if (!family || inventorySlot !== "tools") {
    return null;
  }
  return {
    family,
    inventorySlot,
  };
}

const MS_SANDBAG_PORTABLE_ITEM_POLICY: PortableItemFamilyPolicy<
  "sandbag",
  "tools",
  MsPortableItemState,
  MsPortableItem,
  MsToolInventoryProjection
> = {
  family: "sandbag",
  inventorySlot: "tools",
  attachmentKind: "actor",
  primedMode: "primed",
  pendingPrimedMode: "pending-primed",
  displacedMode: ({ hasActivePrimedItem }) => (hasActivePrimedItem ? "pending-primed" : "primed"),
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

function carriedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return carriedPortableItemForFamily(store, MS_SANDBAG_PORTABLE_ITEM_POLICY);
}

export function primedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return primedPortableItemForFamily(store, MS_SANDBAG_PORTABLE_ITEM_POLICY);
}

function pendingPrimedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return pendingPortableItemForFamily(store, MS_SANDBAG_PORTABLE_ITEM_POLICY);
}

function msPortableMapToolItemAt(
  store: MsPortableToolStateStore,
  tileId: number,
  pos: number,
  z: number,
): MsPortableItem | undefined {
  return mapPortableItemForFamilyAt(store, MS_SANDBAG_PORTABLE_ITEM_POLICY, tileId, pos, z);
}

export function collectMsPortableItemsFromLayers(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
): MsPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    identifyMsPortableItem,
    ({ serial, family, tileId, inventorySlot, pos, z }): MsPortableItem => ({
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

export function projectMsPortableToolState(store: MsPortableToolStateStore, inventory: MsToolInventoryProjection): void {
  const projection = projectPortableItemFamilyState(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY);
  store.primedToolDrop = projection.primedDrop;
  store.pendingToolDropAfterSettle = projection.pendingPrimedDrop;
}

export function reconcileMsPortableToolProjection(store: MsPortableToolStateStore, inventory: MsToolInventoryProjection): void {
  const projection = reconcilePortableItemFamilyProjection(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY);
  store.primedToolDrop = projection.primedDrop;
  store.pendingToolDropAfterSettle = projection.pendingPrimedDrop;
}

export function clearMsToolInventory(store: MsPortableToolStateStore, inventory: MsToolInventoryProjection): void {
  const projection = clearPortableItemFamilyInventory(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY);
  store.primedToolDrop = projection.primedDrop;
  store.pendingToolDropAfterSettle = projection.pendingPrimedDrop;
}

export function primeMsToolDrop(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  pos: number,
  z: number,
): boolean {
  const primed = primePortableItemFamilyDrop(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY, pos, z);
  projectMsPortableToolState(store, inventory);
  return primed;
}

export function queueMsToolInventoryReplacement(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  tileId: number,
  pos: number,
  z: number,
): void {
  queuePortableItemFamilyReplacement(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY, tileId, pos, z);
  projectMsPortableToolState(store, inventory);
}

export function activateMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const activated = activatePortableItemFamily(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY, serial, actorSerial);
  projectMsPortableToolState(store, inventory);
  return activated;
}

export function findMsPortableToolAttachedToActor(
  store: MsPortableToolStateStore,
  actorSerial: number,
): MsPortableItem | undefined {
  return findPortableItemFamilyAttachedToActor(store, MS_SANDBAG_PORTABLE_ITEM_POLICY, actorSerial);
}

export function detachMsPortableToolToMap(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
): boolean {
  const detached = detachPortableItemFamilyToMap(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY, serial, pos, z);
  projectMsPortableToolState(store, inventory);
  return detached;
}

export function detachMsPortableToolToDrop(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
  mode: "primed" | "pending-primed" = "primed",
): boolean {
  const detached = detachPortableItemFamilyToDrop(
    store,
    inventory,
    MS_SANDBAG_PORTABLE_ITEM_POLICY,
    serial,
    pos,
    z,
    mode,
  );
  projectMsPortableToolState(store, inventory);
  return detached;
}

export function destroyMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
): boolean {
  const destroyed = destroyPortableItemFamily(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY, serial);
  projectMsPortableToolState(store, inventory);
  return destroyed;
}

function msFloorAt(cells: EngineMapCell[], pos: number): number {
  const top = topTile(cells, pos);
  if (!msIsOverlayFloorTile(top.id)) {
    return top.id;
  }
  const bottom = bottomTile(cells, pos);
  if (!msIsOverlayFloorTile(bottom.id)) {
    return bottom.id;
  }
  return MS_TILE.Empty;
}

function replaceMsSettledSandbagWater(cells: EngineMapCell[], pos: number): boolean {
  const cell = cells[pos];
  if (!cell || msFloorAt(cells, pos) !== MS_TILE.Water) {
    return false;
  }

  if (cell.top.id === MS_TILE.Water) {
    replaceTopTile(cells, pos, { ...cell.top, id: MS_TILE.Dirt });
    return true;
  }

  if (cell.bottom.id === MS_TILE.Water) {
    cell.bottom = { ...cell.bottom, id: MS_TILE.Dirt };
    return true;
  }

  return false;
}

export function settleMsPrimedToolDrop(
  cells: EngineMapCell[],
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  pos: number,
  z: number,
): void {
  settlePortableItemFamilyDrop(store, inventory, MS_SANDBAG_PORTABLE_ITEM_POLICY, pos, z, (primed) => {
    if (primed.tileId === MS_TILE.Sandbag && replaceMsSettledSandbagWater(cells, pos)) {
      return "destroyed";
    }

    pushBoardTile(cells, pos, { id: primed.tileId, state: 0 });
    return "mapped";
  });
  projectMsPortableToolState(store, inventory);
}
