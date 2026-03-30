import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createBallisticActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxBallisticActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createLynxBallisticActorFamily(options: LynxBallisticActorFamilyOptions): LynxActorFamilyDefinition {
  return createBallisticActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    tags: options.tags,
    hazardResponses: options.hazardResponses,
  });
}
