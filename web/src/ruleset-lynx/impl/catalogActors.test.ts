import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  LYNX_BLOCK_ACTOR_CAPABILITIES,
  LYNX_BOWLING_BALL_ACTOR_CAPABILITIES,
  LYNX_CHIP_ACTOR_CAPABILITIES,
  LYNX_CREATURE_ACTOR_CAPABILITIES,
  lookupLynxActorDefinition,
} from "@ruleset-lynx/impl/catalogActors";
import { lynxRulesetCatalog } from "@ruleset-lynx/impl/catalog";

describe("lynx catalogActors", () => {
  it("keeps the baseline actor family policies stable", () => {
    expect(LYNX_CHIP_ACTOR_CAPABILITIES.control.mode).toBe("player-input");
    expect(LYNX_BLOCK_ACTOR_CAPABILITIES.movement.strategyId).toBe("block-like");
    expect(lookupLynxActorDefinition(MS_TILE.IceBlock)?.capabilities.movement.strategyId).toBe("block-like");
    expect(LYNX_CREATURE_ACTOR_CAPABILITIES.movement.strategyId).toBe("creature-like");
    expect(LYNX_BOWLING_BALL_ACTOR_CAPABILITIES.movement.strategyId).toBe("ballistic-like");
  });

  it("composes actor families for glider, fireball, bug, and bowling ball", () => {
    expect(lookupLynxActorDefinition(MS_TILE.Glider)?.capabilities.hazards.responses.water).toBe("ignore");
    expect(lookupLynxActorDefinition(MS_TILE.Fireball)?.capabilities.hazards.responses.fire).toBe("ignore");
    expect(lookupLynxActorDefinition(MS_TILE.Bug)?.capabilities.hazards.responses.fire).toBe("deny");

    expect(lookupLynxActorDefinition(MS_TILE.BowlingBall)).toMatchObject({
      tags: expect.arrayContaining(["creature", "collects-items"]),
      capabilities: {
        control: { mode: "ballistic" },
        inventory: {
          localInventoryMode: "keys-boots",
          itemCollectionKind: "keys-boots",
          globalProgressKind: "collect-chips",
        },
        movement: {
          strategyId: "ballistic-like",
          blockedMoveKind: "revert-portable",
          trapHook: "hold-direction",
          clonerHook: "hold-direction",
          airHook: "chip-support",
        },
        interaction: {
          thiefHook: "steal-boots-tools",
          collisionStrategyId: "ballistic-destroy",
        },
      },
    });
  });

  it("normalizes creature tiles back to their actor definitions", () => {
    expect(lookupLynxActorDefinition(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west))?.id).toBe(MS_TILE.Bug);
    expect(lookupLynxActorDefinition(msCreatureTile(MS_TILE.IceBlock, MS_DIRECTION.east))?.id).toBe(MS_TILE.IceBlock);
  });

  it("registers actor behavior hooks for trap and cloner families", () => {
    expect(lynxRulesetCatalog.getActorBehavior(MS_TILE.BowlingBall)?.phases).toMatchObject({
      "blocked-move": expect.any(Function),
      collision: expect.any(Function),
      arrival: expect.any(Function),
      "held-floor": expect.any(Function),
      "trap-release": expect.any(Function),
      "cloner-entry": expect.any(Function),
      "cloner-clone": expect.any(Function),
    });
  });
});
