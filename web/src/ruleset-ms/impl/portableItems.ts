import type { EngineMapCell } from "@game-core/api/model";
import { bottomTile, pushBoardTile, replaceTopTile, topTile } from "@game-core/impl/board";
import {
  cloneBowlingBallState,
  createStillBowlingBallState,
  setBowlingBallMode,
  type BowlingBallState,
} from "@game-core/impl/bowlingBall";
import {
  createPetCarrierCooldownState,
  PORTABLE_ITEM_MOB_OCCUPANCY_POLICY,
  clonePetCarrierState,
  createPetCarrierState,
  isPetCarrierCaptureEligibleFamilyId,
  petCarrierCooldownActive,
  isSpecialItemClassFamilyId,
  petCarrierHasOccupant,
  petCarrierMobOccupancyPolicy,
  tickPetCarrierCooldownState,
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
import { MS_DIRECTION, MS_TILE, isMsStaticBlockTile, msStaticBlockActorId } from "@ruleset-ms/api/tiles";
import type { MsPetCarrierLoadEntry } from "@ruleset-ms/api/level";
import { msIsOverlayFloorTile } from "@ruleset-ms/impl/catalog";
import type { MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";
import {
  type MsActorFamilyId,
  lookupMsActorFamilyRegistration,
} from "@ruleset-ms/impl/elements/actors/registration";
import {
  lookupMsPortableItemFamilyRegistrationByTileId,
} from "@ruleset-ms/impl/portableItemRegistration";

export interface MsPrimedToolDrop extends PortableItemDropProjection {}

export type MsToolInventoryProjection = PortableToolInventoryProjection;
type MsPortableInventorySlot = "tools";
type MsPortableItemBase<TFamily extends MsPortableItemFamily = MsPortableItemFamily> = PortableItemBase<
  TFamily,
  MsPortableInventorySlot,
  MsPortableItemState
>;
type MsPlainPortableItemFamily = Exclude<MsPortableItemFamily, "bowling-ball" | "pet-carrier">;

export type MsPortableItemState =
  | PortableItemMapState
  | PortableItemCarriedState
  | PortableItemDetachedState<"primed">
  | PortableItemDetachedState<"pending-primed">
  | PortableItemAttachedState<"actor">;

type MsStandardPortableToolItem<TFamily extends MsPlainPortableItemFamily = MsPlainPortableItemFamily> = MsPortableItemBase<TFamily> & {
  bowlingBallState?: undefined;
  petCarrierState?: undefined;
};

export type MsPlainPortableItem = MsStandardPortableToolItem<MsPlainPortableItemFamily>;

export type MsPetCarrierPortableItem = MsPortableItemBase<"pet-carrier"> & {
  bowlingBallState?: undefined;
  petCarrierState: PetCarrierState;
};

export type MsBowlingBallPortableItem = MsPortableItemBase<"bowling-ball"> & {
  bowlingBallState: BowlingBallState;
  petCarrierState?: undefined;
};

export type MsPortableItem = MsPlainPortableItem | MsPetCarrierPortableItem | MsBowlingBallPortableItem;

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
  if (!familyRegistration) {
    return null;
  }
  return {
    family: familyRegistration.familyId,
    inventorySlot: familyRegistration.inventorySlot,
  };
}

export type MsPetCarrierOccupantFamilyId = MsActorFamilyId | MsPortableItemFamily;

type MsStandardPortableItemFamily = Exclude<MsPortableItemFamily, "bowling-ball" | "pet-carrier">;

function createMsPortableMapItem(
  args: {
    serial: number;
    family: MsPortableItemFamily;
    tileId: number;
    inventorySlot: MsPortableInventorySlot;
    pos: number;
    z: number;
    petCarrierOccupant?: MsPetCarrierLoadEntry["occupant"];
  },
): MsPortableItem {
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
        family: args.family as MsPlainPortableItemFamily,
        tileId: args.tileId,
        inventorySlot: args.inventorySlot,
        state,
      };
  }
}

export function cloneMsPortableItem(item: MsPlainPortableItem, serial?: number): MsPlainPortableItem;
export function cloneMsPortableItem(item: MsPetCarrierPortableItem, serial?: number): MsPetCarrierPortableItem;
export function cloneMsPortableItem(item: MsBowlingBallPortableItem, serial?: number): MsBowlingBallPortableItem;
export function cloneMsPortableItem(item: MsPortableItem, serial?: number): MsPortableItem;
export function cloneMsPortableItem(item: MsPortableItem, serial = item.serial): MsPortableItem {
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

export function msPetCarrierOccupantFamilyId(tileId: number): MsPetCarrierOccupantFamilyId | null {
  const actorId = isMsStaticBlockTile(tileId) ? msStaticBlockActorId(tileId) : null;
  const actorFamily = lookupMsActorFamilyRegistration(actorId ?? tileId)?.familyId ?? null;
  return actorFamily ?? lookupMsPortableItemFamilyRegistrationByTileId(tileId)?.familyId ?? null;
}

export function isMsSpecialItemClassTileId(tileId: number): boolean {
  return isSpecialItemClassFamilyId(msPetCarrierOccupantFamilyId(tileId));
}

export function isMsPetCarrierCaptureEligibleTileId(tileId: number): boolean {
  return isPetCarrierCaptureEligibleFamilyId(msPetCarrierOccupantFamilyId(tileId));
}

export function isMsPetCarrierPortableItem(
  item: MsPortableItem | null | undefined,
): item is MsPetCarrierPortableItem {
  return item?.family === "pet-carrier" && item.petCarrierState !== undefined;
}

export function msPortableItemMobOccupancyPolicy(
  item: MsPortableItem | null | undefined,
  actorId: number,
): PortableItemMobOccupancyPolicy {
  if (!isMsPetCarrierPortableItem(item)) {
    return PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default;
  }

  return petCarrierMobOccupancyPolicy(
    msPetCarrierOccupantFamilyId(actorId),
    petCarrierHasOccupant(item.petCarrierState),
  );
}

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

function createMsPetCarrierPortableItemPolicy(): PortableItemFamilyPolicy<
  "pet-carrier",
  "tools",
  MsPortableItemState,
  MsPetCarrierPortableItem,
  MsToolInventoryProjection
> {
  return {
    family: "pet-carrier",
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

function createMsStandardPortableItemDefinition<TFamily extends MsStandardPortableItemFamily>(
  family: TFamily,
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

function createMsPetCarrierPortableItemDefinition(): MsPortableToolDefinition {
  const policy = createMsPetCarrierPortableItemPolicy();
  return createPortableItemFamilyDefinition<
    "pet-carrier",
    "tools",
    MsPortableItemState,
    MsPetCarrierPortableItem,
    MsToolInventoryProjection,
    MsPortableItemSettleContext
  >(
    policy,
    {
      settleDrop: (item, context) => settleMsPortableItemDrop(item, context),
      cloneItem: (item, serial) => cloneMsPortableItem(item, serial),
    },
    {
      applyAction1: ({ carried, chipDir, snatchFacingMob }) => {
        if (chipDir === MS_DIRECTION.none || petCarrierHasOccupant(carried.petCarrierState) || petCarrierCooldownActive(carried.petCarrierState)) {
          return false;
        }

        const snapshot = snatchFacingMob?.() ?? null;
        if (!snapshot) {
          return false;
        }

        carried.petCarrierState.occupant = snapshot;
        carried.petCarrierState.cooldown = createPetCarrierCooldownState("after-snatch");
        return true;
      },
    },
  ) as unknown as MsPortableToolDefinition;
}

function createMsBowlingBallPortableItemDefinition(): MsPortableToolDefinition {
  const policy = createMsBowlingBallPortableItemPolicy();
  return createPortableItemFamilyDefinition<
    "bowling-ball",
    "tools",
    MsPortableItemState,
    MsBowlingBallPortableItem,
    MsToolInventoryProjection,
    MsPortableItemSettleContext
  >(
    policy,
    {
      settleDrop: (item, context) => settleMsPortableItemDrop(item, context),
      activateItem: (item) => {
        setBowlingBallMode(item.bowlingBallState, "moving");
      },
      detachItemToMap: (item) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      detachItemToDrop: (item) => {
        setBowlingBallMode(item.bowlingBallState, "still");
      },
      cloneItem: (item, serial) => cloneMsPortableItem(item, serial),
    },
    {
      applyAction1: ({ carried, chipDir, hasPrimedDrop, throwMovingItem }) => {
        if (hasPrimedDrop || chipDir === MS_DIRECTION.none) {
          return false;
        }
        return throwMovingItem(carried, chipDir);
      },
    },
  ) as unknown as MsPortableToolDefinition;
}

const MS_PORTABLE_ITEM_FAMILIES = {
  sandbag: createMsStandardPortableItemDefinition("sandbag", ({ primeDrop }) => primeDrop()),
  hook: createMsStandardPortableItemDefinition("hook", () => false),
  "pet-carrier": createMsPetCarrierPortableItemDefinition(),
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
  petCarrierOccupantsByPosition?: ReadonlyMap<string, MsPetCarrierLoadEntry["occupant"]>,
): MsPortableItem[] {
  return collectPortableItemsFromLayers(
    layers,
    identifyMsPortableItem,
    ({ serial, family, tileId, inventorySlot, pos, z }): MsPortableItem =>
      createMsPortableMapItem({
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

export function tickMsPetCarrierCooldowns(store: MsPortableToolStateStore): void {
  for (const item of store.portableItems) {
    if (item.family !== "pet-carrier") {
      continue;
    }
    tickPetCarrierCooldownState(item.petCarrierState);
  }
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
