import {
  ACTOR_INTERACTION_TARGET_KIND,
  actorHazardOutcome,
  actorThiefOutcome,
  chipFailCollisionOutcome,
  denyMoveCollisionOutcome,
  noActorCollisionOutcome,
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
  switch (lynxActorCollisionStrategyId(movingActorId)) {
    default:
      if (target.kind === ACTOR_INTERACTION_TARGET_KIND.empty) {
        return noActorCollisionOutcome();
      }
      if (target.kind === ACTOR_INTERACTION_TARGET_KIND.portableItem) {
        return isLynxChipActor(movingActorId) ? noActorCollisionOutcome() : denyMoveCollisionOutcome();
      }
      return isLynxChipActor(movingActorId) || isLynxChipActor(lynxInteractionTargetActorId(target))
        ? chipFailCollisionOutcome(true)
        : noActorCollisionOutcome();
  }
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
