import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createMonsterActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { MsActorFamilyDefinition } from "@ruleset-ms/impl/elements/actors/families/shared";

export interface MsMonsterActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createMsMonsterActorFamily(options: MsMonsterActorFamilyOptions): MsActorFamilyDefinition {
  return createMonsterActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    tags: options.tags,
    hazardResponses: options.hazardResponses,
  });
}
