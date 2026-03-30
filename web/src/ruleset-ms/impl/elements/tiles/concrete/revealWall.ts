import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import type { EngineMapCell } from "@game-core/api/model";
import { replaceBottomTile, replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";

const MS_REVEAL_WALL_TILE_IDS = new Set<number>([MS_TILE.HiddenWall_Temp, MS_TILE.BlueWall_Real]);

export interface MsBlockedChipEnterTileBehaviorContext extends TileBehaviorContext<number, number> {
  readonly cells: EngineMapCell[];
  readonly pos: number;
  readonly layer: "top" | "bottom";
  readonly exposeWalls: boolean;
  blocked: boolean;
}

export function createMsRevealWallTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (!MS_REVEAL_WALL_TILE_IDS.has(tileId)) {
    return undefined;
  }
  return createTileBehavior({
    "probe-enter": (context) => {
      const behaviorContext = context as MsBlockedChipEnterTileBehaviorContext;
      if (behaviorContext.exposeWalls) {
        const cell = behaviorContext.cells[behaviorContext.pos];
        if (!cell) {
          return;
        }
        if (behaviorContext.layer === "top") {
          replaceTopTile(behaviorContext.cells, behaviorContext.pos, { ...cell.top, id: MS_TILE.Wall });
        } else {
          replaceBottomTile(behaviorContext.cells, behaviorContext.pos, { ...cell.bottom, id: MS_TILE.Wall });
        }
      }
      behaviorContext.blocked = true;
    },
  });
}
