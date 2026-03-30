import type { ActorGlobalProgressKind, ActorItemCollectionKind, ActorLocalInventoryMode } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createRulesetActorFamily } from "@game-core/impl/actorFamilies";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxPlayerLikeActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly localInventoryMode?: ActorLocalInventoryMode;
  readonly itemCollectionKind?: ActorItemCollectionKind;
  readonly globalProgressKind?: ActorGlobalProgressKind;
  readonly tags?: readonly ActorTag[];
}

export function createLynxPlayerLikeActorFamily(options: LynxPlayerLikeActorFamilyOptions): LynxActorFamilyDefinition {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    policy: {
      tags: ["chip", "collects-items", "pushes-blocks", ...(options.tags ?? [])],
      control: {
        mode: "player-input",
      },
      inventory: {
        localInventoryMode: options.localInventoryMode ?? "keys-boots-tools",
        itemCollectionKind: options.itemCollectionKind ?? "keys-boots-tools",
        globalProgressKind: options.globalProgressKind ?? "collect-chips",
      },
      movement: {
        strategyId: "chip-like",
        blockedMoveKind: "stay",
        trapHook: "default",
        clonerHook: "default",
        airHook: "chip-support",
      },
      interaction: {
        thiefHook: "steal-boots-tools",
        collisionStrategyId: "default",
      },
      hazards: {
        responses: {
          water: "destroy",
          fire: "destroy",
          bomb: "destroy",
        },
      },
    },
  });
}
