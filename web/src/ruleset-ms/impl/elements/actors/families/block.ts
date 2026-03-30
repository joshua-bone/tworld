import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createBlockActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { MsActorFamilyDefinition } from "@ruleset-ms/impl/elements/actors/families/shared";

export interface MsBlockActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createMsBlockActorFamily(options: MsBlockActorFamilyOptions): MsActorFamilyDefinition {
  return createBlockActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    tags: options.tags,
    hazardResponses: options.hazardResponses,
  });
}
