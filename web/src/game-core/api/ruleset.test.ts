import { describe, expect, it, vi } from "vitest";
import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import {
  createActorBehavior,
  createRulesetCatalog,
  createTileBehavior,
  lookupActorBehaviorPhase,
  lookupTileBehaviorPhase,
} from "@game-core/api/ruleset";

describe("ruleset behavior registration", () => {
  const testActorCapabilities = {
    control: {
      mode: "ai",
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
  } as const satisfies ActorCapabilityPolicy;

  it("registers optional tile and actor behavior handlers while defaulting others to no-op behavior", () => {
    const tileTick = vi.fn();
    const actorArrival = vi.fn();
    const catalog = createRulesetCatalog({
      name: "test",
      tiles: [
        {
          id: 1,
          code: "test:floor",
          name: "Test Floor",
          tags: [],
          capabilities: [],
          hooks: [],
          behavior: createTileBehavior({
            tick: tileTick,
          }),
        },
        {
          id: 2,
          code: "test:wall",
          name: "Test Wall",
          tags: ["blocking"],
          capabilities: [],
          hooks: [],
        },
      ],
      actors: [
        {
          id: 10,
          code: "test:creature",
          name: "Test Creature",
          tags: ["creature"],
          capabilities: testActorCapabilities,
          behavior: createActorBehavior({
            arrival: actorArrival,
          }),
        },
        {
          id: 11,
          code: "test:block",
          name: "Test Block",
          tags: ["block"],
          capabilities: testActorCapabilities,
        },
      ],
    });

    expect(lookupTileBehaviorPhase(catalog.getTileBehavior(1)!, "tick")).toBe(tileTick);
    expect(lookupActorBehaviorPhase(catalog.getActorBehavior(10)!, "arrival")).toBe(actorArrival);
    expect(catalog.getTileBehavior(2)?.phases).toEqual({});
    expect(catalog.getActorBehavior(11)?.phases).toEqual({});
    expect(catalog.getTile(2)?.name).toBe("Test Wall");
    expect(catalog.getActor(11)?.code).toBe("test:block");
  });
});
