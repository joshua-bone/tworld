import {
  actorHazardOutcome,
  actorThiefOutcome,
  chipFailCollisionOutcome,
  noActorCollisionOutcome,
  type ActorArrivalOutcome,
  type ActorCollisionOutcome,
  type ActorHazardOutcome,
  type ActorHeldFloorOutcome,
  type ActorThiefOutcome,
} from "@game-core/api/actorInteractions";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorClonerHook,
  lynxActorCollisionStrategyId,
  lynxActorHazardResponse,
  lynxActorThiefHook,
  lynxActorTrapHook,
  lynxTileHasTag,
} from "@ruleset-lynx/impl/catalog";

function isLynxChipActor(actorId: number): boolean {
  return actorId === MS_TILE.Chip || actorId === MS_TILE.Swimming_Chip || actorId === MS_TILE.Pushing_Chip;
}

export function lynxActorCollisionOutcome(
  movingActorId: number,
  targetActorId: number,
): ActorCollisionOutcome {
  switch (lynxActorCollisionStrategyId(movingActorId)) {
    default:
      return isLynxChipActor(movingActorId) || isLynxChipActor(targetActorId)
        ? chipFailCollisionOutcome(true)
        : noActorCollisionOutcome();
  }
}

export function lynxActorHazardOutcome(tileId: number, actorId: number): ActorHazardOutcome {
  switch (tileId) {
    case MS_TILE.Water:
      return actorHazardOutcome("water", lynxActorHazardResponse(actorId, "water"));
    case MS_TILE.Fire:
      return actorHazardOutcome("fire", lynxActorHazardResponse(actorId, "fire"));
    case MS_TILE.Bomb:
      return actorHazardOutcome("bomb", lynxActorHazardResponse(actorId, "bomb"));
    default:
      return "none";
  }
}

export function lynxActorArrivalOutcome(tileId: number, actorId: number): ActorArrivalOutcome {
  if (tileId === MS_TILE.Beartrap) {
    return "trap";
  }
  if (lynxTileHasTag(tileId, "button")) {
    return "button";
  }
  if (tileId === MS_TILE.Key_Blue) {
    return "clear-key-blue";
  }
  const hazard = lynxActorHazardOutcome(tileId, actorId);
  return hazard === "deny-entry" ? "none" : hazard;
}

export function lynxActorHeldFloorOutcome(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  if (tileId === MS_TILE.Beartrap) {
    return lynxActorTrapHook(actorId) === "none" ? "none" : "hold-direction";
  }
  if (tileId === MS_TILE.CloneMachine) {
    return lynxActorClonerHook(actorId) === "none" ? "none" : "hold-direction";
  }
  return "none";
}

export function lynxActorThiefOutcome(actorId: number): ActorThiefOutcome {
  return actorThiefOutcome(lynxActorThiefHook(actorId));
}
