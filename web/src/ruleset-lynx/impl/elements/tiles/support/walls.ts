import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxTileSupportBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/families/support";
import { markLynxSupported, markLynxUnsupported } from "@ruleset-lynx/impl/elements/tiles/families/support";

const LYNX_SUPPORTING_WALL_TILE_IDS = new Set<number>([
  MS_TILE.Wall,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.BlueWall_Real,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.BlueWall_Fake,
]);

export function hasLynxWallSupportBehavior(tileId: number): boolean {
  return LYNX_SUPPORTING_WALL_TILE_IDS.has(tileId);
}

export function applyLynxWallSupportBehavior(
  context: LynxTileSupportBehaviorContext,
  chipSupport: boolean,
): boolean {
  if (!LYNX_SUPPORTING_WALL_TILE_IDS.has(context.tileId) || context.layer !== "top") {
    return false;
  }

  if (context.tileId === MS_TILE.BlueWall_Fake) {
    if (chipSupport) {
      promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
      markLynxUnsupported(context);
      return true;
    }
    markLynxSupported(context);
    return true;
  }

  if (context.tileId === MS_TILE.BlueWall_Real && chipSupport) {
    const cell = context.lowerCells[context.pos];
    if (cell) {
      replaceTopTile(context.lowerCells, context.pos, { ...cell.top, id: MS_TILE.Wall });
    }
  }

  markLynxSupported(context);
  return true;
}
