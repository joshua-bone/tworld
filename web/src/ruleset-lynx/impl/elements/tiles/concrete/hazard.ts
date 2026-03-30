import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import { mapHash } from "@game-core/impl/hash";
import { promoteBottomTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxCompletedChipMoveContext } from "@ruleset-lynx/impl/chipArrival";
import type { LynxEndGameResult } from "@ruleset-lynx/impl/turnState";

export interface LynxChipFinishEnterTileBehaviorContext extends TileBehaviorContext<number, number> {
  readonly runtime: LynxCompletedChipMoveContext;
  chipPos: number;
  chipDir: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
  finished: boolean;
}

export function createLynxHazardTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  switch (tileId) {
    case MS_TILE.Water:
    case MS_TILE.Fire:
    case MS_TILE.Bomb:
      return createTileBehavior({
        "complete-enter": (context) => {
          const behaviorContext = context as LynxChipFinishEnterTileBehaviorContext;
          switch (tileId) {
            case MS_TILE.Water:
              if (behaviorContext.runtime.hasBoot(MS_TILE.Boots_Water)) {
                return;
              }
              break;
            case MS_TILE.Fire:
              if (behaviorContext.runtime.hasBoot(MS_TILE.Boots_Fire)) {
                return;
              }
              break;
            case MS_TILE.Bomb:
              promoteBottomTile(behaviorContext.runtime.state.map.cells, behaviorContext.chipPos, MS_TILE.Empty);
              behaviorContext.runtime.state.map.hash = mapHash(behaviorContext.runtime.state.map.cells);
              break;
          }

          const failed = behaviorContext.runtime.failChip(
            behaviorContext.chipPos,
            behaviorContext.chipDir,
            behaviorContext.endGameTicksElapsed,
            behaviorContext.endGameResult,
            behaviorContext.endGameAnimationTileId,
            behaviorContext.endGameAnimationFrame,
            tileId === MS_TILE.Water ? "drowned" : tileId === MS_TILE.Fire ? "burned" : "bombed",
          );
          behaviorContext.chipPos = failed.chipPos;
          behaviorContext.endGameTicksElapsed = failed.endGameTicksElapsed;
          behaviorContext.endGameResult = failed.endGameResult;
          behaviorContext.endGameAnimationTileId = failed.endGameAnimationTileId;
          behaviorContext.endGameAnimationFrame = failed.endGameAnimationFrame;
          behaviorContext.finished = true;
        },
      });
    default:
      return undefined;
  }
}
