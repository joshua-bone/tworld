import type {
  ActorBlockedMoveKind,
  ActorCollisionStrategyId,
  ActorHazardName,
} from "@game-core/api/actorCapabilities";
import { DEFAULT_ACTOR_SUPPORT_FAMILY_HOOKS, type ActorSupportFamilyHooks } from "@game-core/api/actorSpecialFloorHooks";
import type { ActorArrivalOutcome, ActorHazardOutcome, ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import type {
  ActorArrivalPolicyBehaviorContext,
  ActorBlockedMovePolicyBehaviorContext,
  ActorCollisionPolicyBehaviorContext,
} from "@game-core/impl/actorInteractionBehavior";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  type MsActorClonerCloneBehaviorContext,
  type MsActorClonerEntryBehaviorContext,
  type MsActorHeldFloorBehaviorContext,
  type MsActorSupportBehaviorContext,
  type MsActorTrapReleaseBehaviorContext,
} from "@ruleset-ms/impl/elements/actors/families/specialFloors";
import { lookupMsActorLifecyclePhase } from "@ruleset-ms/impl/actorLifecycleRegistration";

function msHazardNameForTile(tileId: number): ActorHazardName | null {
  switch (tileId) {
    case MS_TILE.Water:
      return "water";
    case MS_TILE.Fire:
      return "fire";
    case MS_TILE.Bomb:
      return "bomb";
    default:
      return null;
  }
}

function msDefaultArrivalFallback(
  tileId: number,
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  switch (msHazardNameForTile(tileId)) {
    case "water":
      return { hazardOutcome: "creature-water", arrivalOutcome: "creature-water" };
    case "fire":
      return { hazardOutcome: "creature-fire", arrivalOutcome: "creature-fire" };
    case "bomb":
      return { hazardOutcome: "creature-bomb", arrivalOutcome: "creature-bomb" };
    default:
      return { hazardOutcome: "none", arrivalOutcome: "none" };
  }
}

export function msActorHeldFloorOutcomeFromBehavior(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  const heldFloor = lookupMsActorLifecyclePhase(actorId, "held-floor");
  if (heldFloor === null) {
    return "none";
  }
  const context: MsActorHeldFloorBehaviorContext = {
    phase: "held-floor",
    actorId,
    tileId,
    heldFloorOutcome: "none",
  };
  heldFloor(context);
  return context.heldFloorOutcome;
}

export function msActorTrapReleaseStartsMovement(actorId: number): boolean {
  const trapRelease = lookupMsActorLifecyclePhase(actorId, "trap-release");
  if (trapRelease === null) {
    return false;
  }
  const context: MsActorTrapReleaseBehaviorContext = {
    phase: "trap-release",
    actorId,
    startsMovement: false,
  };
  trapRelease(context);
  return context.startsMovement;
}

export function msActorClonerEntryBehavior(actorId: number): MsActorClonerEntryBehaviorContext {
  const context: MsActorClonerEntryBehaviorContext = {
    phase: "cloner-entry",
    actorId,
    entryBehavior: "none",
    blockedCollisionBehavior: "none",
  };
  const clonerEntry = lookupMsActorLifecyclePhase(actorId, "cloner-entry");
  if (clonerEntry === null) {
    return context;
  }
  clonerEntry(context);
  return context;
}

export function msActorClonerCloneBehavior(actorId: number): MsActorClonerCloneBehaviorContext {
  const context: MsActorClonerCloneBehaviorContext = {
    phase: "cloner-clone",
    actorId,
    exitStartsMovement: false,
    cloneFamilyRuntime: false,
  };
  const clonerClone = lookupMsActorLifecyclePhase(actorId, "cloner-clone");
  if (clonerClone === null) {
    return context;
  }
  clonerClone(context);
  return context;
}

export function msActorSupportHooksFromBehavior(actorId: number): ActorSupportFamilyHooks {
  const context: MsActorSupportBehaviorContext = {
    phase: "support",
    actorId,
    supportHooks: DEFAULT_ACTOR_SUPPORT_FAMILY_HOOKS,
  };
  const support = lookupMsActorLifecyclePhase(actorId, "support");
  if (support === null) {
    return context.supportHooks;
  }
  support(context);
  return context.supportHooks;
}

export function msActorBlockedMoveKindFromBehavior(actorId: number): ActorBlockedMoveKind {
  const blockedMove = lookupMsActorLifecyclePhase(actorId, "blocked-move");
  if (blockedMove === null) {
    return "stay";
  }
  const context: ActorBlockedMovePolicyBehaviorContext = {
    phase: "blocked-move",
    actorId,
    blockedMoveKind: "stay",
  };
  blockedMove(context);
  return context.blockedMoveKind;
}

export function msActorCollisionStrategyFromBehavior(actorId: number): ActorCollisionStrategyId {
  const collision = lookupMsActorLifecyclePhase(actorId, "collision");
  if (collision === null) {
    return "default";
  }
  const context: ActorCollisionPolicyBehaviorContext = {
    phase: "collision",
    actorId,
    collisionStrategyId: "default",
  };
  collision(context);
  return context.collisionStrategyId;
}

export function msActorArrivalBehaviorFromBehavior(
  tileId: number,
  actorId: number,
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  const arrival = lookupMsActorLifecyclePhase(actorId, "arrival");
  if (arrival === null) {
    return msDefaultArrivalFallback(tileId);
  }
  const context: ActorArrivalPolicyBehaviorContext = {
    phase: "arrival",
    actorId,
    tileId,
    hazardName: msHazardNameForTile(tileId),
    hazardOutcome: "none",
    arrivalOutcome: "none",
  };
  arrival(context);
  return {
    hazardOutcome: context.hazardOutcome,
    arrivalOutcome: context.arrivalOutcome,
  };
}
