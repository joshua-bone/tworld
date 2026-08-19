import { createTileBehavior, type TileBehavior } from "@game-core/api/ruleset";
import { applyActorFloorImpactAction } from "@game-core/impl/floorImpact";
import { mapHash } from "@game-core/impl/hash";
import type { EngineState } from "@game-core/api/model";
import { replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxChipEnterTileBehaviorContext } from "@ruleset-lynx/impl/chipEnterBehavior";

export function createLynxPopupWallTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (tileId !== MS_TILE.PopupWall) {
    return undefined;
  }
  return createTileBehavior({
    "begin-enter": (context) => {
      const behaviorContext = context as LynxChipEnterTileBehaviorContext;
      behaviorContext.soundEffects |= applyActorFloorImpactAction("popup-wall", {
        popupWall: () => {
          const cell = behaviorContext.runtime.state.map.cells[behaviorContext.pos];
          if (!cell) {
            return;
          }
          replaceTopTile(behaviorContext.runtime.state.map.cells, behaviorContext.pos, { ...cell.top, id: MS_TILE.Wall });
          behaviorContext.runtime.state.map.hash = mapHash(behaviorContext.runtime.state.map.cells);
          const z = behaviorContext.runtime.activeLayerZ();
          behaviorContext.runtime.recordCausalEvent?.({
            kind: "map-mutated",
            actorId: MS_TILE.Chip,
            actorSerial: null,
            tileId: behaviorContext.tileId,
            resultingTileId: MS_TILE.Wall,
            action: "cc1:popup-wall",
            before: { pos: behaviorContext.pos, z },
            after: { pos: behaviorContext.pos, z },
            phase: "arrival-effect",
          });
        },
        soundEffects: behaviorContext.runtime.soundBits,
      }).soundEffects;
      behaviorContext.resolved = true;
    },
  });
}

export function applyLynxPopupWallActorArrivalEffects(
  state: EngineState,
  pos: number,
  tileId: number,
  soundBits: {
    wallCreated: number;
  },
): number | null {
  if (tileId !== MS_TILE.PopupWall) {
    return null;
  }
  const cell = state.map.cells[pos];
  if (!cell) {
    return 0;
  }
  return applyActorFloorImpactAction("popup-wall", {
    popupWall: () => {
      replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
      state.map.hash = mapHash(state.map.cells);
    },
    soundEffects: soundBits,
  }).soundEffects;
}
