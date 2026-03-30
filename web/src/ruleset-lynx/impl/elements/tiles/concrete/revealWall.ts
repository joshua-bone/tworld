import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import type { EngineState } from "@game-core/api/model";
import { replaceBottomTile, replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";

const LYNX_REVEAL_WALL_TILE_IDS = new Set<number>([MS_TILE.HiddenWall_Temp, MS_TILE.BlueWall_Real]);

export interface LynxBlockedChipEnterTileBehaviorContext extends TileBehaviorContext<number, number> {
  readonly state: EngineState;
  readonly pos: number;
  readonly layer: "top" | "bottom";
  blocked: boolean;
}

export function createLynxRevealWallTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (!LYNX_REVEAL_WALL_TILE_IDS.has(tileId)) {
    return undefined;
  }
  return createTileBehavior({
    "probe-enter": (context) => {
      const behaviorContext = context as LynxBlockedChipEnterTileBehaviorContext;
      const cell = behaviorContext.state.map.cells[behaviorContext.pos];
      if (!cell) {
        return;
      }
      if (behaviorContext.layer === "top") {
        replaceTopTile(behaviorContext.state.map.cells, behaviorContext.pos, { ...cell.top, id: MS_TILE.Wall });
      } else {
        replaceBottomTile(behaviorContext.state.map.cells, behaviorContext.pos, { ...cell.bottom, id: MS_TILE.Wall });
      }
      behaviorContext.blocked = true;
    },
  });
}
