import type { ActorAirHook, ActorCapabilityPolicy, ActorClonerHook, ActorTrapHook } from "@game-core/api/actorCapabilities";
import type { ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";

export type ActorTrapReleaseBehavior = "none" | "move-current-direction";

export interface ActorTrapFamilyHooks {
  readonly heldFloorOutcome: ActorHeldFloorOutcome;
  readonly releaseBehavior: ActorTrapReleaseBehavior;
}

export type ActorClonerEntryBehavior = "none" | "occupy-and-hold";

export type ActorClonerBlockedCollisionBehavior = "none" | "deny-entry";

export type ActorClonerExitBehavior = "none" | "move-current-direction";

export type ActorRuntimeCloneBehavior = "none" | "clone-family-runtime";

export interface ActorClonerFamilyHooks {
  readonly heldFloorOutcome: ActorHeldFloorOutcome;
  readonly entryBehavior: ActorClonerEntryBehavior;
  readonly blockedCollisionBehavior: ActorClonerBlockedCollisionBehavior;
  readonly exitBehavior: ActorClonerExitBehavior;
  readonly runtimeCloneBehavior: ActorRuntimeCloneBehavior;
}

export type ActorSupportLossOutcome = "fall";

export type ActorFallingCollisionBehavior = "default";

export interface ActorSupportFamilyHooks {
  readonly airHook: ActorAirHook;
  readonly unsupportedOutcome: ActorSupportLossOutcome;
  readonly supportLossOutcome: ActorSupportLossOutcome;
  readonly fallingCollisionBehavior: ActorFallingCollisionBehavior;
}

function trapHeldFloorOutcome(hook: ActorTrapHook): ActorHeldFloorOutcome {
  return hook === "none" ? "none" : "hold-direction";
}

function clonerHeldFloorOutcome(hook: ActorClonerHook): ActorHeldFloorOutcome {
  return hook === "none" ? "none" : "hold-direction";
}

export function actorTrapFamilyHooks(policy: ActorCapabilityPolicy): ActorTrapFamilyHooks {
  return {
    heldFloorOutcome: trapHeldFloorOutcome(policy.movement.trapHook),
    releaseBehavior: policy.movement.trapHook === "none" ? "none" : "move-current-direction",
  };
}

export function actorClonerFamilyHooks(policy: ActorCapabilityPolicy): ActorClonerFamilyHooks {
  return {
    heldFloorOutcome: clonerHeldFloorOutcome(policy.movement.clonerHook),
    entryBehavior: policy.movement.clonerHook === "none" ? "none" : "occupy-and-hold",
    blockedCollisionBehavior: "deny-entry",
    exitBehavior: policy.movement.clonerHook === "none" ? "none" : "move-current-direction",
    runtimeCloneBehavior: policy.movement.clonerHook === "none" ? "none" : "clone-family-runtime",
  };
}

export function actorSupportFamilyHooks(policy: ActorCapabilityPolicy): ActorSupportFamilyHooks {
  return {
    airHook: policy.movement.airHook,
    unsupportedOutcome: "fall",
    supportLossOutcome: "fall",
    fallingCollisionBehavior: "default",
  };
}

export function actorTrapReleaseStartsMovement(hooks: ActorTrapFamilyHooks): boolean {
  return hooks.releaseBehavior === "move-current-direction";
}

export function actorClonerExitStartsMovement(hooks: ActorClonerFamilyHooks): boolean {
  return hooks.exitBehavior === "move-current-direction";
}

export function actorClonerClonesFamilyRuntime(hooks: ActorClonerFamilyHooks): boolean {
  return hooks.runtimeCloneBehavior === "clone-family-runtime";
}

export function actorFallingCollisionFailsChip(hooks: ActorSupportFamilyHooks): boolean {
  return hooks.fallingCollisionBehavior === "default";
}
