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
import {
  OCCUPANCY_TARGET_KIND,
  type OccupancyTarget,
} from "@game-core/impl/occupancy";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxCreatureArrivalAction,
  lynxActorThiefHook,
} from "@ruleset-lynx/impl/catalog";
import {
  lynxActorArrivalBehavior,
  lynxActorCollisionStrategy,
  lynxActorHeldFloorOutcome as lynxLifecycleHeldFloorOutcome,
} from "@ruleset-lynx/impl/actorLifecycleQueries";

function isLynxChipActor(actorId: number): boolean {
  return actorId === MS_TILE.Chip || actorId === MS_TILE.Swimming_Chip || actorId === MS_TILE.Pushing_Chip;
}

export interface LynxInteractionTargetActorRef {
  id: number;
  dir?: number;
}

export interface LynxInteractionTargetPortableItemRef {
  tileId?: number;
}

function lynxInteractionTargetActorId(target: ActorInteractionTarget): number {
  if (target.kind === ACTOR_INTERACTION_TARGET_KIND.chip) {
    return MS_TILE.Chip;
  }
  return target.actorId ?? MS_TILE.Empty;
}

export function lynxActorInteractionOutcome(
  movingActorId: number,
  target: ActorInteractionTarget,
): ActorCollisionOutcome {
  if (movingActorId === MS_TILE.IceBlock && target.kind === ACTOR_INTERACTION_TARGET_KIND.portableItem) {
    return noActorCollisionOutcome();
  }
  const targetActorId =
    target.kind === ACTOR_INTERACTION_TARGET_KIND.runtimeActor || target.kind === ACTOR_INTERACTION_TARGET_KIND.chip
      ? lynxInteractionTargetActorId(target)
      : null;
  return resolveActorInteractionOutcome({
    movingStrategyId: lynxActorCollisionStrategy(movingActorId),
    targetStrategyId: targetActorId === null ? null : lynxActorCollisionStrategy(targetActorId),
    movingIsChip: isLynxChipActor(movingActorId),
    targetIsChip: targetActorId !== null && isLynxChipActor(targetActorId),
    defaultChipCollisionRemovesTarget: true,
    target,
  });
}

export function lynxActorCollisionOutcome(
  movingActorId: number,
  targetActorId: number,
): ActorCollisionOutcome {
  return lynxActorInteractionOutcome(movingActorId, {
    kind: isLynxChipActor(targetActorId) ? ACTOR_INTERACTION_TARGET_KIND.chip : ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
    actorId: targetActorId,
  });
}

export function lynxInteractionTargetFromOccupancy(
  target: OccupancyTarget<LynxInteractionTargetActorRef, unknown>,
  movingDir = 0,
): ActorInteractionTarget {
  switch (target.kind) {
    case OCCUPANCY_TARGET_KIND.runtimeActor: {
      const targetDir = target.runtimeActor?.dir ?? 0;
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId: target.runtimeActor?.id ?? MS_TILE.Empty,
        tileId: target.tileId,
        movingDir,
        targetDir,
        sameDirection: movingDir !== 0 && targetDir !== 0 && movingDir === targetDir,
      };
    }
    case OCCUPANCY_TARGET_KIND.chip:
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.chip,
        actorId: MS_TILE.Chip,
        tileId: target.tileId,
        movingDir,
      };
    case OCCUPANCY_TARGET_KIND.portableItem:
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.portableItem,
        tileId:
          typeof target.portableItem === "object" &&
          target.portableItem !== null &&
          "tileId" in target.portableItem &&
          typeof target.portableItem.tileId === "number"
            ? target.portableItem.tileId
            : target.tileId,
        movingDir,
      };
    default:
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.empty,
        tileId: target.tileId,
        movingDir,
      };
  }
}

export function lynxActorHazardOutcome(tileId: number, actorId: number): ActorHazardOutcome {
  const arrivalAction = lynxCreatureArrivalAction(tileId, actorId);
  if (arrivalAction === "ice-block-water" || arrivalAction === "ice-block-fire") {
    return arrivalAction;
  }
  return lynxActorArrivalBehavior(tileId, actorId).hazardOutcome;
}

export function lynxActorArrivalOutcome(tileId: number, actorId: number): ActorArrivalOutcome {
  const arrivalAction = lynxCreatureArrivalAction(tileId, actorId);
  if (arrivalAction !== "none") {
    return arrivalAction;
  }
  return lynxActorArrivalBehavior(tileId, actorId).arrivalOutcome;
}

export function lynxActorHeldFloorOutcome(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  return lynxLifecycleHeldFloorOutcome(tileId, actorId);
}

export function lynxActorThiefOutcome(actorId: number): ActorThiefOutcome {
  return actorThiefOutcome(lynxActorThiefHook(actorId));
}
