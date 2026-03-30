import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createRulesetActorFamily } from "@game-core/impl/actorFamilies";
import type { MsActorFamilyDefinition } from "@ruleset-ms/impl/elements/actors/families/shared";

export interface MsMonsterActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createMsMonsterActorFamily(options: MsMonsterActorFamilyOptions): MsActorFamilyDefinition {
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
        responses: options.hazardResponses ?? {},
      },
    },
  });
}
