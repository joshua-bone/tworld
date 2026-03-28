import type { EngineMapCell, EngineState } from "@game-core/api/model";
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
import { replaceTopTile } from "@game-core/impl/board";
import type { LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";
import {
  lookupLynxPortableItemFamilyRegistrationByTileId,
  lookupLynxTerrainPickupTileRegistration,
} from "@ruleset-lynx/impl/elementRegistration";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxPrimedToolDrop extends PortableItemDropProjection {}

export type LynxToolInventoryProjection = PortableToolInventoryProjection;
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
  const familyRegistration = lookupLynxPortableItemFamilyRegistrationByTileId(tileId);
  const inventorySlot = lookupLynxTerrainPickupTileRegistration(tileId)?.inventorySlot;
  const family = familyRegistration?.familyId;
  if (!family || inventorySlot !== "tools") {
    return null;
  }
  return {
    family,
    inventorySlot,
  };
}

function createLynxPortableItemPolicy<TFamily extends LynxPortableItemFamily>(
  family: TFamily,
): PortableItemFamilyPolicy<
  TFamily,
  "tools",
  LynxPortableItemState,
  PortableItemBase<TFamily, "tools", LynxPortableItemState>,
  LynxToolInventoryProjection
> {
  return {
    family,
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

const LYNX_PORTABLE_ITEM_POLICIES = {
  sandbag: createLynxPortableItemPolicy("sandbag"),
  hook: createLynxPortableItemPolicy("hook"),
} as const satisfies Record<
  LynxPortableItemFamily,
  PortableItemFamilyPolicy<
    LynxPortableItemFamily,
    "tools",
    LynxPortableItemState,
    PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
    LynxToolInventoryProjection
  >
>;

function lynxPortableItemPolicyForFamily(
  family: LynxPortableItemFamily,
): PortableItemFamilyPolicy<
  LynxPortableItemFamily,
  "tools",
  LynxPortableItemState,
  PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
  LynxToolInventoryProjection
> {
  return LYNX_PORTABLE_ITEM_POLICIES[family];
}

function lynxPortableItemPolicyForTileId(
  tileId: number,
): PortableItemFamilyPolicy<
  LynxPortableItemFamily,
  "tools",
  LynxPortableItemState,
  PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
  LynxToolInventoryProjection
> | null {
  const family = lookupLynxPortableItemFamilyRegistrationByTileId(tileId)?.familyId;
  return family ? lynxPortableItemPolicyForFamily(family) : null;
}

function carriedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return store.portableItems.find((item) => item.state.mode === "carried");
}

export function primedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return store.portableItems.find((item) => item.state.mode === "primed");
}

function projectLynxDrop(item: LynxPortableItem | undefined): LynxPrimedToolDrop | null {
  if (!item || item.state.mode !== "primed") {
    return null;
  }

  return {
    tileId: item.tileId,
    pos: item.state.pos,
    z: item.state.z,
  };
}

function lynxPortableItemLocation(item: LynxPortableItem | undefined): { pos: number; z: number } | null {
  if (!item) {
    return null;
  }

  if (item.state.mode === "map" || item.state.mode === "primed") {
    return {
      pos: item.state.pos,
      z: item.state.z,
    };
  }

  return null;
}

function createLynxPortableCarriedItem(
  store: LynxPortableToolStateStore,
  policy: PortableItemFamilyPolicy<
    LynxPortableItemFamily,
    "tools",
    LynxPortableItemState,
    PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
    LynxToolInventoryProjection
  >,
  tileId: number,
): LynxPortableItem {
  return createPortableItem(store, (serial) =>
    policy.createCarriedItem({
      serial,
      family: policy.family,
      inventorySlot: policy.inventorySlot,
      tileId,
    }),
  );
}

function createLynxPortableMapItem(
  store: LynxPortableToolStateStore,
  policy: PortableItemFamilyPolicy<
    LynxPortableItemFamily,
    "tools",
    LynxPortableItemState,
    PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
    LynxToolInventoryProjection
  >,
  tileId: number,
  pos: number,
  z: number,
): LynxPortableItem {
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

function lynxPortableMapToolItemAt(
  store: LynxPortableToolStateStore,
  tileId: number,
  pos: number,
  z: number,
): LynxPortableItem | undefined {
  const policy = lynxPortableItemPolicyForTileId(tileId);
  if (!policy) {
    return undefined;
  }
  return mapPortableItemForFamilyAt(store, policy, tileId, pos, z);
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
  inventory.tools = [carriedLynxPortableToolItem(store)?.tileId ?? 0];
  store.primedToolDrop = projectLynxDrop(primedLynxPortableToolItem(store));
}

export function reconcileLynxPortableToolProjection(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
): void {
  const projectedTileId = inventory.tools[0] ?? 0;
  const carried = carriedLynxPortableToolItem(store);

  if (projectedTileId === 0) {
    if (carried) {
      destroyPortableItem(store, carried.serial);
    }
    projectLynxPortableToolState(store, inventory);
    return;
  }

  const policy = lynxPortableItemPolicyForTileId(projectedTileId);
  if (!policy) {
    if (carried) {
      destroyPortableItem(store, carried.serial);
    }
    inventory.tools = [0];
    projectLynxPortableToolState(store, inventory);
    return;
  }

  if (carried) {
    carried.family = policy.family;
    carried.inventorySlot = policy.inventorySlot;
    carried.tileId = projectedTileId;
  } else {
    createLynxPortableCarriedItem(store, policy, projectedTileId);
  }

  projectLynxPortableToolState(store, inventory);
}

export function clearLynxToolInventory(store: LynxPortableToolStateStore, inventory: LynxToolInventoryProjection): void {
  const carried = carriedLynxPortableToolItem(store);
  if (carried) {
    destroyPortableItem(store, carried.serial);
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

  const policy = lynxPortableItemPolicyForFamily(carried.family);
  setPortableItemDetachedState(carried, policy.primedMode, pos, z);
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
  const policy = lynxPortableItemPolicyForTileId(tileId);
  if (!policy) {
    return;
  }

  let collected = lynxPortableMapToolItemAt(store, tileId, pos, z);
  if (!collected) {
    collected = createLynxPortableMapItem(store, policy, tileId, pos, z);
  }

  const displaced = carriedLynxPortableToolItem(store);
  setPortableItemCarriedState(collected);
  if (displaced && displaced.serial !== collected.serial) {
    const displacedPolicy = lynxPortableItemPolicyForFamily(displaced.family);
    setPortableItemDetachedState(
      displaced,
      displacedPolicy.displacedMode({
        hasActivePrimedItem: primedLynxPortableToolItem(store) !== undefined,
      }),
      pos,
      z,
    );
  }

  projectLynxPortableToolState(store, inventory);
}

export function activateLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  const policy = lynxPortableItemPolicyForFamily(item.family);
  setPortableItemAttachedState(item, policy.attachmentKind, actorSerial);
  projectLynxPortableToolState(store, inventory);
  return true;
}

export function findLynxPortableToolAttachedToActor(
  store: LynxPortableToolStateStore,
  actorSerial: number,
): LynxPortableItem | undefined {
  return store.portableItems.find(
    (item) =>
      item.state.mode === "attached" &&
      item.state.attachmentKind === "actor" &&
      item.state.attachmentId === actorSerial,
  );
}

export function detachLynxPortableToolToMap(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  setPortableItemMapState(item, pos, z);
  projectLynxPortableToolState(store, inventory);
  return true;
}

export function detachLynxPortableToolToDrop(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  pos: number,
  z: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  setPortableItemDetachedState(item, "primed", pos, z);
  projectLynxPortableToolState(store, inventory);
  return true;
}

export function destroyLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item) {
    return false;
  }

  destroyPortableItem(store, serial);
  projectLynxPortableToolState(store, inventory);
  return true;
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
  const primedLocation = lynxPortableItemLocation(primed);
  if (!primed || !primedLocation || primedLocation.pos !== pos || primedLocation.z !== z) {
    return;
  }

  const outcome = withLayer(z, () => {
    if (primed.tileId === MS_TILE.Sandbag && replaceLynxSettledSandbagWater(state, pos)) {
      return "destroyed" as const;
    }

    const cell = state.map.cells[pos];
    if (!cell) {
      return "destroyed" as const;
    }

    cell.bottom = { ...cell.top };
    cell.top = { id: primed.tileId, state: 0 };
    return "mapped" as const;
  });

  if (outcome === "destroyed") {
    destroyPortableItem(store, primed.serial);
  } else {
    setPortableItemMapState(primed, pos, z);
  }

  projectLynxPortableToolState(store, inventory);
}
