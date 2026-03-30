import type { ActorHazardResponse } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createRulesetActorFamily } from "@game-core/impl/actorFamilies";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxBallisticActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: Partial<Record<"water" | "fire" | "bomb", ActorHazardResponse>>;
}

export function createLynxBallisticActorFamily(options: LynxBallisticActorFamilyOptions): LynxActorFamilyDefinition {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    policy: {
      tags: ["creature", ...(options.tags ?? [])],
      control: {
        mode: "ballistic",
      },
      movement: {
        strategyId: "ballistic-like",
        blockedMoveKind: "revert-portable",
        trapHook: "hold-direction",
        clonerHook: "hold-direction",
        airHook: "chip-support",
      },
      interaction: {
        collisionStrategyId: "ballistic-destroy",
      },
      hazards: {
        responses: options.hazardResponses ?? {},
      },
    },
  });
}
