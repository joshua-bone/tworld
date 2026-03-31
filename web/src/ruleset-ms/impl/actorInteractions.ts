import {
  ACTOR_INTERACTION_TARGET_KIND,
  actorThiefOutcome,
  noActorCollisionOutcome,
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
  msActorArrivalAction,
  msActorThiefHook,
} from "@ruleset-ms/impl/catalog";
import {
  msActorArrivalBehavior,
  msActorCollisionStrategy,
  msActorHeldFloorOutcome as msLifecycleHeldFloorOutcome,
} from "@ruleset-ms/impl/actorLifecycleQueries";

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
  if (movingActorId === MS_TILE.IceBlock && target.kind === ACTOR_INTERACTION_TARGET_KIND.portableItem) {
    return noActorCollisionOutcome();
  }
  const targetActorId =
    target.kind === ACTOR_INTERACTION_TARGET_KIND.runtimeActor || target.kind === ACTOR_INTERACTION_TARGET_KIND.chip
      ? msInteractionTargetActorId(target)
      : null;
  return resolveActorInteractionOutcome({
    movingStrategyId: msActorCollisionStrategy(movingActorId),
    targetStrategyId: targetActorId === null ? null : msActorCollisionStrategy(targetActorId),
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
  const arrivalAction = msActorArrivalAction(tileId, actorId);
  if (arrivalAction === "ice-block-water" || arrivalAction === "ice-block-fire") {
    return arrivalAction;
  }
  return msActorArrivalBehavior(tileId, actorId).hazardOutcome;
}

export function msActorArrivalOutcome(tileId: number, actorId: number): ActorArrivalOutcome {
  const arrivalAction = msActorArrivalAction(tileId, actorId);
  if (arrivalAction === "ice-block-water" || arrivalAction === "ice-block-fire") {
    return arrivalAction;
  }
  return msActorArrivalBehavior(tileId, actorId).arrivalOutcome;
}

export function msActorHeldFloorOutcome(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  return msLifecycleHeldFloorOutcome(tileId, actorId);
}

export function msActorThiefOutcome(actorId: number): ActorThiefOutcome {
  return actorThiefOutcome(msActorThiefHook(actorId));
}
