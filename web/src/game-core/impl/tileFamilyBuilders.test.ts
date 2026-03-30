import { describe, expect, it } from "vitest";
import { createWalkableTileFamily, createBlockingTileFamily } from "@game-core/impl/tileFamilyBuilders";
import { composeRulesetTilePolicy } from "@game-core/impl/tileFamilies";

interface TestTilePolicy {
  readonly tags: readonly ("walkable" | "blocking" | "button" | "hint")[];
  readonly capabilities: readonly ("forces-movement" | "trigger-on-entry")[];
  readonly hooks: readonly ("after-enter" | "after-leave")[];
  readonly chipMovementMask: number;
  readonly creatureMovementMask: number;
  readonly blockMovementMask: number;
  readonly exitMovementMask: number;
  readonly requiresReleaseToExit: boolean;
  readonly chipEnterAction: "none" | "trigger";
}

const BASE_POLICY: TestTilePolicy = {
  tags: [],
  capabilities: [],
  hooks: [],
  chipMovementMask: 0,
  creatureMovementMask: 0,
  blockMovementMask: 0,
  exitMovementMask: 15,
  requiresReleaseToExit: false,
  chipEnterAction: "none",
};

describe("tileFamilyBuilders", () => {
  it("builds walkable families with defaults and scalar policy patches", () => {
    const family = createWalkableTileFamily<TestTilePolicy>({
      name: "test-floor",
      tileIds: [1],
      fullMovementMask: 15,
      tags: ["hint"],
      capabilities: ["trigger-on-entry"],
      hooks: ["after-enter"],
      extraPolicy: {
        chipEnterAction: "trigger",
      },
    });

    expect(composeRulesetTilePolicy(BASE_POLICY, 1, [family])).toEqual({
      ...BASE_POLICY,
      tags: ["walkable", "hint"],
      capabilities: ["trigger-on-entry"],
      hooks: ["after-enter"],
      chipMovementMask: 15,
      creatureMovementMask: 15,
      blockMovementMask: 15,
      exitMovementMask: 15,
      chipEnterAction: "trigger",
    });
  });

  it("builds blocking families with dynamic masks and release flags", () => {
    const family = createBlockingTileFamily<TestTilePolicy>({
      name: "test-wall",
      tileIds: [2],
      fullMovementMask: 15,
      baseTags: ["blocking", "button"],
      chipMovementMask: (id) => id,
      requiresReleaseToExit: true,
      extraPolicy: (id) => ({
        creatureMovementMask: id + 1,
      }),
    });

    expect(composeRulesetTilePolicy(BASE_POLICY, 2, [family])).toEqual({
      ...BASE_POLICY,
      tags: ["blocking", "button"],
      capabilities: [],
      hooks: [],
      chipMovementMask: 2,
      creatureMovementMask: 3,
      blockMovementMask: 0,
      exitMovementMask: 15,
      requiresReleaseToExit: true,
      chipEnterAction: "none",
    });
  });
});
