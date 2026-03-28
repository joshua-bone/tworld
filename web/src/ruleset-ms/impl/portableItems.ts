import type { EngineMapCell } from "@game-core/api/model";
import { bottomTile, pushBoardTile, replaceTopTile, topTile } from "@game-core/impl/board";
import {
  collectPortableItemsFromLayers,
  createPortableItem,
  destroyPortableItem,
  findPortableAttachedItem,
  findPortableItemByMode,
  findPortableItemBySerial,
  findPortableMapItemAt,
  portableItemDropProjection,
  projectCarriedPortableToolTile,
  setPortableItemAttachedState,
  setPortableItemCarriedState,
  setPortableItemDetachedState,
  setPortableItemMapState,
  type PortableItemBase,
  type PortableItemAttachedState,
  type PortableItemCarriedState,
  type PortableItemDropProjection,
  type PortableItemDetachedState,
  type PortableItemLocatedState,
  type PortableItemMapState,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msInventorySlot, msIsOverlayFloorTile } from "@ruleset-ms/impl/catalog";

export interface MsPrimedToolDrop extends PortableItemDropProjection {}

export type MsToolInventoryProjection = PortableToolInventoryProjection;

export type MsPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemDetachedState<"pending-primed">
  | PortableItemAttachedState<"actor">;

export interface MsPortableItem extends PortableItemBase<"tools", MsPortableItemState> {}

export interface MsPortableToolStateStore extends PortableItemStore<MsPortableItem> {
  primedToolDrop: MsPrimedToolDrop | null;
  pendingToolDropAfterSettle: MsPrimedToolDrop | null;
}

function carriedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return findPortableItemByMode(store.portableItems, "tools", "carried");
}

export function primedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return findPortableItemByMode(store.portableItems, "tools", "primed");
}

function pendingPrimedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return findPortableItemByMode(store.portableItems, "tools", "pending-primed");
}

function msPortableMapToolItemAt(
  store: MsPortableToolStateStore,
  tileId: number,
  pos: number,
  z: number,
): MsPortableItem | undefined {
  return findPortableMapItemAt(store.portableItems, "tools", tileId, pos, z);
}

function createMsCarriedPortableToolItem(store: MsPortableToolStateStore, tileId: number): MsPortableItem {
  return createPortableItem(store, (serial): MsPortableItem => ({
    serial,
    tileId,
    inventorySlot: "tools",
    state: { mode: "carried" },
  }));
}

export function collectMsPortableItemsFromLayers(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
): MsPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    "tools",
    msInventorySlot,
    ({ serial, tileId, inventorySlot, pos, z }): MsPortableItem => ({
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

export function projectMsPortableToolState(store: MsPortableToolStateStore, inventory: MsToolInventoryProjection): void {
  projectCarriedPortableToolTile(inventory, carriedMsPortableToolItem(store));
  store.primedToolDrop = portableItemDropProjection(primedMsPortableToolItem(store), ["primed"]);
  store.pendingToolDropAfterSettle = portableItemDropProjection(pendingPrimedMsPortableToolItem(store), ["pending-primed"]);
}

export function reconcileMsPortableToolProjection(store: MsPortableToolStateStore, inventory: MsToolInventoryProjection): void {
  const projectedTileId = inventory.tools[0] ?? 0;
  const carried = carriedMsPortableToolItem(store);
  if (projectedTileId === 0) {
    if (carried) {
      destroyPortableItem(store, carried.serial);
    }
    projectMsPortableToolState(store, inventory);
    return;
  }

  if (carried) {
    carried.tileId = projectedTileId;
  } else {
    createMsCarriedPortableToolItem(store, projectedTileId);
  }
  projectMsPortableToolState(store, inventory);
}

export function clearMsToolInventory(store: MsPortableToolStateStore, inventory: MsToolInventoryProjection): void {
  const carried = carriedMsPortableToolItem(store);
  if (carried) {
    destroyPortableItem(store, carried.serial);
  }
  projectMsPortableToolState(store, inventory);
}

export function primeMsToolDrop(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  pos: number,
  z: number,
): boolean {
  const carried = carriedMsPortableToolItem(store);
  if (!carried || primedMsPortableToolItem(store)) {
    return false;
  }

  setPortableItemDetachedState(carried, "primed", pos, z);
  projectMsPortableToolState(store, inventory);
  return true;
}

export function queueMsToolInventoryReplacement(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  tileId: number,
  pos: number,
  z: number,
): void {
  let collected = msPortableMapToolItemAt(store, tileId, pos, z);
  if (!collected) {
    collected = createPortableItem(store, (serial): MsPortableItem => ({
      serial,
      tileId,
      inventorySlot: "tools",
      state: { mode: "map", pos, z },
    }));
  }

  const displaced = carriedMsPortableToolItem(store);
  setPortableItemCarriedState(collected);
  if (displaced && displaced.serial !== collected.serial) {
    setPortableItemDetachedState(displaced, primedMsPortableToolItem(store) ? "pending-primed" : "primed", pos, z);
  }
  projectMsPortableToolState(store, inventory);
}

export function activateMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  setPortableItemAttachedState(item, "actor", actorSerial);
  projectMsPortableToolState(store, inventory);
  return true;
}

export function findMsPortableToolAttachedToActor(
  store: MsPortableToolStateStore,
  actorSerial: number,
): MsPortableItem | undefined {
  return findPortableAttachedItem(store.portableItems, "tools", "actor", actorSerial);
}

export function detachMsPortableToolToMap(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  setPortableItemMapState(item, pos, z);
  projectMsPortableToolState(store, inventory);
  return true;
}

export function detachMsPortableToolToDrop(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
  mode: "primed" | "pending-primed" = "primed",
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  setPortableItemDetachedState(item, mode, pos, z);
  projectMsPortableToolState(store, inventory);
  return true;
}

export function destroyMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  destroyPortableItem(store, serial);
  projectMsPortableToolState(store, inventory);
  return true;
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
  const primed = primedMsPortableToolItem(store);
  if (!primed || primed.state.mode !== "primed" || primed.state.pos !== pos || primed.state.z !== z) {
    return;
  }

  if (primed.tileId === MS_TILE.Sandbag && replaceMsSettledSandbagWater(cells, pos)) {
    destroyPortableItem(store, primed.serial);
  } else {
    setPortableItemMapState(primed, pos, z);
    pushBoardTile(cells, pos, { id: primed.tileId, state: 0 });
  }

  const pendingReplacement = pendingPrimedMsPortableToolItem(store);
  if (pendingReplacement && pendingReplacement.state.mode === "pending-primed") {
    setPortableItemDetachedState(pendingReplacement, "primed", pendingReplacement.state.pos, pendingReplacement.state.z);
  }
  projectMsPortableToolState(store, inventory);
}
