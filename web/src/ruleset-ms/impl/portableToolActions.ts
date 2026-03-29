import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import {
  carriedMsPortableToolItem,
  primeMsToolDrop,
  primedMsPortableToolItem,
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

  if (carried.family !== "bowling-ball") {
    return primeMsToolDrop(context.store, context.inventory, context.chipPos, context.chipZ);
  }

  if (primedMsPortableToolItem(context.store) || context.chipDir === MS_DIRECTION.none) {
    return false;
  }

  return context.tryThrowBowlingBall(carried, context.chipDir);
}
