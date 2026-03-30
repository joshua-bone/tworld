import type {
  ActorBlockedMoveKind,
  ActorCollisionStrategyId,
  ActorHazardName,
} from "@game-core/api/actorCapabilities";
import { DEFAULT_ACTOR_SUPPORT_FAMILY_HOOKS, type ActorSupportFamilyHooks } from "@game-core/api/actorSpecialFloorHooks";
import type { ActorArrivalOutcome, ActorHazardOutcome, ActorHeldFloorOutcome } from "@game-core/api/actorInteractions";
import type { ActorLifecyclePhase, ActorLifecycleHandler } from "@game-core/api/ruleset";

export interface ActorPhaseLookup<TTileId extends number = number, TActorId extends number = number> {
  (actorId: TActorId, phase: ActorLifecyclePhase): ActorLifecycleHandler<TTileId, TActorId> | null;
}

export function defaultActorArrivalFallback(
  hazardName: ActorHazardName | null,
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  switch (hazardName) {
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

export function runActorLifecyclePhase<TTileId extends number, TActorId extends number, TContext extends { phase: ActorLifecyclePhase; actorId: TActorId }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): TContext {
  const handler = lookupPhase(context.actorId, context.phase);
  if (handler !== null) {
    (handler as (context: TContext) => void)(context);
  }
  return context;
}

export function queryActorHeldFloorOutcome<TTileId extends number, TActorId extends number, TContext extends { phase: "held-floor"; actorId: TActorId; heldFloorOutcome: ActorHeldFloorOutcome }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): ActorHeldFloorOutcome {
  return runActorLifecyclePhase(lookupPhase, context).heldFloorOutcome;
}

export function queryActorTrapReleaseStartsMovement<TTileId extends number, TActorId extends number, TContext extends { phase: "trap-release"; actorId: TActorId; startsMovement: boolean }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): boolean {
  return runActorLifecyclePhase(lookupPhase, context).startsMovement;
}

export function queryActorClonerEntryBehavior<TTileId extends number, TActorId extends number, TContext extends { phase: "cloner-entry"; actorId: TActorId }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): TContext {
  return runActorLifecyclePhase(lookupPhase, context);
}

export function queryActorClonerCloneBehavior<TTileId extends number, TActorId extends number, TContext extends { phase: "cloner-clone"; actorId: TActorId }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): TContext {
  return runActorLifecyclePhase(lookupPhase, context);
}

export function queryActorSupportHooks<TTileId extends number, TActorId extends number, TContext extends { phase: "support"; actorId: TActorId; supportHooks: ActorSupportFamilyHooks }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): ActorSupportFamilyHooks {
  return runActorLifecyclePhase(lookupPhase, context).supportHooks;
}

export function defaultActorSupportHooks(): ActorSupportFamilyHooks {
  return DEFAULT_ACTOR_SUPPORT_FAMILY_HOOKS;
}

export function queryActorBlockedMoveKind<TTileId extends number, TActorId extends number, TContext extends { phase: "blocked-move"; actorId: TActorId; blockedMoveKind: ActorBlockedMoveKind }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): ActorBlockedMoveKind {
  return runActorLifecyclePhase(lookupPhase, context).blockedMoveKind;
}

export function queryActorCollisionStrategy<TTileId extends number, TActorId extends number, TContext extends { phase: "collision"; actorId: TActorId; collisionStrategyId: ActorCollisionStrategyId }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
): ActorCollisionStrategyId {
  return runActorLifecyclePhase(lookupPhase, context).collisionStrategyId;
}

export function queryActorArrivalBehavior<TTileId extends number, TActorId extends number, TContext extends { phase: "arrival"; actorId: TActorId; hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome }>(
  lookupPhase: ActorPhaseLookup<TTileId, TActorId>,
  context: TContext,
  fallback: () => { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome },
): { hazardOutcome: ActorHazardOutcome; arrivalOutcome: ActorArrivalOutcome } {
  const arrival = lookupPhase(context.actorId, context.phase);
  if (arrival === null) {
    return fallback();
  }

  (arrival as (context: TContext) => void)(context);
  return {
    hazardOutcome: context.hazardOutcome,
    arrivalOutcome: context.arrivalOutcome,
  };
}
