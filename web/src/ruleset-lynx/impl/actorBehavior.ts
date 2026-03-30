import { lookupActorBehaviorPhase } from "@game-core/api/ruleset";
import type { ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import { lynxRulesetCatalog } from "@ruleset-lynx/impl/catalog";
import {
  type LynxActorClonerCloneBehaviorContext,
  type LynxActorClonerEntryBehaviorContext,
  type LynxActorHeldFloorBehaviorContext,
  type LynxActorTrapReleaseBehaviorContext,
} from "@ruleset-lynx/impl/elements/actors/families/specialFloors";

export function lynxActorHeldFloorOutcomeFromBehavior(
  tileId: number,
  actorId: number,
): ActorHeldFloorOutcome {
  const behavior = lynxRulesetCatalog.getActorBehavior(actorId);
  if (!behavior) {
    return "none";
  }
  const heldFloor = lookupActorBehaviorPhase(behavior, "held-floor");
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
  const behavior = lynxRulesetCatalog.getActorBehavior(actorId);
  if (!behavior) {
    return false;
  }
  const trapRelease = lookupActorBehaviorPhase(behavior, "trap-release");
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
  const behavior = lynxRulesetCatalog.getActorBehavior(actorId);
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

export function lynxActorClonerCloneBehavior(actorId: number): LynxActorClonerCloneBehaviorContext {
  const context: LynxActorClonerCloneBehaviorContext = {
    phase: "cloner-clone",
    actorId,
    exitStartsMovement: false,
    cloneFamilyRuntime: false,
  };
  const behavior = lynxRulesetCatalog.getActorBehavior(actorId);
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
