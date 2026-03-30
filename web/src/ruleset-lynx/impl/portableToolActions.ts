import {
  carriedLynxPortableToolItem,
  primedLynxPortableToolItem,
  primeLynxToolDrop,
  lynxPortableItemDefinitionForFamily,
  type LynxPortableItem,
  type LynxPortableToolStateStore,
  type LynxToolInventoryProjection,
} from "@ruleset-lynx/impl/portableItems";

export interface LynxPortableToolActionContext {
  store: LynxPortableToolStateStore;
  inventory: LynxToolInventoryProjection;
  chipPos: number;
  chipZ: number;
  chipDir: number;
  tryThrowBowlingBall(item: LynxPortableItem, dir: number): boolean;
}

export function applyLynxPortableToolAction(context: LynxPortableToolActionContext): boolean {
  const carried = carriedLynxPortableToolItem(context.store);
  if (!carried) {
    return false;
  }

  return (
    lynxPortableItemDefinitionForFamily(carried.family).applyAction1?.({
      store: context.store,
      inventory: context.inventory,
      carried,
      chipPos: context.chipPos,
      chipZ: context.chipZ,
      chipDir: context.chipDir,
      hasPrimedDrop: primedLynxPortableToolItem(context.store) !== undefined,
      primeDrop: () => primeLynxToolDrop(context.store, context.inventory, context.chipPos, context.chipZ),
      throwMovingItem: (item, dir) => context.tryThrowBowlingBall(item, dir),
    }) ?? false
  );
}
