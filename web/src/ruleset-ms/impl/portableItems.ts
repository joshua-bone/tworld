import type { EngineMapCell } from "@game-core/api/model";
import { bottomTile, pushBoardTile, replaceTopTile, topTile } from "@game-core/impl/board";
import {
  collectPortableItemsFromLayers,
  createPortableItem,
  destroyPortableItem,
  findPortableItemBySerial,
  mapPortableItemForFamilyAt,
  setPortableItemAttachedState,
  setPortableItemCarriedState,
  setPortableItemDetachedState,
  setPortableItemMapState,
  type PortableItemAttachedState,
  type PortableItemBase,
  type PortableItemCarriedState,
  type PortableItemDetachedState,
  type PortableItemDropProjection,
  type PortableItemFamilyDescriptor,
  type PortableItemFamilyPolicy,
  type PortableItemMapState,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msIsOverlayFloorTile } from "@ruleset-ms/impl/catalog";
import type { MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";
import {
  lookupMsPortableItemFamilyRegistrationByTileId,
  lookupMsTerrainPickupTileRegistration,
} from "@ruleset-ms/impl/elementRegistration";

export interface MsPrimedToolDrop extends PortableItemDropProjection {}

export type MsToolInventoryProjection = PortableToolInventoryProjection;
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
  const familyRegistration = lookupMsPortableItemFamilyRegistrationByTileId(tileId);
  const inventorySlot = lookupMsTerrainPickupTileRegistration(tileId)?.inventorySlot;
  const family = familyRegistration?.familyId;
  if (!family || inventorySlot !== "tools") {
    return null;
  }
  return {
    family,
    inventorySlot,
  };
}

function createMsPortableItemPolicy<TFamily extends MsPortableItemFamily>(
  family: TFamily,
): PortableItemFamilyPolicy<
  TFamily,
  "tools",
  MsPortableItemState,
  PortableItemBase<TFamily, "tools", MsPortableItemState>,
  MsToolInventoryProjection
> {
  return {
    family,
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
    createCarriedItem: ({ serial, family: itemFamily, inventorySlot, tileId }) => ({
      serial,
      family: itemFamily,
      tileId,
      inventorySlot,
      state: { mode: "carried" },
    }),
    createMapItem: ({ serial, family: itemFamily, inventorySlot, tileId, pos, z }) => ({
      serial,
      family: itemFamily,
      tileId,
      inventorySlot,
      state: {
        mode: "map",
        pos,
        z,
      },
    }),
  };
}

const MS_PORTABLE_ITEM_POLICIES = {
  sandbag: createMsPortableItemPolicy("sandbag"),
  hook: createMsPortableItemPolicy("hook"),
} as const satisfies Record<
  MsPortableItemFamily,
  PortableItemFamilyPolicy<
    MsPortableItemFamily,
    "tools",
    MsPortableItemState,
    PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
    MsToolInventoryProjection
  >
>;

function msPortableItemPolicyForFamily(
  family: MsPortableItemFamily,
): PortableItemFamilyPolicy<
  MsPortableItemFamily,
  "tools",
  MsPortableItemState,
  PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
  MsToolInventoryProjection
> {
  return MS_PORTABLE_ITEM_POLICIES[family];
}

function msPortableItemPolicyForTileId(
  tileId: number,
): PortableItemFamilyPolicy<
  MsPortableItemFamily,
  "tools",
  MsPortableItemState,
  PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
  MsToolInventoryProjection
> | null {
  const family = lookupMsPortableItemFamilyRegistrationByTileId(tileId)?.familyId;
  return family ? msPortableItemPolicyForFamily(family) : null;
}

function carriedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return store.portableItems.find((item) => item.state.mode === "carried");
}

export function primedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return store.portableItems.find((item) => item.state.mode === "primed");
}

function pendingPrimedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
  return store.portableItems.find((item) => item.state.mode === "pending-primed");
}

function projectMsDrop(item: MsPortableItem | undefined, mode: "primed" | "pending-primed"): MsPrimedToolDrop | null {
  if (!item || item.state.mode !== mode) {
    return null;
  }

  return {
    tileId: item.tileId,
    pos: item.state.pos,
    z: item.state.z,
  };
}

function msPortableItemLocation(item: MsPortableItem | undefined): { pos: number; z: number } | null {
  if (!item) {
    return null;
  }

  if (item.state.mode === "map" || item.state.mode === "primed" || item.state.mode === "pending-primed") {
    return {
      pos: item.state.pos,
      z: item.state.z,
    };
  }

  return null;
}

function createMsPortableCarriedItem(
  store: MsPortableToolStateStore,
  policy: PortableItemFamilyPolicy<
    MsPortableItemFamily,
    "tools",
    MsPortableItemState,
    PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
    MsToolInventoryProjection
  >,
  tileId: number,
): MsPortableItem {
  return createPortableItem(store, (serial) =>
    policy.createCarriedItem({
      serial,
      family: policy.family,
      inventorySlot: policy.inventorySlot,
      tileId,
    }),
  );
}

function createMsPortableMapItem(
  store: MsPortableToolStateStore,
  policy: PortableItemFamilyPolicy<
    MsPortableItemFamily,
    "tools",
    MsPortableItemState,
    PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
    MsToolInventoryProjection
  >,
  tileId: number,
  pos: number,
  z: number,
): MsPortableItem {
  return createPortableItem(store, (serial) =>
    policy.createMapItem({
      serial,
      family: policy.family,
      inventorySlot: policy.inventorySlot,
      tileId,
      pos,
      z,
    }),
  );
}

function msPortableMapToolItemAt(
  store: MsPortableToolStateStore,
  tileId: number,
  pos: number,
  z: number,
): MsPortableItem | undefined {
  const policy = msPortableItemPolicyForTileId(tileId);
  if (!policy) {
    return undefined;
  }
  return mapPortableItemForFamilyAt(store, policy, tileId, pos, z);
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
  inventory.tools = [carriedMsPortableToolItem(store)?.tileId ?? 0];
  store.primedToolDrop = projectMsDrop(primedMsPortableToolItem(store), "primed");
  store.pendingToolDropAfterSettle = projectMsDrop(pendingPrimedMsPortableToolItem(store), "pending-primed");
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

  const policy = msPortableItemPolicyForTileId(projectedTileId);
  if (!policy) {
    if (carried) {
      destroyPortableItem(store, carried.serial);
    }
    inventory.tools = [0];
    projectMsPortableToolState(store, inventory);
    return;
  }

  if (carried) {
    carried.family = policy.family;
    carried.inventorySlot = policy.inventorySlot;
    carried.tileId = projectedTileId;
  } else {
    createMsPortableCarriedItem(store, policy, projectedTileId);
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

  const policy = msPortableItemPolicyForFamily(carried.family);
  setPortableItemDetachedState(carried, policy.primedMode, pos, z);
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
  const policy = msPortableItemPolicyForTileId(tileId);
  if (!policy) {
    return;
  }

  let collected = msPortableMapToolItemAt(store, tileId, pos, z);
  if (!collected) {
    collected = createMsPortableMapItem(store, policy, tileId, pos, z);
  }

  const displaced = carriedMsPortableToolItem(store);
  setPortableItemCarriedState(collected);

  if (displaced && displaced.serial !== collected.serial) {
    const displacedPolicy = msPortableItemPolicyForFamily(displaced.family);
    setPortableItemDetachedState(
      displaced,
      displacedPolicy.displacedMode({
        hasActivePrimedItem: primedMsPortableToolItem(store) !== undefined,
      }),
      pos,
      z,
    );
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

  const policy = msPortableItemPolicyForFamily(item.family);
  setPortableItemAttachedState(item, policy.attachmentKind, actorSerial);
  projectMsPortableToolState(store, inventory);
  return true;
}

export function findMsPortableToolAttachedToActor(
  store: MsPortableToolStateStore,
  actorSerial: number,
): MsPortableItem | undefined {
  return store.portableItems.find(
    (item) =>
      item.state.mode === "attached" &&
      item.state.attachmentKind === "actor" &&
      item.state.attachmentId === actorSerial,
  );
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
  const primedLocation = msPortableItemLocation(primed);
  if (!primed || !primedLocation || primedLocation.pos !== pos || primedLocation.z !== z) {
    return;
  }

  const destroyed = primed.tileId === MS_TILE.Sandbag && replaceMsSettledSandbagWater(cells, pos);
  if (destroyed) {
    destroyPortableItem(store, primed.serial);
  } else {
    pushBoardTile(cells, pos, { id: primed.tileId, state: 0 });
    setPortableItemMapState(primed, pos, z);
  }

  const pending = pendingPrimedMsPortableToolItem(store);
  const pendingLocation = msPortableItemLocation(pending);
  if (pending) {
    const pendingPolicy = msPortableItemPolicyForFamily(pending.family);
    setPortableItemDetachedState(
      pending,
      pendingPolicy.primedMode,
      pendingLocation?.pos ?? pos,
      pendingLocation?.z ?? z,
    );
  }

  projectMsPortableToolState(store, inventory);
}
