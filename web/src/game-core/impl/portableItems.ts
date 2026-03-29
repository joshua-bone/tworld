import type { EngineMapCell, ToolInventorySlots } from "@game-core/api/model";

export interface PortableItemLocation {
  pos: number;
  z: number;
}

export interface PortableItemDropProjection extends PortableItemLocation {
  tileId: number;
}

export interface PortableItemMapState extends PortableItemLocation {
  mode: "map";
}

export interface PortableItemCarriedState {
  mode: "carried";
}

export interface PortableItemLocatedState<TMode extends string> extends PortableItemLocation {
  mode: TMode;
}

export type PortableItemDetachedState<TMode extends string> = PortableItemLocatedState<TMode>;

export interface PortableItemAttachedState<TAttachmentKind extends string = string> {
  mode: "attached";
  attachmentKind: TAttachmentKind;
  attachmentId: number;
}

export interface PortableItemBase<TFamily extends string, TInventorySlot extends string, TState extends { mode: string }> {
  serial: number;
  family: TFamily;
  tileId: number;
  inventorySlot: TInventorySlot;
  state: TState;
}

export interface PortableItemStore<TItem> {
  portableItems: TItem[];
  nextPortableItemSerial: number;
}

export interface PortableItemFamilyDescriptor<TFamily extends string, TInventorySlot extends string> {
  family: TFamily;
  inventorySlot: TInventorySlot;
}

export interface PortableToolInventoryProjection {
  tools: ToolInventorySlots;
}

export interface PortableItemInventoryProjectionAdapter<TInventoryProjection> {
  readCarriedTile(inventory: TInventoryProjection): number;
  writeCarriedTile(inventory: TInventoryProjection, tileId: number): void;
}

export interface PortableItemFamilyPolicy<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
> extends PortableItemFamilyDescriptor<TFamily, TInventorySlot> {
  attachmentKind: string;
  primedMode: TState["mode"];
  pendingPrimedMode?: TState["mode"];
  displacedMode(args: { hasActivePrimedItem: boolean }): TState["mode"];
  projection: PortableItemInventoryProjectionAdapter<TInventoryProjection>;
  createCarriedItem(args: {
    serial: number;
    family: TFamily;
    inventorySlot: TInventorySlot;
    tileId: number;
  }): TItem;
  createMapItem(args: {
    serial: number;
    family: TFamily;
    inventorySlot: TInventorySlot;
    tileId: number;
    pos: number;
    z: number;
  }): TItem;
}

export interface PortableItemFamilyProjection {
  primedDrop: PortableItemDropProjection | null;
  pendingPrimedDrop: PortableItemDropProjection | null;
}

export type PortableItemSettleResult = "mapped" | "destroyed";

export interface PortableItemLifecycleHooks<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TSettleContext,
> {
  settleDrop(item: TItem, context: TSettleContext): PortableItemSettleResult;
  activateItem?(item: TItem, actorSerial: number): void;
  detachItemToMap?(item: TItem, pos: number, z: number): void;
  detachItemToDrop?(item: TItem, pos: number, z: number, mode: TState["mode"]): void;
  cloneItem?(item: TItem, serial: number): TItem;
}

export interface PortableItemFamilyLifecycle<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
  TSettleContext,
> {
  readonly policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>;
  project(store: PortableItemStore<PortableItemRecord>, inventory: TInventoryProjection): PortableItemFamilyProjection;
  reconcileProjection(store: PortableItemStore<PortableItemRecord>, inventory: TInventoryProjection): PortableItemFamilyProjection;
  clearInventory(store: PortableItemStore<PortableItemRecord>, inventory: TInventoryProjection): PortableItemFamilyProjection;
  carry(store: PortableItemStore<PortableItemRecord>, inventory: TInventoryProjection, serial: number): boolean;
  primeDrop(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    pos: number,
    z: number,
  ): boolean;
  queueReplacement(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    tileId: number,
    pos: number,
    z: number,
  ): void;
  activateToActor(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    serial: number,
    actorSerial: number,
  ): boolean;
  attachToActor(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    serial: number,
    actorSerial: number,
  ): boolean;
  findAttachedToActor(
    store: PortableItemStore<PortableItemRecord>,
    actorSerial: number,
  ): TItem | undefined;
  detachToMap(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    serial: number,
    pos: number,
    z: number,
  ): boolean;
  detachToDrop(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    serial: number,
    pos: number,
    z: number,
    mode?: TState["mode"],
  ): boolean;
  destroy(store: PortableItemStore<PortableItemRecord>, inventory: TInventoryProjection, serial: number): boolean;
  clone(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    serial: number,
  ): TItem | undefined;
  settleDrop(
    store: PortableItemStore<PortableItemRecord>,
    inventory: TInventoryProjection,
    pos: number,
    z: number,
    context: TSettleContext,
  ): void;
}

type PortableItemRecord = PortableItemBase<string, string, { mode: string }>;

export function collectPortableItemsFromLayers<TFamily extends string, TInventorySlot extends string, TItem>(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
  identifyPortableItem: (tileId: number) => PortableItemFamilyDescriptor<TFamily, TInventorySlot> | null,
  createMapItem: (args: {
    serial: number;
    family: TFamily;
    tileId: number;
    inventorySlot: TInventorySlot;
    pos: number;
    z: number;
  }) => TItem,
): TItem[] {
  const items: TItem[] = [];
  for (const layer of layers) {
    for (const cell of layer.cells) {
      const family = identifyPortableItem(cell.top.id);
      if (!family) {
        continue;
      }
      items.push(
        createMapItem({
          serial: items.length + 1,
          family: family.family,
          tileId: cell.top.id,
          inventorySlot: family.inventorySlot,
          pos: cell.position.pos,
          z: layer.z,
        }),
      );
    }
  }
  return items;
}

export function findPortableItemByMode<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  items: readonly TItem[],
  family: TFamily,
  mode: TState["mode"],
): TItem | undefined {
  return items.find((item) => item.family === family && item.state.mode === mode);
}

export function findPortableMapItemAt<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  items: readonly TItem[],
  family: TFamily,
  tileId: number,
  pos: number,
  z: number,
): TItem | undefined {
  return items.find((item) => {
    if (item.family !== family || item.tileId !== tileId || item.state.mode !== "map") {
      return false;
    }
    const state = item.state as unknown as PortableItemLocation;
    return state.pos === pos && state.z === z;
  });
}

export function createPortableItem<TItem, TStore extends PortableItemStore<TItem>>(
  store: TStore,
  createItem: (serial: number) => TItem,
): TItem {
  const item = createItem(store.nextPortableItemSerial);
  store.nextPortableItemSerial += 1;
  store.portableItems.push(item);
  return item;
}

export function removePortableItem<TItem extends { serial: number }, TStore extends PortableItemStore<TItem>>(
  store: TStore,
  serial: number,
): void {
  store.portableItems = store.portableItems.filter((item) => item.serial !== serial);
}

export function destroyPortableItem<TItem extends { serial: number }, TStore extends PortableItemStore<TItem>>(
  store: TStore,
  serial: number,
): void {
  removePortableItem(store, serial);
}

export function findPortableItemBySerial<TItem extends { serial: number }>(
  items: readonly TItem[],
  serial: number,
): TItem | undefined {
  return items.find((item) => item.serial === serial);
}

export function findPortableAttachedItem<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  items: readonly TItem[],
  family: TFamily,
  attachmentKind: string,
  attachmentId: number,
): TItem | undefined {
  return items.find((item) => {
    if (item.family !== family || item.state.mode !== "attached") {
      return false;
    }
    const state = item.state as unknown as PortableItemAttachedState;
    return state.attachmentKind === attachmentKind && state.attachmentId === attachmentId;
  });
}

export function setPortableItemCarriedState<TItem extends { state: { mode: string } }>(item: TItem): void {
  item.state = { mode: "carried" } as TItem["state"];
}

export function setPortableItemMapState<TItem extends { state: { mode: string } }>(
  item: TItem,
  pos: number,
  z: number,
): void {
  item.state = {
    mode: "map",
    pos,
    z,
  } as TItem["state"];
}

export function setPortableItemDetachedState<TItem extends { state: { mode: string } }>(
  item: TItem,
  mode: string,
  pos: number,
  z: number,
): void {
  item.state = {
    mode,
    pos,
    z,
  } as TItem["state"];
}

export function setPortableItemAttachedState<TItem extends { state: { mode: string } }>(
  item: TItem,
  attachmentKind: string,
  attachmentId: number,
): void {
  item.state = {
    mode: "attached",
    attachmentKind,
    attachmentId,
  } as TItem["state"];
}

export function portableItemDropProjection<TItem extends { tileId: number; state: { mode: string } }>(
  item: TItem | undefined,
  locationModes: readonly TItem["state"]["mode"][],
): PortableItemDropProjection | null {
  if (!item || !locationModes.includes(item.state.mode)) {
    return null;
  }

  const state = item.state as unknown as Partial<PortableItemLocation>;
  if (typeof state.pos !== "number" || typeof state.z !== "number") {
    return null;
  }

  return {
    tileId: item.tileId,
    pos: state.pos,
    z: state.z,
  };
}

export function projectCarriedPortableToolTile<TItem extends { tileId: number }>(
  inventory: PortableToolInventoryProjection,
  carriedItem: TItem | undefined,
): void {
  inventory.tools = [carriedItem?.tileId ?? 0] as ToolInventorySlots;
}

export function carriedPortableItemForFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  store: PortableItemStore<PortableItemRecord>,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, unknown>,
): TItem | undefined {
  return store.portableItems.find(
    (item): item is TItem => item.family === policy.family && item.state.mode === "carried",
  );
}

export function carriedPortableItem(
  store: PortableItemStore<PortableItemRecord>,
): PortableItemRecord | undefined {
  return store.portableItems.find((item) => item.state.mode === "carried");
}

export function primedPortableItemForFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  store: PortableItemStore<PortableItemRecord>,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, unknown>,
): TItem | undefined {
  return store.portableItems.find(
    (item): item is TItem => item.family === policy.family && item.state.mode === policy.primedMode,
  );
}

export function pendingPortableItemForFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  store: PortableItemStore<PortableItemRecord>,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, unknown>,
): TItem | undefined {
  if (!policy.pendingPrimedMode) {
    return undefined;
  }
  return store.portableItems.find(
    (item): item is TItem => item.family === policy.family && item.state.mode === policy.pendingPrimedMode,
  );
}

export function mapPortableItemForFamilyAt<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  store: PortableItemStore<PortableItemRecord>,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, unknown>,
  tileId: number,
  pos: number,
  z: number,
): TItem | undefined {
  return store.portableItems.find((item): item is TItem => {
    if (item.family !== policy.family || item.tileId !== tileId || item.state.mode !== "map") {
      return false;
    }
    const state = item.state as unknown as PortableItemLocation;
    return state.pos === pos && state.z === z;
  });
}

export function projectPortableItemFamilyState<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
): PortableItemFamilyProjection {
  const carried = carriedPortableItemForFamily(store, policy);
  policy.projection.writeCarriedTile(inventory, carried?.tileId ?? 0);
  return {
    primedDrop: portableItemDropProjection(primedPortableItemForFamily(store, policy), [policy.primedMode]),
    pendingPrimedDrop: portableItemDropProjection(
      pendingPortableItemForFamily(store, policy),
      policy.pendingPrimedMode ? [policy.pendingPrimedMode] : [],
    ),
  };
}

export function carryPortableItemFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  serial: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item || item.family !== policy.family) {
    return false;
  }

  setPortableItemCarriedState(item);
  projectPortableItemFamilyState(store, inventory, policy);
  return true;
}

function createCarriedPortableItemForFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  tileId: number,
): TItem {
  const item = policy.createCarriedItem({
    serial: store.nextPortableItemSerial,
    family: policy.family,
    inventorySlot: policy.inventorySlot,
    tileId,
  });
  store.nextPortableItemSerial += 1;
  store.portableItems.push(item);
  return item;
}

function createMapPortableItemForFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  tileId: number,
  pos: number,
  z: number,
): TItem {
  const item = policy.createMapItem({
    serial: store.nextPortableItemSerial,
    family: policy.family,
    inventorySlot: policy.inventorySlot,
    tileId,
    pos,
    z,
  });
  store.nextPortableItemSerial += 1;
  store.portableItems.push(item);
  return item;
}

export function reconcilePortableItemFamilyProjection<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
): PortableItemFamilyProjection {
  const projectedTileId = policy.projection.readCarriedTile(inventory);
  const carried = carriedPortableItem(store);
  if (projectedTileId === 0) {
    if (carried) {
      destroyPortableItem(store, carried.serial);
    }
    return projectPortableItemFamilyState(store, inventory, policy);
  }

  if (carried?.family === policy.family) {
    (carried as TItem).tileId = projectedTileId;
  } else {
    if (carried) {
      destroyPortableItem(store, carried.serial);
    }
    createCarriedPortableItemForFamily(store, policy, projectedTileId);
  }
  return projectPortableItemFamilyState(store, inventory, policy);
}

export function clearPortableItemFamilyInventory<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
): PortableItemFamilyProjection {
  const carried = carriedPortableItemForFamily(store, policy);
  if (carried) {
    destroyPortableItem(store, carried.serial);
  }
  return projectPortableItemFamilyState(store, inventory, policy);
}

export function primePortableItemFamilyDrop<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  pos: number,
  z: number,
): boolean {
  const carried = carriedPortableItemForFamily(store, policy);
  if (!carried || primedPortableItemForFamily(store, policy)) {
    return false;
  }

  setPortableItemDetachedState(carried, policy.primedMode as string, pos, z);
  projectPortableItemFamilyState(store, inventory, policy);
  return true;
}

export function queuePortableItemFamilyReplacement<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  tileId: number,
  pos: number,
  z: number,
): void {
  let collected = mapPortableItemForFamilyAt(store, policy, tileId, pos, z);
  if (!collected) {
    collected = createMapPortableItemForFamily(store, policy, tileId, pos, z);
  }

  const displaced = carriedPortableItem(store);
  setPortableItemCarriedState(collected);
  if (displaced && displaced.serial !== collected.serial) {
    setPortableItemDetachedState(
      displaced,
      policy.displacedMode({
        hasActivePrimedItem: primedPortableItemForFamily(store, policy) !== undefined,
      }) as string,
      pos,
      z,
    );
  }
  projectPortableItemFamilyState(store, inventory, policy);
}

export function activatePortableItemFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  serial: number,
  actorSerial: number,
  hooks?: Pick<
    PortableItemLifecycleHooks<TFamily, TInventorySlot, TState, TItem, unknown>,
    "activateItem"
  >,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item || item.family !== policy.family) {
    return false;
  }

  hooks?.activateItem?.(item as TItem, actorSerial);
  setPortableItemAttachedState(item, policy.attachmentKind, actorSerial);
  projectPortableItemFamilyState(store, inventory, policy);
  return true;
}

export function findPortableItemFamilyAttachedToActor<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
>(
  store: PortableItemStore<PortableItemRecord>,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, unknown>,
  actorSerial: number,
): TItem | undefined {
  return store.portableItems.find((item): item is TItem => {
    if (item.family !== policy.family || item.state.mode !== "attached") {
      return false;
    }
    const state = item.state as unknown as PortableItemAttachedState;
    return state.attachmentKind === policy.attachmentKind && state.attachmentId === actorSerial;
  });
}

export function detachPortableItemFamilyToMap<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  serial: number,
  pos: number,
  z: number,
  hooks?: Pick<
    PortableItemLifecycleHooks<TFamily, TInventorySlot, TState, TItem, unknown>,
    "detachItemToMap"
  >,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item || item.family !== policy.family) {
    return false;
  }

  hooks?.detachItemToMap?.(item as TItem, pos, z);
  setPortableItemMapState(item, pos, z);
  projectPortableItemFamilyState(store, inventory, policy);
  return true;
}

export function detachPortableItemFamilyToDrop<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  serial: number,
  pos: number,
  z: number,
  mode: TState["mode"] = policy.primedMode,
  hooks?: Pick<
    PortableItemLifecycleHooks<TFamily, TInventorySlot, TState, TItem, unknown>,
    "detachItemToDrop"
  >,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item || item.family !== policy.family) {
    return false;
  }

  hooks?.detachItemToDrop?.(item as TItem, pos, z, mode);
  setPortableItemDetachedState(item, mode as string, pos, z);
  projectPortableItemFamilyState(store, inventory, policy);
  return true;
}

export function destroyPortableItemFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  serial: number,
): boolean {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item || item.family !== policy.family) {
    return false;
  }

  destroyPortableItem(store, serial);
  projectPortableItemFamilyState(store, inventory, policy);
  return true;
}

export function clonePortableItemFamily<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  serial: number,
  cloneItem?: (item: TItem, nextSerial: number) => TItem,
): TItem | undefined {
  const item = findPortableItemBySerial(store.portableItems, serial);
  if (!item || item.family !== policy.family) {
    return undefined;
  }

  const typedStore = store as unknown as PortableItemStore<TItem>;
  const typedItem = item as TItem;
  const cloned = createPortableItem(typedStore, (nextSerial) =>
    cloneItem
      ? cloneItem(typedItem, nextSerial)
      : ({
          ...typedItem,
          serial: nextSerial,
          state: { ...typedItem.state },
        } as TItem),
  );
  projectPortableItemFamilyState(store, inventory, policy);
  return cloned;
}

export function settlePortableItemFamilyDrop<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
>(
  store: PortableItemStore<PortableItemRecord>,
  inventory: TInventoryProjection,
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  pos: number,
  z: number,
  settle: (item: TItem) => "mapped" | "destroyed",
): void {
  const primed = primedPortableItemForFamily(store, policy);
  const primedLocation = primed?.state as PortableItemLocation | undefined;
  if (!primed || primed.state.mode !== policy.primedMode || primedLocation?.pos !== pos || primedLocation.z !== z) {
    return;
  }

  const outcome = settle(primed);
  if (outcome === "destroyed") {
    destroyPortableItem(store, primed.serial);
  } else {
    setPortableItemMapState(primed, pos, z);
  }

  const pending = pendingPortableItemForFamily(store, policy);
  if (pending && policy.pendingPrimedMode && pending.state.mode === policy.pendingPrimedMode) {
    const pendingLocation = pending.state as unknown as PortableItemLocation;
    setPortableItemDetachedState(pending, policy.primedMode as string, pendingLocation.pos, pendingLocation.z);
  }
  projectPortableItemFamilyState(store, inventory, policy);
}

export function createPortableItemFamilyLifecycle<
  TFamily extends string,
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TFamily, TInventorySlot, TState>,
  TInventoryProjection,
  TSettleContext,
>(
  policy: PortableItemFamilyPolicy<TFamily, TInventorySlot, TState, TItem, TInventoryProjection>,
  hooks: PortableItemLifecycleHooks<TFamily, TInventorySlot, TState, TItem, TSettleContext>,
): PortableItemFamilyLifecycle<TFamily, TInventorySlot, TState, TItem, TInventoryProjection, TSettleContext> {
  return {
    policy,
    project: (store, inventory) => projectPortableItemFamilyState(store, inventory, policy),
    reconcileProjection: (store, inventory) => reconcilePortableItemFamilyProjection(store, inventory, policy),
    clearInventory: (store, inventory) => clearPortableItemFamilyInventory(store, inventory, policy),
    carry: (store, inventory, serial) => carryPortableItemFamily(store, inventory, policy, serial),
    primeDrop: (store, inventory, pos, z) => primePortableItemFamilyDrop(store, inventory, policy, pos, z),
    queueReplacement: (store, inventory, tileId, pos, z) =>
      queuePortableItemFamilyReplacement(store, inventory, policy, tileId, pos, z),
    activateToActor: (store, inventory, serial, actorSerial) =>
      activatePortableItemFamily(store, inventory, policy, serial, actorSerial, hooks),
    attachToActor: (store, inventory, serial, actorSerial) =>
      activatePortableItemFamily(store, inventory, policy, serial, actorSerial, hooks),
    findAttachedToActor: (store, actorSerial) => findPortableItemFamilyAttachedToActor(store, policy, actorSerial),
    detachToMap: (store, inventory, serial, pos, z) =>
      detachPortableItemFamilyToMap(store, inventory, policy, serial, pos, z, hooks),
    detachToDrop: (store, inventory, serial, pos, z, mode) =>
      detachPortableItemFamilyToDrop(store, inventory, policy, serial, pos, z, mode, hooks),
    destroy: (store, inventory, serial) => destroyPortableItemFamily(store, inventory, policy, serial),
    clone: (store, inventory, serial) => clonePortableItemFamily(store, inventory, policy, serial, hooks.cloneItem),
    settleDrop: (store, inventory, pos, z, context) =>
      settlePortableItemFamilyDrop(store, inventory, policy, pos, z, (item) => hooks.settleDrop(item, context)),
  };
}
