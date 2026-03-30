import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createBlockActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxBlockActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createLynxBlockActorFamily(options: LynxBlockActorFamilyOptions): LynxActorFamilyDefinition {
  return createBlockActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    baseTags: ["block", "fire-immune"],
    tags: options.tags,
    hazardResponses: options.hazardResponses,
  });
}
