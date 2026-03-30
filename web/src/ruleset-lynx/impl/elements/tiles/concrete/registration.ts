import { composeTileBehaviors, type TileBehavior } from "@game-core/api/ruleset";
import type { EngineState } from "@game-core/api/model";
import { applyLynxClearFloorActorArrivalEffects, createLynxClearFloorTileBehavior } from "./clearFloor";
import { createLynxCloudTileBehavior } from "./cloud";
import { createLynxHazardTileBehavior, type LynxChipFinishEnterTileBehaviorContext } from "./hazard";
import { applyLynxPopupWallActorArrivalEffects, createLynxPopupWallTileBehavior } from "./popupWall";
import { createLynxRevealWallTileBehavior } from "./revealWall";
import { createLynxSpecialFloorTileBehavior } from "./specialFloors";

export function createLynxConcreteTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  return composeTileBehaviors(
    createLynxRevealWallTileBehavior(tileId),
    createLynxHazardTileBehavior(tileId),
    createLynxClearFloorTileBehavior(tileId),
    createLynxPopupWallTileBehavior(tileId),
    createLynxCloudTileBehavior(tileId),
    createLynxSpecialFloorTileBehavior(tileId),
  );
}

export function applyLynxConcreteTileActorArrivalEffects(
  state: EngineState,
  pos: number,
  tileId: number,
  soundBits: {
    tileEmptied: number;
    wallCreated: number;
  },
): number | null {
  return (
    applyLynxClearFloorActorArrivalEffects(state, pos, tileId, soundBits) ??
    applyLynxPopupWallActorArrivalEffects(state, pos, tileId, soundBits)
  );
}

export type { LynxChipFinishEnterTileBehaviorContext } from "./hazard";
