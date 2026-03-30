import type { EngineMapCell } from "@game-core/api/model";
import { bottomTile, pushBoardTile, replaceTopTile, topTile } from "@game-core/impl/board";
import {
  cloneBowlingBallState,
  createStillBowlingBallState,
  setBowlingBallMode,
  type BowlingBallState,
} from "@game-core/impl/bowlingBall";
import {
  createPortableItemFamilyDefinition,
  collectPortableItemsFromLayers,
  createPortableItem,
  findPortableItemBySerial,
  mapPortableItemForFamilyAt,
  type PortableItemAttachedState,
  type PortableItemBase,
  type PortableItemCarriedState,
  type PortableItemDetachedState,
  type PortableItemDropProjection,
  type PortableItemFamilyDescriptor,
  type PortableItemFamilyDefinition,
  type PortableItemFamilyLifecycle,
  type PortableItemFamilyPolicy,
  type PortableItemMapState,
  type PortableItemSettleResult,
  type PortableItemStore,
  type PortableToolInventoryProjection,
} from "@game-core/impl/portableItems";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
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

export interface MsPortableItem extends PortableItemBase<MsPortableItemFamily, MsPortableInventorySlot, MsPortableItemState> {
  bowlingBallState?: BowlingBallState;
}

interface MsBowlingBallPortableItem
  extends PortableItemBase<"bowling-ball", MsPortableInventorySlot, MsPortableItemState> {
  bowlingBallState: BowlingBallState;
}

export interface MsPortableToolStateStore extends PortableItemStore<MsPortableItem> {
  primedToolDrop: MsPrimedToolDrop | null;
  pendingToolDropAfterSettle: MsPrimedToolDrop | null;
}

type MsPortableToolDefinition = PortableItemFamilyDefinition<
  MsPortableItemFamily,
  "tools",
  MsPortableItemState,
  MsPortableItem,
  MsToolInventoryProjection,
  MsPortableItemSettleContext
>;

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

type MsStandardPortableItemFamily = Exclude<MsPortableItemFamily, "bowling-ball">;

function createMsPortableItemPolicy<TFamily extends MsStandardPortableItemFamily>(
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

function createMsBowlingBallPortableItemPolicy(): PortableItemFamilyPolicy<
  "bowling-ball",
  "tools",
  MsPortableItemState,
  MsBowlingBallPortableItem,
  MsToolInventoryProjection
> {
  return {
    family: "bowling-ball",
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
      bowlingBallState: createStillBowlingBallState(),
      state: { mode: "carried" },
    }),
    createMapItem: ({ serial, family, inventorySlot, tileId, pos, z }) => ({
      serial,
      family,
      tileId,
      inventorySlot,
      bowlingBallState: createStillBowlingBallState(),
      state: {
        mode: "map",
        pos,
        z,
      },
    }),
  };
}

interface MsPortableItemSettleContext {
  cells: EngineMapCell[];
  pos: number;
}

function settleMsPortableItemDrop(item: MsPortableItem, context: MsPortableItemSettleContext): PortableItemSettleResult {
  if (item.family === "sandbag" && replaceMsSettledSandbagWater(context.cells, context.pos)) {
    return "destroyed";
  }

  pushBoardTile(context.cells, context.pos, { id: item.tileId, state: 0 });
  return "mapped";
}

function createMsStandardPortableItemDefinition(
  family: MsStandardPortableItemFamily,
  applyAction1: MsPortableToolDefinition["applyAction1"],
): MsPortableToolDefinition {
  const policy = createMsPortableItemPolicy(family);
  return createPortableItemFamilyDefinition(
    policy,
    {
      settleDrop: settleMsPortableItemDrop,
    },
    {
      applyAction1,
    },
  );
}

function createMsBowlingBallPortableItemDefinition(): MsPortableToolDefinition {
  const policy = createMsBowlingBallPortableItemPolicy();
  return createPortableItemFamilyDefinition(
    policy,
    {
      settleDrop: settleMsPortableItemDrop,
      activateItem: (item: MsBowlingBallPortableItem) => {
        setBowlingBallMode(item.bowlingBallState, "moving");
      },
      detachItemToMap: (item: MsBowlingBallPortableItem) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      detachItemToDrop: (item: MsBowlingBallPortableItem) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      cloneItem: (item: MsBowlingBallPortableItem, serial) => ({
        ...item,
        serial,
        state: { ...item.state },
        bowlingBallState: cloneBowlingBallState(item.bowlingBallState),
      }),
    },
    {
      applyAction1: ({ carried, chipDir, hasPrimedDrop, throwMovingItem }) => {
        if (hasPrimedDrop || chipDir === MS_DIRECTION.none) {
          return false;
        }
        return throwMovingItem(carried, chipDir);
      },
    },
  ) as MsPortableToolDefinition;
}

const MS_PORTABLE_ITEM_FAMILIES = {
  sandbag: createMsStandardPortableItemDefinition("sandbag", ({ primeDrop }) => primeDrop()),
  hook: createMsStandardPortableItemDefinition("hook", () => false),
  "bowling-ball": createMsBowlingBallPortableItemDefinition(),
} as const satisfies Record<MsPortableItemFamily, MsPortableToolDefinition>;

export function msPortableItemDefinitionForFamily(family: MsPortableItemFamily): MsPortableToolDefinition {
  return MS_PORTABLE_ITEM_FAMILIES[family];
}

function msPortableItemPolicyForFamily(
  family: MsPortableItemFamily,
): PortableItemFamilyPolicy<
  MsPortableItemFamily,
  "tools",
  MsPortableItemState,
  PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
  MsToolInventoryProjection
> {
  return msPortableItemDefinitionForFamily(family).policy;
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

function msPortableItemLifecycleForFamily(
  family: MsPortableItemFamily,
): PortableItemFamilyLifecycle<
  MsPortableItemFamily,
  "tools",
  MsPortableItemState,
  PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
  MsToolInventoryProjection,
  MsPortableItemSettleContext
> {
  return msPortableItemDefinitionForFamily(family).lifecycle;
}

function msPortableItemLifecycleForTileId(
  tileId: number,
): PortableItemFamilyLifecycle<
  MsPortableItemFamily,
  "tools",
  MsPortableItemState,
  PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
  MsToolInventoryProjection,
  MsPortableItemSettleContext
> | null {
  const family = lookupMsPortableItemFamilyRegistrationByTileId(tileId)?.familyId;
  return family ? msPortableItemLifecycleForFamily(family) : null;
}

function msPortableItemLifecycleForSerial(
  store: MsPortableToolStateStore,
  serial: number,
): PortableItemFamilyLifecycle<
  MsPortableItemFamily,
  "tools",
  MsPortableItemState,
  PortableItemBase<MsPortableItemFamily, "tools", MsPortableItemState>,
  MsToolInventoryProjection,
  MsPortableItemSettleContext
> | null {
  const item = findPortableItemBySerial(store.portableItems, serial);
  return item ? msPortableItemLifecycleForFamily(item.family) : null;
}

export function carriedMsPortableToolItem(store: MsPortableToolStateStore): MsPortableItem | undefined {
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

export function collectMsPortableItemsFromLayers(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
): MsPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    identifyMsPortableItem,
    ({ serial, family, tileId, inventorySlot, pos, z }): MsPortableItem =>
      family === "bowling-ball"
        ? {
            serial,
            family,
            tileId,
            inventorySlot,
            bowlingBallState: createStillBowlingBallState(),
            state: {
              mode: "map",
              pos,
              z,
            },
          }
        : {
            serial,
            family,
            tileId,
            inventorySlot,
            state: {
              mode: "map",
              pos,
              z,
            },
          },
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
      msPortableItemLifecycleForFamily(carried.family).destroy(store, inventory, carried.serial);
    }
    projectMsPortableToolState(store, inventory);
    return;
  }

  const lifecycle = msPortableItemLifecycleForTileId(projectedTileId);
  if (!lifecycle) {
    if (carried) {
      msPortableItemLifecycleForFamily(carried.family).destroy(store, inventory, carried.serial);
    } else {
      inventory.tools = [0];
    }
    projectMsPortableToolState(store, inventory);
    return;
  }

  lifecycle.reconcileProjection(store, inventory);
  projectMsPortableToolState(store, inventory);
}

export function clearMsToolInventory(store: MsPortableToolStateStore, inventory: MsToolInventoryProjection): void {
  const carried = carriedMsPortableToolItem(store);
  if (carried) {
    msPortableItemLifecycleForFamily(carried.family).clearInventory(store, inventory);
  } else {
    projectMsPortableToolState(store, inventory);
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

  const primed = msPortableItemLifecycleForFamily(carried.family).primeDrop(store, inventory, pos, z);
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
  const lifecycle = msPortableItemLifecycleForTileId(tileId);
  if (!lifecycle) {
    return;
  }
  lifecycle.queueReplacement(store, inventory, tileId, pos, z);
  projectMsPortableToolState(store, inventory);
}

export function activateMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const lifecycle = msPortableItemLifecycleForSerial(store, serial);
  const activated = lifecycle ? lifecycle.activateToActor(store, inventory, serial, actorSerial) : false;
  projectMsPortableToolState(store, inventory);
  return activated;
}

export function attachMsPortableToolToActor(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const lifecycle = msPortableItemLifecycleForSerial(store, serial);
  const attached = lifecycle ? lifecycle.attachToActor(store, inventory, serial, actorSerial) : false;
  projectMsPortableToolState(store, inventory);
  return attached;
}

export function carryMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
): boolean {
  const lifecycle = msPortableItemLifecycleForSerial(store, serial);
  const carried = lifecycle ? lifecycle.carry(store, inventory, serial) : false;
  projectMsPortableToolState(store, inventory);
  return carried;
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
  const lifecycle = msPortableItemLifecycleForSerial(store, serial);
  const detached = lifecycle ? lifecycle.detachToMap(store, inventory, serial, pos, z) : false;
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
  const lifecycle = msPortableItemLifecycleForSerial(store, serial);
  const detached = lifecycle ? lifecycle.detachToDrop(store, inventory, serial, pos, z, mode) : false;
  projectMsPortableToolState(store, inventory);
  return detached;
}

export function destroyMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
): boolean {
  const lifecycle = msPortableItemLifecycleForSerial(store, serial);
  const destroyed = lifecycle ? lifecycle.destroy(store, inventory, serial) : false;
  projectMsPortableToolState(store, inventory);
  return destroyed;
}

export function cloneMsPortableTool(
  store: MsPortableToolStateStore,
  inventory: MsToolInventoryProjection,
  serial: number,
): MsPortableItem | undefined {
  const lifecycle = msPortableItemLifecycleForSerial(store, serial);
  const cloned = lifecycle?.clone(store, inventory, serial) as MsPortableItem | undefined;
  projectMsPortableToolState(store, inventory);
  return cloned;
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
  const primedAtLocation = store.portableItems.filter(
    (item): item is MsPortableItem =>
      item.state.mode === "primed" && item.state.pos === pos && item.state.z === z,
  );
  if (primedAtLocation.length === 0) {
    return;
  }

  for (const item of primedAtLocation) {
    msPortableItemLifecycleForFamily(item.family).settleDrop(store, inventory, pos, z, { cells, pos });
  }
  projectMsPortableToolState(store, inventory);
}
