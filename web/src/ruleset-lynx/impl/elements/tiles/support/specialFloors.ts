import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxTileSupportBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/families/support";
import { markLynxSupported } from "@ruleset-lynx/impl/elements/tiles/families/support";

const LYNX_SPECIAL_SUPPORT_TILE_IDS = new Set<number>([MS_TILE.CloneMachine, MS_TILE.Elevator]);

export function hasLynxSpecialFloorSupportBehavior(tileId: number): boolean {
  return LYNX_SPECIAL_SUPPORT_TILE_IDS.has(tileId);
}

export function applyLynxSpecialFloorSupportBehavior(context: LynxTileSupportBehaviorContext): boolean {
  if (!LYNX_SPECIAL_SUPPORT_TILE_IDS.has(context.tileId)) {
    return false;
  }
  markLynxSupported(context);
  return true;
}
