import { describe, expect, it, vi } from "vitest";
import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import {
  composeActorBehaviors,
  composeTileBehaviors,
  createActorBehavior,
  createRulesetCatalog,
  createTileBehavior,
  lookupActorBehaviorHook,
  lookupActorBehaviorPhase,
  lookupTileBehaviorHook,
  lookupTileBehaviorPhase,
  type ActorLifecycleHooks,
  type TileLifecycleHooks,
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

  it("composes multiple tile behaviors into one phase map", () => {
    const beginEnter = vi.fn();
    const afterLeave = vi.fn();

    const behavior = composeTileBehaviors(
      createTileBehavior({ "begin-enter": beginEnter }),
      createTileBehavior({ "complete-exit": afterLeave }),
    );

    expect(lookupTileBehaviorPhase(behavior!, "begin-enter")).toBe(beginEnter);
    expect(lookupTileBehaviorPhase(behavior!, "complete-exit")).toBe(afterLeave);
  });

  it("accepts named tile lifecycle hooks and exposes both hook and phase lookups", () => {
    const tileHooks = {
      startEnter: vi.fn(),
      finishExit: vi.fn(),
    } as const satisfies Partial<TileLifecycleHooks<number, number>>;

    const behavior = createTileBehavior(tileHooks);

    expect(lookupTileBehaviorHook(behavior, "startEnter")).toBe(tileHooks.startEnter);
    expect(lookupTileBehaviorPhase(behavior, "begin-enter")).toBe(tileHooks.startEnter);
    expect(lookupTileBehaviorHook(behavior, "finishExit")).toBe(tileHooks.finishExit);
    expect(lookupTileBehaviorPhase(behavior, "complete-exit")).toBe(tileHooks.finishExit);
  });

  it("composes multiple actor behaviors into one phase map", () => {
    const heldFloor = vi.fn();
    const trapRelease = vi.fn();

    const behavior = composeActorBehaviors(
      createActorBehavior({ "held-floor": heldFloor }),
      createActorBehavior({ "trap-release": trapRelease }),
    );

    expect(lookupActorBehaviorPhase(behavior!, "held-floor")).toBe(heldFloor);
    expect(lookupActorBehaviorPhase(behavior!, "trap-release")).toBe(trapRelease);
  });

  it("accepts named actor lifecycle hooks and exposes both hook and phase lookups", () => {
    const actorHooks = {
      heldFloor: vi.fn(),
      trapRelease: vi.fn(),
    } as const satisfies Partial<ActorLifecycleHooks<number, number>>;

    const behavior = createActorBehavior(actorHooks);

    expect(lookupActorBehaviorHook(behavior, "heldFloor")).toBe(actorHooks.heldFloor);
    expect(lookupActorBehaviorPhase(behavior, "held-floor")).toBe(actorHooks.heldFloor);
    expect(lookupActorBehaviorHook(behavior, "trapRelease")).toBe(actorHooks.trapRelease);
    expect(lookupActorBehaviorPhase(behavior, "trap-release")).toBe(actorHooks.trapRelease);
  });
});
