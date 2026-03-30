import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsTileSupportBehaviorContext } from "@ruleset-ms/impl/elements/tiles/families/support";
import { markMsSupported } from "@ruleset-ms/impl/elements/tiles/families/support";

const MS_SPECIAL_SUPPORT_TILE_IDS = new Set<number>([MS_TILE.CloneMachine, MS_TILE.Elevator]);

export function hasMsSpecialFloorSupportBehavior(tileId: number): boolean {
  return MS_SPECIAL_SUPPORT_TILE_IDS.has(tileId);
}

export function applyMsSpecialFloorSupportBehavior(context: MsTileSupportBehaviorContext): boolean {
  if (!MS_SPECIAL_SUPPORT_TILE_IDS.has(context.tileId)) {
    return false;
  }
  markMsSupported(context);
  return true;
}
