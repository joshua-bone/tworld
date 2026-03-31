import type { EngineMapCell, EngineState } from "@game-core/api/model";
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
import { replaceTopTile } from "@game-core/impl/board";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import type { LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";
import {
  lookupLynxPortableItemFamilyRegistrationByTileId,
} from "@ruleset-lynx/impl/portableItemRegistration";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxPrimedToolDrop extends PortableItemDropProjection {}

export type LynxToolInventoryProjection = PortableToolInventoryProjection;
type LynxPortableInventorySlot = "tools";

export type LynxPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemAttachedState<"actor">;

export interface LynxPortableItem extends PortableItemBase<LynxPortableItemFamily, LynxPortableInventorySlot, LynxPortableItemState> {
  bowlingBallState?: BowlingBallState;
}

export interface LynxBowlingBallPortableItem
  extends PortableItemBase<"bowling-ball", LynxPortableInventorySlot, LynxPortableItemState> {
  bowlingBallState: BowlingBallState;
}

export interface LynxPortableToolStateStore extends PortableItemStore<LynxPortableItem> {
  primedToolDrop: LynxPrimedToolDrop | null;
}

export type LynxRunWithLayer = <T>(z: number, run: () => T) => T;

type LynxPortableToolDefinition = PortableItemFamilyDefinition<
  LynxPortableItemFamily,
  "tools",
  LynxPortableItemState,
  LynxPortableItem,
  LynxToolInventoryProjection,
  LynxPortableItemSettleContext
>;

function identifyLynxPortableItem(tileId: number): PortableItemFamilyDescriptor<LynxPortableItemFamily, LynxPortableInventorySlot> | null {
  const familyRegistration = lookupLynxPortableItemFamilyRegistrationByTileId(tileId);
  if (!familyRegistration) {
    return null;
  }
  return {
    family: familyRegistration.familyId,
    inventorySlot: familyRegistration.inventorySlot,
  };
}

type LynxStandardPortableItemFamily = Exclude<LynxPortableItemFamily, "bowling-ball">;

function createLynxPortableItemPolicy<TFamily extends LynxStandardPortableItemFamily>(
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

function createLynxBowlingBallPortableItemPolicy(): PortableItemFamilyPolicy<
  "bowling-ball",
  "tools",
  LynxPortableItemState,
  LynxBowlingBallPortableItem,
  LynxToolInventoryProjection
> {
  return {
    family: "bowling-ball",
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

interface LynxPortableItemSettleContext {
  state: EngineState;
  pos: number;
  z: number;
  withLayer: LynxRunWithLayer;
}

export function sanitizeLynxPortableUnderlyingTile(tile: EngineMapCell["top"]): EngineMapCell["top"] {
  return {
    ...tile,
    state: tile.state & ~(LYNX_CELL_FLAG.Claimed | LYNX_CELL_FLAG.Animated),
  };
}

function settleLynxPortableItemDrop(
  item: LynxPortableItem,
  context: LynxPortableItemSettleContext,
): PortableItemSettleResult {
  return context.withLayer(context.z, () => {
    if (item.family === "sandbag" && replaceLynxSettledSandbagWater(context.state, context.pos)) {
      return "destroyed" as const;
    }

    const cell = context.state.map.cells[context.pos];
    if (!cell) {
      return "destroyed" as const;
    }

    cell.bottom = sanitizeLynxPortableUnderlyingTile(cell.top);
    cell.top = { id: item.tileId, state: 0 };
    return "mapped" as const;
  });
}

function createLynxStandardPortableItemDefinition(
  family: LynxStandardPortableItemFamily,
  applyAction1: LynxPortableToolDefinition["applyAction1"],
): LynxPortableToolDefinition {
  const policy = createLynxPortableItemPolicy(family);
  return createPortableItemFamilyDefinition(
    policy,
    {
      settleDrop: settleLynxPortableItemDrop,
    },
    {
      applyAction1,
    },
  );
}

function createLynxBowlingBallPortableItemDefinition(): LynxPortableToolDefinition {
  const policy = createLynxBowlingBallPortableItemPolicy();
  return createPortableItemFamilyDefinition(
    policy,
    {
      settleDrop: settleLynxPortableItemDrop,
      activateItem: (item: LynxBowlingBallPortableItem) => {
        setBowlingBallMode(item.bowlingBallState, "moving");
      },
      detachItemToMap: (item: LynxBowlingBallPortableItem) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      detachItemToDrop: (item: LynxBowlingBallPortableItem) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      cloneItem: (item: LynxBowlingBallPortableItem, serial) => ({
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
  ) as LynxPortableToolDefinition;
}

const LYNX_PORTABLE_ITEM_FAMILIES = {
  sandbag: createLynxStandardPortableItemDefinition("sandbag", ({ primeDrop }) => primeDrop()),
  hook: createLynxStandardPortableItemDefinition("hook", () => false),
  "pet-carrier": createLynxStandardPortableItemDefinition("pet-carrier", () => false),
  "bowling-ball": createLynxBowlingBallPortableItemDefinition(),
} as const satisfies Record<LynxPortableItemFamily, LynxPortableToolDefinition>;

export function lynxPortableItemDefinitionForFamily(family: LynxPortableItemFamily): LynxPortableToolDefinition {
  return LYNX_PORTABLE_ITEM_FAMILIES[family];
}

function lynxPortableItemPolicyForFamily(
  family: LynxPortableItemFamily,
): PortableItemFamilyPolicy<
  LynxPortableItemFamily,
  "tools",
  LynxPortableItemState,
  PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
  LynxToolInventoryProjection
> {
  return lynxPortableItemDefinitionForFamily(family).policy;
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

function lynxPortableItemLifecycleForFamily(
  family: LynxPortableItemFamily,
): PortableItemFamilyLifecycle<
  LynxPortableItemFamily,
  "tools",
  LynxPortableItemState,
  PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
  LynxToolInventoryProjection,
  LynxPortableItemSettleContext
> {
  return lynxPortableItemDefinitionForFamily(family).lifecycle;
}

function lynxPortableItemLifecycleForTileId(
  tileId: number,
): PortableItemFamilyLifecycle<
  LynxPortableItemFamily,
  "tools",
  LynxPortableItemState,
  PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
  LynxToolInventoryProjection,
  LynxPortableItemSettleContext
> | null {
  const family = lookupLynxPortableItemFamilyRegistrationByTileId(tileId)?.familyId;
  return family ? lynxPortableItemLifecycleForFamily(family) : null;
}

function lynxPortableItemLifecycleForSerial(
  store: LynxPortableToolStateStore,
  serial: number,
): PortableItemFamilyLifecycle<
  LynxPortableItemFamily,
  "tools",
  LynxPortableItemState,
  PortableItemBase<LynxPortableItemFamily, "tools", LynxPortableItemState>,
  LynxToolInventoryProjection,
  LynxPortableItemSettleContext
> | null {
  const item = findPortableItemBySerial(store.portableItems, serial);
  return item ? lynxPortableItemLifecycleForFamily(item.family) : null;
}

export function carriedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return store.portableItems.find((item) => item.state.mode === "carried");
}

export function primedLynxPortableToolItem(store: LynxPortableToolStateStore): LynxPortableItem | undefined {
  return store.portableItems.find((item) => item.state.mode === "primed");
}

export function isLynxBowlingBallPortableItem(
  item: LynxPortableItem | null | undefined,
): item is LynxBowlingBallPortableItem {
  return item?.family === "bowling-ball" && !!item.bowlingBallState;
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

export function collectLynxPortableItemsFromLayers(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
): LynxPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    identifyLynxPortableItem,
    ({ serial, family, tileId, inventorySlot, pos, z }): LynxPortableItem =>
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
      lynxPortableItemLifecycleForFamily(carried.family).destroy(store, inventory, carried.serial);
    }
    projectLynxPortableToolState(store, inventory);
    return;
  }

  const lifecycle = lynxPortableItemLifecycleForTileId(projectedTileId);
  if (!lifecycle) {
    if (carried) {
      lynxPortableItemLifecycleForFamily(carried.family).destroy(store, inventory, carried.serial);
    } else {
      inventory.tools = [0];
    }
    projectLynxPortableToolState(store, inventory);
    return;
  }
  lifecycle.reconcileProjection(store, inventory);
  projectLynxPortableToolState(store, inventory);
}

export function clearLynxToolInventory(store: LynxPortableToolStateStore, inventory: LynxToolInventoryProjection): void {
  const carried = carriedLynxPortableToolItem(store);
  if (carried) {
    lynxPortableItemLifecycleForFamily(carried.family).clearInventory(store, inventory);
  } else {
    projectLynxPortableToolState(store, inventory);
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

  const primed = lynxPortableItemLifecycleForFamily(carried.family).primeDrop(store, inventory, pos, z);
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
  const lifecycle = lynxPortableItemLifecycleForTileId(tileId);
  if (!lifecycle) {
    return;
  }
  lifecycle.queueReplacement(store, inventory, tileId, pos, z);
  projectLynxPortableToolState(store, inventory);
}

export function activateLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const lifecycle = lynxPortableItemLifecycleForSerial(store, serial);
  const activated = lifecycle ? lifecycle.activateToActor(store, inventory, serial, actorSerial) : false;
  projectLynxPortableToolState(store, inventory);
  return activated;
}

export function attachLynxPortableToolToActor(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
  actorSerial: number,
): boolean {
  const lifecycle = lynxPortableItemLifecycleForSerial(store, serial);
  const attached = lifecycle ? lifecycle.attachToActor(store, inventory, serial, actorSerial) : false;
  projectLynxPortableToolState(store, inventory);
  return attached;
}

export function carryLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
): boolean {
  const lifecycle = lynxPortableItemLifecycleForSerial(store, serial);
  const carried = lifecycle ? lifecycle.carry(store, inventory, serial) : false;
  projectLynxPortableToolState(store, inventory);
  return carried;
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
  const lifecycle = lynxPortableItemLifecycleForSerial(store, serial);
  const detached = lifecycle ? lifecycle.detachToMap(store, inventory, serial, pos, z) : false;
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
  const lifecycle = lynxPortableItemLifecycleForSerial(store, serial);
  const detached = lifecycle ? lifecycle.detachToDrop(store, inventory, serial, pos, z) : false;
  projectLynxPortableToolState(store, inventory);
  return detached;
}

export function destroyLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
): boolean {
  const lifecycle = lynxPortableItemLifecycleForSerial(store, serial);
  const destroyed = lifecycle ? lifecycle.destroy(store, inventory, serial) : false;
  projectLynxPortableToolState(store, inventory);
  return destroyed;
}

export function cloneLynxPortableTool(
  store: LynxPortableToolStateStore,
  inventory: LynxToolInventoryProjection,
  serial: number,
): LynxPortableItem | undefined {
  const lifecycle = lynxPortableItemLifecycleForSerial(store, serial);
  const cloned = lifecycle?.clone(store, inventory, serial) as LynxPortableItem | undefined;
  projectLynxPortableToolState(store, inventory);
  return cloned;
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
  if (!primed) {
    return;
  }
  lynxPortableItemLifecycleForFamily(primed.family).settleDrop(store, inventory, pos, z, {
    state,
    pos,
    z,
    withLayer,
  });
  projectLynxPortableToolState(store, inventory);
}
