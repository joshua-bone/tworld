import type {
  ActorAirHook,
  ActorBlockedMoveKind,
  ActorClonerHook,
  ActorCollisionStrategyId,
  ActorHazardResponse,
  ActorThiefHook,
  ActorTrapHook,
} from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createMobActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { MsActorFamilyDefinition } from "@ruleset-ms/impl/elements/actors/families/shared";

export interface MsMobActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly blockedMoveKind?: ActorBlockedMoveKind;
  readonly trapHook?: ActorTrapHook;
  readonly clonerHook?: ActorClonerHook;
  readonly airHook?: ActorAirHook;
  readonly thiefHook?: ActorThiefHook;
  readonly collisionStrategyId?: ActorCollisionStrategyId;
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createMsMobActorFamily(options: MsMobActorFamilyOptions): MsActorFamilyDefinition {
  return createMobActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    tags: options.tags,
    blockedMoveKind: options.blockedMoveKind,
    trapHook: options.trapHook,
    clonerHook: options.clonerHook,
    airHook: options.airHook,
    thiefHook: options.thiefHook,
    collisionStrategyId: options.collisionStrategyId,
    hazardResponses: options.hazardResponses,
  });
}
