import type { ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import {
  type LynxActorClonerCloneBehaviorContext,
  type LynxActorClonerEntryBehaviorContext,
  type LynxActorHeldFloorBehaviorContext,
  type LynxActorTrapReleaseBehaviorContext,
} from "@ruleset-lynx/impl/elements/actors/families/specialFloors";
import { lookupLynxActorLifecyclePhase } from "@ruleset-lynx/impl/actorLifecycleRegistration";

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
