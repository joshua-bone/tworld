import { describe, expect, it } from "vitest";
import {
  createBallisticActorFamilyDefinition,
  createBlockActorFamilyDefinition,
  createMonsterActorFamilyDefinition,
  createPlayerLikeActorFamilyDefinition,
  createPortableBackedActorFamilyDefinition,
} from "@game-core/impl/actorFamilyBuilders";
import { composeRulesetActorPolicy } from "@game-core/impl/actorFamilies";

const BASE_POLICY = {
  tags: [],
  capabilities: {
    control: {
      mode: "passive",
    },
    inventory: {
      localInventoryMode: "none",
      itemCollectionKind: "none",
      globalProgressKind: "none",
    },
    movement: {
      strategyId: "creature-like",
      blockedMoveKind: "stay",
      trapHook: "none",
      clonerHook: "none",
      airHook: "non-chip-support",
    },
    interaction: {
      thiefHook: "none",
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
} as const;

describe("actorFamilyBuilders", () => {
  it("builds monster and block families with stable defaults", () => {
    const monster = createMonsterActorFamilyDefinition({
      name: "monster",
      actorIds: [1],
      defaultHazardResponses: {
        fire: "deny",
      },
    });
    const block = createBlockActorFamilyDefinition({
      name: "block",
      actorIds: [2],
      baseTags: ["block", "fire-immune"],
    });

    expect(composeRulesetActorPolicy(BASE_POLICY, 1, [monster])).toMatchObject({
      tags: ["creature"],
      capabilities: {
        control: { mode: "ai" },
        movement: { strategyId: "creature-like", airHook: "non-chip-support" },
        hazards: { responses: { fire: "deny" } },
      },
    });
    expect(composeRulesetActorPolicy(BASE_POLICY, 2, [block])).toMatchObject({
      tags: ["block", "fire-immune"],
      capabilities: {
        movement: { strategyId: "block-like" },
        hazards: { responses: { water: "transform", fire: "ignore", bomb: "transform" } },
      },
    });
  });

  it("builds ballistic, player-like, and portable-backed families with inventory/collision defaults", () => {
    const ballistic = createBallisticActorFamilyDefinition({
      name: "ballistic",
      actorIds: [3],
    });
    const playerLike = createPlayerLikeActorFamilyDefinition({
      name: "player",
      actorIds: [4],
      baseTags: ["chip", "collects-items", "pushes-blocks"],
    });
    const portableBacked = createPortableBackedActorFamilyDefinition({
      name: "portable",
      actorIds: [5],
      localInventoryMode: "keys-boots",
      itemCollectionKind: "keys-boots",
      globalProgressKind: "collect-chips",
    });

    expect(composeRulesetActorPolicy(BASE_POLICY, 3, [ballistic])).toMatchObject({
      tags: ["creature"],
      capabilities: {
        control: { mode: "ballistic" },
        movement: {
          strategyId: "ballistic-like",
          blockedMoveKind: "revert-portable",
          trapHook: "hold-direction",
          clonerHook: "hold-direction",
          airHook: "chip-support",
        },
        interaction: { collisionStrategyId: "ballistic-destroy" },
      },
    });
    expect(composeRulesetActorPolicy(BASE_POLICY, 4, [playerLike])).toMatchObject({
      tags: ["chip", "collects-items", "pushes-blocks"],
      capabilities: {
        control: { mode: "player-input" },
        inventory: {
          localInventoryMode: "keys-boots-tools",
          itemCollectionKind: "keys-boots-tools",
          globalProgressKind: "collect-chips",
        },
      },
    });
    expect(composeRulesetActorPolicy(BASE_POLICY, 5, [portableBacked])).toMatchObject({
      tags: ["collects-items"],
      capabilities: {
        inventory: {
          localInventoryMode: "keys-boots",
          itemCollectionKind: "keys-boots",
          globalProgressKind: "collect-chips",
        },
        interaction: { thiefHook: "steal-boots-tools" },
      },
    });
  });
});
