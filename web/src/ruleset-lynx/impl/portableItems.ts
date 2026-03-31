import type { EngineMapCell, EngineState } from "@game-core/api/model";
import {
  cloneBowlingBallState,
  createStillBowlingBallState,
  setBowlingBallMode,
  type BowlingBallState,
} from "@game-core/impl/bowlingBall";
import {
  PORTABLE_ITEM_MOB_OCCUPANCY_POLICY,
  clonePetCarrierState,
  createPetCarrierState,
  isPetCarrierCaptureEligibleFamilyId,
  isSpecialItemClassFamilyId,
  petCarrierHasOccupant,
  petCarrierMobOccupancyPolicy,
  type PetCarrierState,
  type PortableItemMobOccupancyPolicy,
} from "@game-core/impl/petCarrier";
import {
  createPortableItemFamilyDefinition,
  collectPortableItemsFromLayers,
  findPortableItemBySerial,
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
import type { MsPetCarrierLoadEntry } from "@ruleset-ms/api/level";
import {
  type LynxActorFamilyId,
  lookupLynxActorFamilyRegistration,
} from "@ruleset-lynx/impl/elements/actors/registration";
import {
  lookupLynxPortableItemFamilyRegistrationByTileId,
} from "@ruleset-lynx/impl/portableItemRegistration";
import { MS_DIRECTION, MS_TILE, isMsStaticBlockTile, msStaticBlockActorId } from "@ruleset-ms/api/tiles";

export interface LynxPrimedToolDrop extends PortableItemDropProjection {}

export type LynxToolInventoryProjection = PortableToolInventoryProjection;
type LynxPortableInventorySlot = "tools";
type LynxPortableItemBase<TFamily extends LynxPortableItemFamily = LynxPortableItemFamily> = PortableItemBase<
  TFamily,
  LynxPortableInventorySlot,
  LynxPortableItemState
>;
type LynxPlainPortableItemFamily = Exclude<LynxPortableItemFamily, "bowling-ball" | "pet-carrier">;

export type LynxPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemAttachedState<"actor">;

type LynxStandardPortableToolItem<TFamily extends LynxPlainPortableItemFamily = LynxPlainPortableItemFamily> = LynxPortableItemBase<TFamily> & {
  bowlingBallState?: undefined;
  petCarrierState?: undefined;
};

export type LynxPlainPortableItem = LynxStandardPortableToolItem<LynxPlainPortableItemFamily>;

export type LynxPetCarrierPortableItem = LynxPortableItemBase<"pet-carrier"> & {
  bowlingBallState?: undefined;
  petCarrierState: PetCarrierState;
};

export type LynxBowlingBallPortableItem = LynxPortableItemBase<"bowling-ball"> & {
  bowlingBallState: BowlingBallState;
  petCarrierState?: undefined;
};

export type LynxPortableItem = LynxPlainPortableItem | LynxPetCarrierPortableItem | LynxBowlingBallPortableItem;

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

export type LynxPetCarrierOccupantFamilyId = LynxActorFamilyId | LynxPortableItemFamily;

type LynxStandardPortableItemFamily = Exclude<LynxPortableItemFamily, "bowling-ball" | "pet-carrier">;

function createLynxPortableMapItem(
  args: {
    serial: number;
    family: LynxPortableItemFamily;
    tileId: number;
    inventorySlot: LynxPortableInventorySlot;
    pos: number;
    z: number;
    petCarrierOccupant?: MsPetCarrierLoadEntry["occupant"];
  },
): LynxPortableItem {
  const state = {
    mode: "map",
    pos: args.pos,
    z: args.z,
  } as const;

  switch (args.family) {
    case "bowling-ball":
      return {
        serial: args.serial,
        family: "bowling-ball",
        tileId: args.tileId,
        inventorySlot: args.inventorySlot,
        bowlingBallState: createStillBowlingBallState(),
        state,
      };
    case "pet-carrier":
      return {
        serial: args.serial,
        family: "pet-carrier",
        tileId: args.tileId,
        inventorySlot: args.inventorySlot,
        petCarrierState: createPetCarrierState({
          occupant: args.petCarrierOccupant ?? null,
        }),
        state,
      };
    default:
      return {
        serial: args.serial,
        family: args.family as LynxPlainPortableItemFamily,
        tileId: args.tileId,
        inventorySlot: args.inventorySlot,
        state,
      };
  }
}

export function cloneLynxPortableItem(item: LynxPlainPortableItem, serial?: number): LynxPlainPortableItem;
export function cloneLynxPortableItem(item: LynxPetCarrierPortableItem, serial?: number): LynxPetCarrierPortableItem;
export function cloneLynxPortableItem(item: LynxBowlingBallPortableItem, serial?: number): LynxBowlingBallPortableItem;
export function cloneLynxPortableItem(item: LynxPortableItem, serial?: number): LynxPortableItem;
export function cloneLynxPortableItem(item: LynxPortableItem, serial = item.serial): LynxPortableItem {
  const state = { ...item.state };
  switch (item.family) {
    case "bowling-ball":
      return {
        ...item,
        serial,
        state,
        bowlingBallState: cloneBowlingBallState(item.bowlingBallState),
      };
    case "pet-carrier":
      return {
        ...item,
        serial,
        state,
        petCarrierState: clonePetCarrierState(item.petCarrierState),
      };
    default:
      return {
        ...item,
        serial,
        state,
      };
  }
}

export function lynxPetCarrierOccupantFamilyId(tileId: number): LynxPetCarrierOccupantFamilyId | null {
  const actorId = isMsStaticBlockTile(tileId) ? msStaticBlockActorId(tileId) : null;
  const actorFamily = lookupLynxActorFamilyRegistration(actorId ?? tileId)?.familyId ?? null;
  return actorFamily ?? lookupLynxPortableItemFamilyRegistrationByTileId(tileId)?.familyId ?? null;
}

export function isLynxSpecialItemClassTileId(tileId: number): boolean {
  return isSpecialItemClassFamilyId(lynxPetCarrierOccupantFamilyId(tileId));
}

export function isLynxPetCarrierCaptureEligibleTileId(tileId: number): boolean {
  return isPetCarrierCaptureEligibleFamilyId(lynxPetCarrierOccupantFamilyId(tileId));
}

export function isLynxPetCarrierPortableItem(
  item: LynxPortableItem | null | undefined,
): item is LynxPetCarrierPortableItem {
  return item?.family === "pet-carrier" && item.petCarrierState !== undefined;
}

export function lynxPortableItemMobOccupancyPolicy(
  item: LynxPortableItem | null | undefined,
  actorId: number,
): PortableItemMobOccupancyPolicy {
  if (!isLynxPetCarrierPortableItem(item)) {
    return PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default;
  }

  return petCarrierMobOccupancyPolicy(
    lynxPetCarrierOccupantFamilyId(actorId),
    petCarrierHasOccupant(item.petCarrierState),
  );
}

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

function createLynxPetCarrierPortableItemPolicy(): PortableItemFamilyPolicy<
  "pet-carrier",
  "tools",
  LynxPortableItemState,
  LynxPetCarrierPortableItem,
  LynxToolInventoryProjection
> {
  return {
    family: "pet-carrier",
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
      petCarrierState: createPetCarrierState(),
      state: { mode: "carried" },
    }),
    createMapItem: ({ serial, family, inventorySlot, tileId, pos, z }) => ({
      serial,
      family,
      tileId,
      inventorySlot,
      petCarrierState: createPetCarrierState(),
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

function createLynxStandardPortableItemDefinition<TFamily extends LynxStandardPortableItemFamily>(
  family: TFamily,
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

function createLynxPetCarrierPortableItemDefinition(): LynxPortableToolDefinition {
  const policy = createLynxPetCarrierPortableItemPolicy();
  return createPortableItemFamilyDefinition<
    "pet-carrier",
    "tools",
    LynxPortableItemState,
    LynxPetCarrierPortableItem,
    LynxToolInventoryProjection,
    LynxPortableItemSettleContext
  >(
    policy,
    {
      settleDrop: (item, context) => settleLynxPortableItemDrop(item, context),
      cloneItem: (item, serial) => cloneLynxPortableItem(item, serial),
    },
    {
      applyAction1: () => false,
    },
  ) as unknown as LynxPortableToolDefinition;
}

function createLynxBowlingBallPortableItemDefinition(): LynxPortableToolDefinition {
  const policy = createLynxBowlingBallPortableItemPolicy();
  return createPortableItemFamilyDefinition<
    "bowling-ball",
    "tools",
    LynxPortableItemState,
    LynxBowlingBallPortableItem,
    LynxToolInventoryProjection,
    LynxPortableItemSettleContext
  >(
    policy,
    {
      settleDrop: (item, context) => settleLynxPortableItemDrop(item, context),
      activateItem: (item) => {
        setBowlingBallMode(item.bowlingBallState, "moving");
      },
      detachItemToMap: (item) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      detachItemToDrop: (item) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      cloneItem: (item, serial) => cloneLynxPortableItem(item, serial),
    },
    {
      applyAction1: ({ carried, chipDir, hasPrimedDrop, throwMovingItem }) => {
        if (hasPrimedDrop || chipDir === MS_DIRECTION.none) {
          return false;
        }
        return throwMovingItem(carried, chipDir);
      },
    },
  ) as unknown as LynxPortableToolDefinition;
}

const LYNX_PORTABLE_ITEM_FAMILIES = {
  sandbag: createLynxStandardPortableItemDefinition("sandbag", ({ primeDrop }) => primeDrop()),
  hook: createLynxStandardPortableItemDefinition("hook", () => false),
  "pet-carrier": createLynxPetCarrierPortableItemDefinition(),
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
  petCarrierOccupantsByPosition?: ReadonlyMap<string, MsPetCarrierLoadEntry["occupant"]>,
): LynxPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    identifyLynxPortableItem,
    ({ serial, family, tileId, inventorySlot, pos, z }): LynxPortableItem =>
      createLynxPortableMapItem({
        serial,
        family,
        tileId,
        inventorySlot,
        pos,
        z,
        petCarrierOccupant: petCarrierOccupantsByPosition?.get(`${z}:${pos}`),
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
