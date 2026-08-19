import { createTileBehavior, type TileBehavior } from "@game-core/api/ruleset";
import { applyActorFloorImpactAction } from "@game-core/impl/floorImpact";
import { popBoardTile } from "@game-core/impl/board";
import type { EngineMapCell } from "@game-core/api/model";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsChipEnterTileBehaviorContext } from "@ruleset-ms/impl/chipEnterBehavior";

const MS_CLEAR_FLOOR_TILE_IDS = new Set<number>([MS_TILE.Dirt, MS_TILE.BlueWall_Fake]);

export function createMsClearFloorTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (!MS_CLEAR_FLOOR_TILE_IDS.has(tileId)) {
    return undefined;
  }
  return createTileBehavior({
    "begin-enter": (context) => {
      const behaviorContext = context as MsChipEnterTileBehaviorContext;
      behaviorContext.soundEffects |= applyActorFloorImpactAction("clear-floor", {
        clearFloor: () => {
          popBoardTile(behaviorContext.cells, behaviorContext.nextPos, MS_TILE.Empty);
          const z = behaviorContext.runtime.runtimeCellZ(behaviorContext.nextPos);
          behaviorContext.runtime.recordCausalEvent?.({
            kind: "map-mutated",
            actorId: MS_TILE.Chip,
            actorSerial: null,
            tileId: behaviorContext.tileId,
            resultingTileId: behaviorContext.cells[behaviorContext.nextPos]?.top.id ?? MS_TILE.Empty,
            action: "cc1:clear-floor",
            before: { pos: behaviorContext.nextPos, z },
            after: { pos: behaviorContext.nextPos, z },
            phase: "arrival-effect",
          });
        },
        soundEffects: {},
      }).soundEffects;
    },
  });
}

export function applyMsClearFloorActorArrivalEffects(cells: EngineMapCell[], pos: number, tileId: number): number | null {
  if (!MS_CLEAR_FLOOR_TILE_IDS.has(tileId)) {
    return null;
  }
  const cell = cells[pos];
  if (!cell) {
    return 0;
  }
  return applyActorFloorImpactAction("clear-floor", {
    clearFloor: () => {
      cell.bottom.id = MS_TILE.Empty;
      cell.bottom.state = 0;
    },
    soundEffects: {},
  }).soundEffects;
}
