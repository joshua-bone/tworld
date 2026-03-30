import { createTileBehavior, type TileBehavior } from "@game-core/api/ruleset";
import { replaceBottomTile, replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxTileLeaveBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/families/leave";

export function createLynxCloudTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (tileId !== MS_TILE.Cloud) {
    return undefined;
  }
  return createTileBehavior({
    "complete-exit": (context) => {
      const behaviorContext = context as LynxTileLeaveBehaviorContext;
      const cell = behaviorContext.cells[behaviorContext.pos];
      if (!cell) {
        return;
      }
      const replacement =
        behaviorContext.layer === "top"
          ? { ...cell.top, id: MS_TILE.Air, state: 0 }
          : { ...cell.bottom, id: MS_TILE.Air, state: 0 };
      if (behaviorContext.layer === "top") {
        replaceTopTile(behaviorContext.cells, behaviorContext.pos, replacement);
      } else {
        replaceBottomTile(behaviorContext.cells, behaviorContext.pos, replacement);
      }
      behaviorContext.applied = true;
    },
  });
}
