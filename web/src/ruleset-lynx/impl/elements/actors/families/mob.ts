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
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxMobActorFamilyOptions {
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

export function createLynxMobActorFamily(options: LynxMobActorFamilyOptions): LynxActorFamilyDefinition {
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
