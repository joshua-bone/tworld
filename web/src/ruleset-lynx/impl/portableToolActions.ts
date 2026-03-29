import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import {
  carriedLynxPortableToolItem,
  primeLynxToolDrop,
  primedLynxPortableToolItem,
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

  if (carried.family !== "bowling-ball") {
    return primeLynxToolDrop(context.store, context.inventory, context.chipPos, context.chipZ);
  }

  if (primedLynxPortableToolItem(context.store) || context.chipDir === MS_DIRECTION.none) {
    return false;
  }

  return context.tryThrowBowlingBall(carried, context.chipDir);
}
