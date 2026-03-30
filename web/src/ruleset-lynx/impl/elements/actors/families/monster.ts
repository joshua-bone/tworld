import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createMonsterActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxMonsterActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createLynxMonsterActorFamily(options: LynxMonsterActorFamilyOptions): LynxActorFamilyDefinition {
  return createMonsterActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    tags: options.tags,
    defaultHazardResponses: {
      fire: "deny",
    },
    hazardResponses: options.hazardResponses,
  });
}
