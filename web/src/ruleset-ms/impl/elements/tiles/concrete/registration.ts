import { composeTileBehaviors, type TileBehavior } from "@game-core/api/ruleset";
import type { EngineMapCell } from "@game-core/api/model";
import { applyMsClearFloorActorArrivalEffects, createMsClearFloorTileBehavior } from "./clearFloor";
import { createMsCloudTileBehavior } from "./cloud";
import { createMsHazardTileBehavior } from "./hazard";
import { applyMsPopupWallActorArrivalEffects, createMsPopupWallTileBehavior } from "./popupWall";
import { createMsRevealWallTileBehavior } from "./revealWall";
import { createMsSpecialFloorTileBehavior } from "./specialFloors";

export function createMsConcreteTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  return composeTileBehaviors(
    createMsRevealWallTileBehavior(tileId),
    createMsHazardTileBehavior(tileId),
    createMsClearFloorTileBehavior(tileId),
    createMsPopupWallTileBehavior(tileId),
    createMsCloudTileBehavior(tileId),
    createMsSpecialFloorTileBehavior(tileId),
  );
}

export function applyMsConcreteTileActorArrivalEffects(cells: EngineMapCell[], pos: number, tileId: number): number | null {
  return applyMsClearFloorActorArrivalEffects(cells, pos, tileId) ?? applyMsPopupWallActorArrivalEffects(cells, pos, tileId);
}
