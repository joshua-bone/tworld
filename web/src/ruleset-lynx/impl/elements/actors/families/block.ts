import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createRulesetActorFamily } from "@game-core/impl/actorFamilies";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxBlockActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createLynxBlockActorFamily(options: LynxBlockActorFamilyOptions): LynxActorFamilyDefinition {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    policy: {
      tags: ["block", "fire-immune", ...(options.tags ?? [])],
      control: {
        mode: "passive",
      },
      inventory: {
        localInventoryMode: "none",
        itemCollectionKind: "none",
        globalProgressKind: "none",
      },
      movement: {
        strategyId: "block-like",
        blockedMoveKind: "stay",
        trapHook: "default",
        clonerHook: "default",
        airHook: "non-chip-support",
      },
      interaction: {
        thiefHook: "none",
        collisionStrategyId: "default",
      },
      hazards: {
        responses: {
          water: "transform",
          fire: "ignore",
          bomb: "transform",
          ...(options.hazardResponses ?? {}),
        },
      },
    },
  });
}
