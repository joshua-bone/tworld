import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsTileSupportBehaviorContext } from "@ruleset-ms/impl/elements/tiles/families/support";
import { markMsSupported, markMsUnsupported } from "@ruleset-ms/impl/elements/tiles/families/support";

const MS_SUPPORTING_WALL_TILE_IDS = new Set<number>([
  MS_TILE.Wall,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.BlueWall_Real,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.BlueWall_Fake,
]);

export function hasMsWallSupportBehavior(tileId: number): boolean {
  return MS_SUPPORTING_WALL_TILE_IDS.has(tileId);
}

export function applyMsWallSupportBehavior(
  context: MsTileSupportBehaviorContext,
  chipSupport: boolean,
): boolean {
  if (!MS_SUPPORTING_WALL_TILE_IDS.has(context.tileId) || context.layer !== "top") {
    return false;
  }

  if (context.tileId === MS_TILE.BlueWall_Fake) {
    if (chipSupport) {
      promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
      markMsUnsupported(context);
      return true;
    }
    markMsSupported(context);
    return true;
  }

  if (context.tileId === MS_TILE.BlueWall_Real && chipSupport) {
    const cell = context.lowerCells[context.pos];
    if (cell) {
      replaceTopTile(context.lowerCells, context.pos, { ...cell.top, id: MS_TILE.Wall });
    }
  }

  markMsSupported(context);
  return true;
}
