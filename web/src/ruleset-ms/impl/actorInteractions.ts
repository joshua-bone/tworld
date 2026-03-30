import {
  ACTOR_INTERACTION_TARGET_KIND,
  actorHazardOutcome,
  actorThiefOutcome,
  resolveActorInteractionOutcome,
  type ActorInteractionTarget,
  type ActorArrivalOutcome,
  type ActorCollisionOutcome,
  type ActorHazardOutcome,
  type ActorHeldFloorOutcome,
  type ActorThiefOutcome,
} from "@game-core/api/actorInteractions";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorCollisionStrategyId,
  msActorHazardResponse,
  msActorThiefHook,
} from "@ruleset-ms/impl/catalog";
import { msActorHeldFloorOutcomeFromBehavior } from "@ruleset-ms/impl/actorBehavior";

function isMsChipActor(actorId: number): boolean {
  return actorId === MS_TILE.Chip || actorId === MS_TILE.Swimming_Chip || actorId === MS_TILE.Pushing_Chip;
}

function msInteractionTargetActorId(target: ActorInteractionTarget): number {
  if (target.kind === ACTOR_INTERACTION_TARGET_KIND.chip) {
    return MS_TILE.Chip;
  }
  return target.actorId ?? MS_TILE.Empty;
}

export function msActorInteractionOutcome(
  movingActorId: number,
  target: ActorInteractionTarget,
): ActorCollisionOutcome {
  const targetActorId =
    target.kind === ACTOR_INTERACTION_TARGET_KIND.runtimeActor || target.kind === ACTOR_INTERACTION_TARGET_KIND.chip
      ? msInteractionTargetActorId(target)
      : null;
  return resolveActorInteractionOutcome({
    movingStrategyId: msActorCollisionStrategyId(movingActorId),
    targetStrategyId: targetActorId === null ? null : msActorCollisionStrategyId(targetActorId),
    movingIsChip: isMsChipActor(movingActorId),
    targetIsChip: targetActorId !== null && isMsChipActor(targetActorId),
    defaultChipCollisionRemovesTarget: false,
    target,
  });
}

export function msActorCollisionOutcome(
  movingActorId: number,
  targetActorId: number,
): ActorCollisionOutcome {
  return msActorInteractionOutcome(movingActorId, {
    kind: isMsChipActor(targetActorId) ? ACTOR_INTERACTION_TARGET_KIND.chip : ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
    actorId: targetActorId,
  });
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
  return msActorHeldFloorOutcomeFromBehavior(tileId, actorId);
}

export function msActorThiefOutcome(actorId: number): ActorThiefOutcome {
  return actorThiefOutcome(msActorThiefHook(actorId));
}
