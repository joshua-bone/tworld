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
  type LynxActorClonerCloneBehaviorContext,
  type LynxActorClonerEntryBehaviorContext,
  type LynxActorHeldFloorBehaviorContext,
  type LynxActorSupportBehaviorContext,
  type LynxActorTrapReleaseBehaviorContext,
} from "@ruleset-lynx/impl/elements/actors/families/specialFloors";
import { lookupLynxActorLifecyclePhase } from "@ruleset-lynx/impl/actorLifecycleRegistration";

const LYNX_HAZARD_NAME_BY_TILE = new Map<number, ActorHazardName>([
  [MS_TILE.Water, "water"],
  [MS_TILE.Fire, "fire"],
  [MS_TILE.Bomb, "bomb"],
]);

function lynxHazardName(tileId: number): ActorHazardName | null {
  return LYNX_HAZARD_NAME_BY_TILE.get(tileId) ?? null;
}

export function lynxActorHeldFloorOutcome(tileId: number, actorId: number): ActorHeldFloorOutcome {
  return queryActorHeldFloorOutcome(lookupLynxActorLifecyclePhase, {
    phase: "held-floor",
    actorId,
    tileId,
    heldFloorOutcome: "none",
  } satisfies LynxActorHeldFloorBehaviorContext);
}

export function lynxActorTrapReleaseStartsMovement(actorId: number): boolean {
  return queryActorTrapReleaseStartsMovement(lookupLynxActorLifecyclePhase, {
    phase: "trap-release",
    actorId,
    startsMovement: false,
  } satisfies LynxActorTrapReleaseBehaviorContext);
}

export function lynxActorClonerEntryBehavior(actorId: number): LynxActorClonerEntryBehaviorContext {
  return queryActorClonerEntryBehavior(lookupLynxActorLifecyclePhase, {
    phase: "cloner-entry",
    actorId,
    entryBehavior: "none",
    blockedCollisionBehavior: "none",
  } satisfies LynxActorClonerEntryBehaviorContext);
}

export function lynxActorClonerCloneBehavior(actorId: number): LynxActorClonerCloneBehaviorContext {
  return queryActorClonerCloneBehavior(lookupLynxActorLifecyclePhase, {
    phase: "cloner-clone",
    actorId,
    exitStartsMovement: false,
    cloneFamilyRuntime: false,
  } satisfies LynxActorClonerCloneBehaviorContext);
}

export function lynxActorSupportHooks(actorId: number) {
  return queryActorSupportHooks(lookupLynxActorLifecyclePhase, {
    phase: "support",
    actorId,
    supportHooks: defaultActorSupportHooks(),
  } satisfies LynxActorSupportBehaviorContext);
}

export function lynxActorBlockedMoveKind(actorId: number): ActorBlockedMoveKind {
  return queryActorBlockedMoveKind(lookupLynxActorLifecyclePhase, {
    phase: "blocked-move",
    actorId,
    blockedMoveKind: "stay",
  } satisfies ActorBlockedMovePolicyBehaviorContext);
}

export function lynxActorCollisionStrategy(actorId: number): ActorCollisionStrategyId {
  return queryActorCollisionStrategy(lookupLynxActorLifecyclePhase, {
    phase: "collision",
    actorId,
    collisionStrategyId: "default",
  } satisfies ActorCollisionPolicyBehaviorContext);
}

export function lynxActorArrivalBehavior(
  tileId: number,
  actorId: number,
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  const hazardName = lynxHazardName(tileId);
  return queryActorArrivalBehavior(lookupLynxActorLifecyclePhase, {
    phase: "arrival",
    actorId,
    tileId,
    hazardName,
    hazardOutcome: "none",
    arrivalOutcome: "none",
  } satisfies ActorArrivalPolicyBehaviorContext, () => defaultActorArrivalFallback(hazardName));
}
