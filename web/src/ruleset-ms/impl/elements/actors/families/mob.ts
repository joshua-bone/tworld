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
import { createRulesetActorFamily } from "@game-core/impl/actorFamilies";
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
  const movement = {
    blockedMoveKind: options.blockedMoveKind ?? "stay",
    trapHook: options.trapHook ?? "default",
    clonerHook: options.clonerHook ?? "default",
    ...(options.airHook ? { airHook: options.airHook } : {}),
  } as const;

  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    policy: {
      tags: options.tags ?? [],
      movement,
      interaction: {
        thiefHook: options.thiefHook ?? "none",
        collisionStrategyId: options.collisionStrategyId ?? "default",
      },
      hazards: {
        responses: {
          water: "destroy",
          fire: "destroy",
          bomb: "destroy",
          ...(options.hazardResponses ?? {}),
        },
      },
    },
  });
}
