import { describe, expect, it } from "vitest";
import {
  actorAirHook,
  actorBlockedMoveKeepsDirection,
  actorBlockedMoveKind,
  actorBlockedMoveRevertsPortable,
  actorClonerHook,
  actorCollectionAllowsSlot,
  actorCollectsChips,
  actorCollisionStrategyId,
  actorControlMode,
  actorGlobalProgressKind,
  actorHazardResponse,
  actorItemCollectionKind,
  actorLocalInventoryMode,
  actorMovementStrategyId,
  actorThiefStealsBootsAndTools,
  actorThiefHook,
  actorTrapHook,
  actorUsesChipSupport,
  type ActorCapabilityPolicy,
} from "@game-core/api/actorCapabilities";

describe("actorCapabilities", () => {
  const chipLikePolicy = {
    control: {
      mode: "player-input",
    },
    inventory: {
      localInventoryMode: "keys-boots-tools",
      itemCollectionKind: "keys-boots-tools",
      globalProgressKind: "collect-chips",
    },
    movement: {
      strategyId: "chip-like",
      blockedMoveKind: "revert-portable",
      trapHook: "hold-direction",
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
        fire: "deny",
        bomb: "ignore",
      },
    },
  } as const satisfies ActorCapabilityPolicy;

  it("exposes grouped policy accessors", () => {
    expect(actorControlMode(chipLikePolicy)).toBe("player-input");
    expect(actorLocalInventoryMode(chipLikePolicy)).toBe("keys-boots-tools");
    expect(actorItemCollectionKind(chipLikePolicy)).toBe("keys-boots-tools");
    expect(actorGlobalProgressKind(chipLikePolicy)).toBe("collect-chips");
    expect(actorMovementStrategyId(chipLikePolicy)).toBe("chip-like");
    expect(actorBlockedMoveKind(chipLikePolicy)).toBe("revert-portable");
    expect(actorTrapHook(chipLikePolicy)).toBe("hold-direction");
    expect(actorClonerHook(chipLikePolicy)).toBe("default");
    expect(actorAirHook(chipLikePolicy)).toBe("chip-support");
    expect(actorThiefHook(chipLikePolicy)).toBe("steal-boots-tools");
    expect(actorCollisionStrategyId(chipLikePolicy)).toBe("default");
    expect(actorHazardResponse(chipLikePolicy, "fire")).toBe("deny");
  });

  it("classifies collection and progress capabilities", () => {
    expect(actorCollectionAllowsSlot("keys-boots-tools", "tools")).toBe(true);
    expect(actorCollectionAllowsSlot("keys-boots", "tools")).toBe(false);
    expect(actorCollectsChips("collect-chips")).toBe(true);
    expect(actorCollectsChips("none")).toBe(false);
  });

  it("classifies blocked-move, thief, and support hooks", () => {
    expect(actorBlockedMoveKeepsDirection("hold-direction")).toBe(true);
    expect(actorBlockedMoveKeepsDirection("stay")).toBe(false);
    expect(actorBlockedMoveRevertsPortable("revert-portable")).toBe(true);
    expect(actorBlockedMoveRevertsPortable("stay")).toBe(false);
    expect(actorThiefStealsBootsAndTools("steal-boots-tools")).toBe(true);
    expect(actorThiefStealsBootsAndTools("none")).toBe(false);
    expect(actorUsesChipSupport("chip-support")).toBe(true);
    expect(actorUsesChipSupport("non-chip-support")).toBe(false);
  });
});
