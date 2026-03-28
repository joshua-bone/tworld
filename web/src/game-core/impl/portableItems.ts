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

export interface PortableItemBase<TInventorySlot extends string, TState extends { mode: string }> {
  serial: number;
  tileId: number;
  inventorySlot: TInventorySlot;
  state: TState;
}

export interface PortableItemStore<TItem> {
  portableItems: TItem[];
  nextPortableItemSerial: number;
}

export interface PortableToolInventoryProjection {
  tools: ToolInventorySlots;
}

export function collectPortableItemsFromLayers<TInventorySlot extends string, TItem>(
  layers: ReadonlyArray<{
    z: number;
    cells: EngineMapCell[];
  }>,
  inventorySlot: TInventorySlot,
  slotForTileId: (tileId: number) => string | null,
  createMapItem: (args: {
    serial: number;
    tileId: number;
    inventorySlot: TInventorySlot;
    pos: number;
    z: number;
  }) => TItem,
): TItem[] {
  const items: TItem[] = [];
  for (const layer of layers) {
    for (const cell of layer.cells) {
      if (slotForTileId(cell.top.id) !== inventorySlot) {
        continue;
      }
      items.push(
        createMapItem({
          serial: items.length + 1,
          tileId: cell.top.id,
          inventorySlot,
          pos: cell.position.pos,
          z: layer.z,
        }),
      );
    }
  }
  return items;
}

export function findPortableItemByMode<
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TInventorySlot, TState>,
>(
  items: readonly TItem[],
  inventorySlot: TInventorySlot,
  mode: TState["mode"],
): TItem | undefined {
  return items.find((item) => item.inventorySlot === inventorySlot && item.state.mode === mode);
}

export function findPortableMapItemAt<
  TInventorySlot extends string,
  TState extends { mode: string },
  TItem extends PortableItemBase<TInventorySlot, TState>,
>(
  items: readonly TItem[],
  inventorySlot: TInventorySlot,
  tileId: number,
  pos: number,
  z: number,
): TItem | undefined {
  return items.find((item) => {
    if (item.inventorySlot !== inventorySlot || item.tileId !== tileId || item.state.mode !== "map") {
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
