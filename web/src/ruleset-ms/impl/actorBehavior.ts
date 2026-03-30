import type { ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import {
  type MsActorClonerCloneBehaviorContext,
  type MsActorClonerEntryBehaviorContext,
  type MsActorHeldFloorBehaviorContext,
  type MsActorTrapReleaseBehaviorContext,
} from "@ruleset-ms/impl/elements/actors/families/specialFloors";
import { lookupMsActorLifecyclePhase } from "@ruleset-ms/impl/actorLifecycleRegistration";

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
