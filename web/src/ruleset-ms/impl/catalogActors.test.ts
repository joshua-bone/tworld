import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  MS_BLOCK_ACTOR_CAPABILITIES,
  MS_BOWLING_BALL_ACTOR_CAPABILITIES,
  MS_CHIP_ACTOR_CAPABILITIES,
  MS_CREATURE_ACTOR_CAPABILITIES,
  lookupMsActorDefinition,
  lookupMsCreaturePlanningPolicy,
} from "@ruleset-ms/impl/catalogActors";
import { msRulesetCatalog } from "@ruleset-ms/impl/catalog";

describe("ms catalogActors", () => {
  it("registers Smart Teeth as a slow coordinated monster without inventory", () => {
    expect(lookupMsActorDefinition(MS_TILE.SmartTeeth)).toMatchObject({
      name: "Smart Teeth",
      tags: expect.arrayContaining(["creature"]),
      capabilities: {
        movement: { strategyId: "creature-like" },
        inventory: { localInventoryMode: "none", itemCollectionKind: "none" },
        hazards: { responses: { water: "destroy", fire: "destroy", bomb: "destroy" } },
      },
    });
    expect(lookupMsCreaturePlanningPolicy(MS_TILE.SmartTeeth)).toEqual({
      strategy: "coordinated-pursuit", cadence: "half-speed",
    });
    expect(lookupMsCreaturePlanningPolicy(MS_TILE.Teeth)?.cadence).toBe("half-speed");
    expect(lookupMsCreaturePlanningPolicy(MS_TILE.Blob)?.cadence).toBe("half-speed");
  });
  it("keeps the baseline actor family policies stable", () => {
    expect(MS_CHIP_ACTOR_CAPABILITIES.control.mode).toBe("player-input");
    expect(MS_BLOCK_ACTOR_CAPABILITIES.movement.strategyId).toBe("block-like");
    expect(lookupMsActorDefinition(MS_TILE.IceBlock)?.capabilities.movement.strategyId).toBe("block-like");
    expect(MS_CREATURE_ACTOR_CAPABILITIES.movement.strategyId).toBe("creature-like");
    expect(MS_BOWLING_BALL_ACTOR_CAPABILITIES.movement.strategyId).toBe("ballistic-like");
  });

  it("composes actor families for glider, fireball, bug, and bowling ball", () => {
    expect(lookupMsActorDefinition(MS_TILE.Glider)?.capabilities.hazards.responses.water).toBe("ignore");
    expect(lookupMsActorDefinition(MS_TILE.Fireball)?.capabilities.hazards.responses.fire).toBe("ignore");
    expect(lookupMsActorDefinition(MS_TILE.Bug)?.capabilities.hazards.responses.fire).toBe("deny");
    expect(lookupMsActorDefinition(MS_TILE.Walker)?.capabilities.hazards.responses.fire).toBe("deny");

    expect(lookupMsActorDefinition(MS_TILE.BowlingBall)).toMatchObject({
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
    expect(lookupMsActorDefinition(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.east))?.id).toBe(MS_TILE.Bug);
    expect(lookupMsActorDefinition(msCreatureTile(MS_TILE.IceBlock, MS_DIRECTION.east))?.id).toBe(MS_TILE.IceBlock);
  });

  it("registers actor behavior hooks for trap and cloner families", () => {
    expect(msRulesetCatalog.getActorBehavior(MS_TILE.BowlingBall)?.phases).toMatchObject({
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
