import type {
  ActorBlockedMoveKind,
  ActorCollisionStrategyId,
  ActorHazardName,
} from "@game-core/api/actorCapabilities";
import type { ActorArrivalOutcome, ActorHazardOutcome, ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import type {
  ActorArrivalPolicyBehaviorContext,
  ActorBlockedMovePolicyBehaviorContext,
  ActorCollisionPolicyBehaviorContext,
} from "@game-core/impl/actorInteractionBehavior";
import {
  defaultActorArrivalFallback,
  defaultActorSupportHooks,
  queryActorArrivalBehavior,
  queryActorBlockedMoveKind,
  queryActorClonerCloneBehavior,
  queryActorClonerEntryBehavior,
  queryActorCollisionStrategy,
  queryActorHeldFloorOutcome,
  queryActorSupportHooks,
  queryActorTrapReleaseStartsMovement,
} from "@game-core/impl/actorLifecycleQueries";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  type MsActorClonerCloneBehaviorContext,
  type MsActorClonerEntryBehaviorContext,
  type MsActorHeldFloorBehaviorContext,
  type MsActorSupportBehaviorContext,
  type MsActorTrapReleaseBehaviorContext,
} from "@ruleset-ms/impl/elements/actors/families/specialFloors";
import { lookupMsActorLifecyclePhase } from "@ruleset-ms/impl/actorLifecycleRegistration";

const MS_HAZARD_NAME_BY_TILE = new Map<number, ActorHazardName>([
  [MS_TILE.Water, "water"],
  [MS_TILE.Fire, "fire"],
  [MS_TILE.Bomb, "bomb"],
]);

function msHazardName(tileId: number): ActorHazardName | null {
  return MS_HAZARD_NAME_BY_TILE.get(tileId) ?? null;
}

export function msActorHeldFloorOutcome(tileId: number, actorId: number): ActorHeldFloorOutcome {
  return queryActorHeldFloorOutcome(lookupMsActorLifecyclePhase, {
    phase: "held-floor",
    actorId,
    tileId,
    heldFloorOutcome: "none",
  } satisfies MsActorHeldFloorBehaviorContext);
}

export function msActorTrapReleaseStartsMovement(actorId: number): boolean {
  return queryActorTrapReleaseStartsMovement(lookupMsActorLifecyclePhase, {
    phase: "trap-release",
    actorId,
    startsMovement: false,
  } satisfies MsActorTrapReleaseBehaviorContext);
}

export function msActorClonerEntryBehavior(actorId: number): MsActorClonerEntryBehaviorContext {
  return queryActorClonerEntryBehavior(lookupMsActorLifecyclePhase, {
    phase: "cloner-entry",
    actorId,
    entryBehavior: "none",
    blockedCollisionBehavior: "none",
  } satisfies MsActorClonerEntryBehaviorContext);
}

export function msActorClonerCloneBehavior(actorId: number): MsActorClonerCloneBehaviorContext {
  return queryActorClonerCloneBehavior(lookupMsActorLifecyclePhase, {
    phase: "cloner-clone",
    actorId,
    exitStartsMovement: false,
    cloneFamilyRuntime: false,
  } satisfies MsActorClonerCloneBehaviorContext);
}

export function msActorSupportHooks(actorId: number) {
  return queryActorSupportHooks(lookupMsActorLifecyclePhase, {
    phase: "support",
    actorId,
    supportHooks: defaultActorSupportHooks(),
  } satisfies MsActorSupportBehaviorContext);
}

export function msActorBlockedMoveKind(actorId: number): ActorBlockedMoveKind {
  return queryActorBlockedMoveKind(lookupMsActorLifecyclePhase, {
    phase: "blocked-move",
    actorId,
    blockedMoveKind: "stay",
  } satisfies ActorBlockedMovePolicyBehaviorContext);
}

export function msActorCollisionStrategy(actorId: number): ActorCollisionStrategyId {
  return queryActorCollisionStrategy(lookupMsActorLifecyclePhase, {
    phase: "collision",
    actorId,
    collisionStrategyId: "default",
  } satisfies ActorCollisionPolicyBehaviorContext);
}

export function msActorArrivalBehavior(
  tileId: number,
  actorId: number,
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  const hazardName = msHazardName(tileId);
  return queryActorArrivalBehavior(lookupMsActorLifecyclePhase, {
    phase: "arrival",
    actorId,
    tileId,
    hazardName,
    hazardOutcome: "none",
    arrivalOutcome: "none",
  } satisfies ActorArrivalPolicyBehaviorContext, () => defaultActorArrivalFallback(hazardName));
}
