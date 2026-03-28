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
  msActorClonerHook,
  msActorCollisionStrategyId,
  msActorHazardResponse,
  msActorThiefHook,
  msActorTrapHook,
} from "@ruleset-ms/impl/catalog";

function isMsChipActor(actorId: number): boolean {
  return actorId === MS_TILE.Chip || actorId === MS_TILE.Swimming_Chip || actorId === MS_TILE.Pushing_Chip;
}

export function msActorCollisionOutcome(
  movingActorId: number,
  targetActorId: number,
): ActorCollisionOutcome {
  switch (msActorCollisionStrategyId(movingActorId)) {
    default:
      return isMsChipActor(movingActorId) || isMsChipActor(targetActorId)
        ? chipFailCollisionOutcome()
        : noActorCollisionOutcome();
  }
}

export function msActorHazardOutcome(tileId: number, actorId: number): ActorHazardOutcome {
  switch (tileId) {
    case MS_TILE.Water:
      return actorHazardOutcome("water", msActorHazardResponse(actorId, "water"));
    case MS_TILE.Fire:
      return actorHazardOutcome("fire", msActorHazardResponse(actorId, "fire"));
    case MS_TILE.Bomb:
      return actorHazardOutcome("bomb", msActorHazardResponse(actorId, "bomb"));
    default:
      return "none";
  }
}

export function msActorArrivalOutcome(tileId: number, actorId: number): ActorArrivalOutcome {
  const hazard = msActorHazardOutcome(tileId, actorId);
  return hazard === "deny-entry" ? "none" : hazard;
}

export function msActorHeldFloorOutcome(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  if (tileId === MS_TILE.Beartrap) {
    return msActorTrapHook(actorId) === "none" ? "none" : "hold-direction";
  }
  if (tileId === MS_TILE.CloneMachine) {
    return msActorClonerHook(actorId) === "none" ? "none" : "hold-direction";
  }
  return "none";
}

export function msActorThiefOutcome(actorId: number): ActorThiefOutcome {
  return actorThiefOutcome(msActorThiefHook(actorId));
}
