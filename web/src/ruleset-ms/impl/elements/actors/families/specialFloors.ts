import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import type { ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import {
  actorClonerClonesFamilyRuntime,
  actorClonerExitStartsMovement,
  actorClonerFamilyHooks,
  actorTrapFamilyHooks,
  actorTrapReleaseStartsMovement,
  type ActorClonerBlockedCollisionBehavior,
  type ActorClonerEntryBehavior,
} from "@game-core/api/actorSpecialFloorHooks";
import { createActorBehavior, type ActorBehavior, type ActorBehaviorContext } from "@game-core/api/ruleset";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface MsActorHeldFloorBehaviorContext extends ActorBehaviorContext<number, number> {
  heldFloorOutcome: ActorHeldFloorOutcome;
}

export interface MsActorTrapReleaseBehaviorContext extends ActorBehaviorContext<number, number> {
  startsMovement: boolean;
}

export interface MsActorClonerEntryBehaviorContext extends ActorBehaviorContext<number, number> {
  entryBehavior: ActorClonerEntryBehavior;
  blockedCollisionBehavior: ActorClonerBlockedCollisionBehavior;
}

export interface MsActorClonerCloneBehaviorContext extends ActorBehaviorContext<number, number> {
  exitStartsMovement: boolean;
  cloneFamilyRuntime: boolean;
}

function heldFloorOutcome(
  capabilities: ActorCapabilityPolicy,
  tileId: number | undefined,
): ActorHeldFloorOutcome {
  if (tileId === MS_TILE.Beartrap) {
    return actorTrapFamilyHooks(capabilities).heldFloorOutcome;
  }
  if (tileId === MS_TILE.CloneMachine) {
    return actorClonerFamilyHooks(capabilities).heldFloorOutcome;
  }
  return "none";
}

export function createMsSpecialFloorActorBehavior(
  capabilities: ActorCapabilityPolicy,
): ActorBehavior<number, number> | undefined {
  const trapHooks = actorTrapFamilyHooks(capabilities);
  const clonerHooks = actorClonerFamilyHooks(capabilities);

  return createActorBehavior({
    "held-floor": (context) => {
      const behaviorContext = context as MsActorHeldFloorBehaviorContext;
      behaviorContext.heldFloorOutcome = heldFloorOutcome(capabilities, behaviorContext.tileId);
    },
    "trap-release": (context) => {
      const behaviorContext = context as MsActorTrapReleaseBehaviorContext;
      behaviorContext.startsMovement = actorTrapReleaseStartsMovement(trapHooks);
    },
    "cloner-entry": (context) => {
      const behaviorContext = context as MsActorClonerEntryBehaviorContext;
      behaviorContext.entryBehavior = clonerHooks.entryBehavior;
      behaviorContext.blockedCollisionBehavior = clonerHooks.blockedCollisionBehavior;
    },
    "cloner-clone": (context) => {
      const behaviorContext = context as MsActorClonerCloneBehaviorContext;
      behaviorContext.exitStartsMovement = actorClonerExitStartsMovement(clonerHooks);
      behaviorContext.cloneFamilyRuntime = actorClonerClonesFamilyRuntime(clonerHooks);
    },
  });
}
