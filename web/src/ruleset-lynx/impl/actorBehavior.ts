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
  type LynxActorClonerCloneBehaviorContext,
  type LynxActorClonerEntryBehaviorContext,
  type LynxActorHeldFloorBehaviorContext,
  type LynxActorSupportBehaviorContext,
  type LynxActorTrapReleaseBehaviorContext,
} from "@ruleset-lynx/impl/elements/actors/families/specialFloors";
import { lookupLynxActorLifecyclePhase } from "@ruleset-lynx/impl/actorLifecycleRegistration";

function lynxHazardNameForTile(tileId: number): ActorHazardName | null {
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

function lynxDefaultArrivalFallback(
  tileId: number,
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  switch (lynxHazardNameForTile(tileId)) {
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

export function lynxActorHeldFloorOutcomeFromBehavior(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  const heldFloor = lookupLynxActorLifecyclePhase(actorId, "held-floor");
  if (heldFloor === null) {
    return "none";
  }
  const context: LynxActorHeldFloorBehaviorContext = {
    phase: "held-floor",
    actorId,
    tileId,
    heldFloorOutcome: "none",
  };
  heldFloor(context);
  return context.heldFloorOutcome;
}

export function lynxActorTrapReleaseStartsMovement(actorId: number): boolean {
  const trapRelease = lookupLynxActorLifecyclePhase(actorId, "trap-release");
  if (trapRelease === null) {
    return false;
  }
  const context: LynxActorTrapReleaseBehaviorContext = {
    phase: "trap-release",
    actorId,
    startsMovement: false,
  };
  trapRelease(context);
  return context.startsMovement;
}

export function lynxActorClonerEntryBehavior(actorId: number): LynxActorClonerEntryBehaviorContext {
  const context: LynxActorClonerEntryBehaviorContext = {
    phase: "cloner-entry",
    actorId,
    entryBehavior: "none",
    blockedCollisionBehavior: "none",
  };
  const clonerEntry = lookupLynxActorLifecyclePhase(actorId, "cloner-entry");
  if (clonerEntry === null) {
    return context;
  }
  clonerEntry(context);
  return context;
}

export function lynxActorClonerCloneBehavior(actorId: number): LynxActorClonerCloneBehaviorContext {
  const context: LynxActorClonerCloneBehaviorContext = {
    phase: "cloner-clone",
    actorId,
    exitStartsMovement: false,
    cloneFamilyRuntime: false,
  };
  const clonerClone = lookupLynxActorLifecyclePhase(actorId, "cloner-clone");
  if (clonerClone === null) {
    return context;
  }
  clonerClone(context);
  return context;
}

export function lynxActorSupportHooksFromBehavior(actorId: number): ActorSupportFamilyHooks {
  const context: LynxActorSupportBehaviorContext = {
    phase: "support",
    actorId,
    supportHooks: DEFAULT_ACTOR_SUPPORT_FAMILY_HOOKS,
  };
  const support = lookupLynxActorLifecyclePhase(actorId, "support");
  if (support === null) {
    return context.supportHooks;
  }
  support(context);
  return context.supportHooks;
}

export function lynxActorBlockedMoveKindFromBehavior(actorId: number): ActorBlockedMoveKind {
  const blockedMove = lookupLynxActorLifecyclePhase(actorId, "blocked-move");
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

export function lynxActorCollisionStrategyFromBehavior(actorId: number): ActorCollisionStrategyId {
  const collision = lookupLynxActorLifecyclePhase(actorId, "collision");
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

export function lynxActorArrivalBehaviorFromBehavior(
  tileId: number,
  actorId: number,
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  const arrival = lookupLynxActorLifecyclePhase(actorId, "arrival");
  if (arrival === null) {
    return lynxDefaultArrivalFallback(tileId);
  }
  const context: ActorArrivalPolicyBehaviorContext = {
    phase: "arrival",
    actorId,
    tileId,
    hazardName: lynxHazardNameForTile(tileId),
    hazardOutcome: "none",
    arrivalOutcome: "none",
  };
  arrival(context);
  return {
    hazardOutcome: context.hazardOutcome,
    arrivalOutcome: context.arrivalOutcome,
  };
}
