import { createTileBehavior, type TileBehavior } from "@game-core/api/ruleset";
import { applyActorFloorImpactAction } from "@game-core/impl/floorImpact";
import type { EngineMapCell } from "@game-core/api/model";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsChipEnterTileBehaviorContext } from "@ruleset-ms/impl/chipEnterBehavior";

export function createMsPopupWallTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (tileId !== MS_TILE.PopupWall) {
    return undefined;
  }
  return createTileBehavior({
    "begin-enter": (context) => {
      const behaviorContext = context as MsChipEnterTileBehaviorContext;
      behaviorContext.soundEffects |= applyActorFloorImpactAction("popup-wall", {
        popupWall: () => {
          if (behaviorContext.nextCell.top.id === MS_TILE.Empty) {
            return;
          }
          behaviorContext.nextCell.top.id = MS_TILE.Wall;
          behaviorContext.floorTileBeforeMove.id = MS_TILE.Wall;
        },
        soundEffects: {
          wallCreated: 0,
        },
      }).soundEffects;
    },
  });
}

export function applyMsPopupWallActorArrivalEffects(cells: EngineMapCell[], pos: number, tileId: number): number | null {
  if (tileId !== MS_TILE.PopupWall) {
    return null;
  }
  const cell = cells[pos];
  if (!cell) {
    return 0;
  }
  return applyActorFloorImpactAction("popup-wall", {
    popupWall: () => {
      cell.bottom.id = MS_TILE.Wall;
      cell.bottom.state = 0;
    },
    soundEffects: {
      wallCreated: 0,
    },
  }).soundEffects;
}
