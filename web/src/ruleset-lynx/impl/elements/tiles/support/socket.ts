import { promoteBottomTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxTileSupportBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/families/support";
import { markLynxSupported, markLynxUnsupported } from "@ruleset-lynx/impl/elements/tiles/families/support";

export function hasLynxSocketSupportBehavior(tileId: number): boolean {
  return tileId === MS_TILE.Socket;
}

export function applyLynxSocketSupportBehavior(context: LynxTileSupportBehaviorContext): boolean {
  if (context.tileId !== MS_TILE.Socket || context.layer !== "top") {
    return false;
  }

  if (context.support.state.inventory.chipsNeeded === 0) {
    promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
    markLynxUnsupported(context);
    return true;
  }

  markLynxSupported(context);
  return true;
}
