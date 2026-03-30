import { lookupActorBehaviorPhase } from "@game-core/api/ruleset";
import type { ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import { msRulesetCatalog } from "@ruleset-ms/impl/catalog";
import {
  type MsActorClonerCloneBehaviorContext,
  type MsActorClonerEntryBehaviorContext,
  type MsActorHeldFloorBehaviorContext,
  type MsActorTrapReleaseBehaviorContext,
} from "@ruleset-ms/impl/elements/actors/families/specialFloors";

export function msActorHeldFloorOutcomeFromBehavior(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  const behavior = msRulesetCatalog.getActorBehavior(actorId);
  if (!behavior) {
    return "none";
  }
  const heldFloor = lookupActorBehaviorPhase(behavior, "held-floor");
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
  const behavior = msRulesetCatalog.getActorBehavior(actorId);
  if (!behavior) {
    return false;
  }
  const trapRelease = lookupActorBehaviorPhase(behavior, "trap-release");
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
  const behavior = msRulesetCatalog.getActorBehavior(actorId);
  if (!behavior) {
    return context;
  }
  const clonerEntry = lookupActorBehaviorPhase(behavior, "cloner-entry");
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
  const behavior = msRulesetCatalog.getActorBehavior(actorId);
  if (!behavior) {
    return context;
  }
  const clonerClone = lookupActorBehaviorPhase(behavior, "cloner-clone");
  if (clonerClone === null) {
    return context;
  }
  clonerClone(context);
  return context;
}
