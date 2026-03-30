import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createRulesetActorFamily } from "@game-core/impl/actorFamilies";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxMonsterActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createLynxMonsterActorFamily(options: LynxMonsterActorFamilyOptions): LynxActorFamilyDefinition {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    policy: {
      tags: ["creature", ...(options.tags ?? [])],
      control: {
        mode: "ai",
      },
      inventory: {
        localInventoryMode: "none",
        itemCollectionKind: "none",
        globalProgressKind: "none",
      },
      movement: {
        strategyId: "creature-like",
        airHook: "non-chip-support",
      },
      hazards: {
        responses: {
          fire: "deny",
          ...(options.hazardResponses ?? {}),
        },
      },
    },
  });
}
