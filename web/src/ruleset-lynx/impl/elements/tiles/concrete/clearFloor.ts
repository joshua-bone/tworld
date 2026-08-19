import { createTileBehavior, type TileBehavior } from "@game-core/api/ruleset";
import { applyActorFloorImpactAction } from "@game-core/impl/floorImpact";
import { mapHash } from "@game-core/impl/hash";
import type { EngineState } from "@game-core/api/model";
import { replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxChipEnterTileBehaviorContext } from "@ruleset-lynx/impl/chipEnterBehavior";

const LYNX_CLEAR_FLOOR_TILE_IDS = new Set<number>([MS_TILE.Dirt, MS_TILE.BlueWall_Fake]);

export function createLynxClearFloorTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (!LYNX_CLEAR_FLOOR_TILE_IDS.has(tileId)) {
    return undefined;
  }
  return createTileBehavior({
    "begin-enter": (context) => {
      const behaviorContext = context as LynxChipEnterTileBehaviorContext;
      behaviorContext.soundEffects |= applyActorFloorImpactAction("clear-floor", {
        clearFloor: () => {
          const cell = behaviorContext.runtime.state.map.cells[behaviorContext.pos];
          if (!cell) {
            return;
          }
          replaceTopTile(behaviorContext.runtime.state.map.cells, behaviorContext.pos, { ...cell.top, id: MS_TILE.Empty });
          behaviorContext.runtime.state.map.hash = mapHash(behaviorContext.runtime.state.map.cells);
          const z = behaviorContext.runtime.activeLayerZ();
          behaviorContext.runtime.recordCausalEvent?.({
            kind: "map-mutated",
            actorId: MS_TILE.Chip,
            actorSerial: null,
            tileId: behaviorContext.tileId,
            resultingTileId: behaviorContext.runtime.state.map.cells[behaviorContext.pos]?.top.id ?? MS_TILE.Empty,
            action: "cc1:clear-floor",
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

export function applyLynxClearFloorActorArrivalEffects(
  state: EngineState,
  pos: number,
  tileId: number,
  soundBits: {
    tileEmptied: number;
  },
): number | null {
  if (!LYNX_CLEAR_FLOOR_TILE_IDS.has(tileId)) {
    return null;
  }
  const cell = state.map.cells[pos];
  if (!cell) {
    return 0;
  }
  return applyActorFloorImpactAction("clear-floor", {
    clearFloor: () => {
      replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Empty });
      state.map.hash = mapHash(state.map.cells);
    },
    soundEffects: soundBits,
  }).soundEffects;
}
