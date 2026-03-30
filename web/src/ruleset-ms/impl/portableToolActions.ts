import {
  carriedMsPortableToolItem,
  primedMsPortableToolItem,
  primeMsToolDrop,
  msPortableItemDefinitionForFamily,
  type MsPortableItem,
  type MsPortableToolStateStore,
  type MsToolInventoryProjection,
} from "@ruleset-ms/impl/portableItems";

export interface MsPortableToolActionContext {
  store: MsPortableToolStateStore;
  inventory: MsToolInventoryProjection;
  chipPos: number;
  chipZ: number;
  chipDir: number;
  tryThrowBowlingBall(item: MsPortableItem, dir: number): boolean;
}

export function applyMsPortableToolAction(context: MsPortableToolActionContext): boolean {
  const carried = carriedMsPortableToolItem(context.store);
  if (!carried) {
    return false;
  }

  return (
    msPortableItemDefinitionForFamily(carried.family).applyAction1?.({
      store: context.store,
      inventory: context.inventory,
      carried,
      chipPos: context.chipPos,
      chipZ: context.chipZ,
      chipDir: context.chipDir,
      hasPrimedDrop: primedMsPortableToolItem(context.store) !== undefined,
      primeDrop: () => primeMsToolDrop(context.store, context.inventory, context.chipPos, context.chipZ),
      throwMovingItem: (item, dir) => context.tryThrowBowlingBall(item, dir),
    }) ?? false
  );
}
