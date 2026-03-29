import { describe, expect, it } from "vitest";
import {
  actorClonerClonesFamilyRuntime,
  actorClonerExitStartsMovement,
  actorClonerFamilyHooks,
  actorSupportFamilyHooks,
  actorTrapFamilyHooks,
  actorTrapReleaseStartsMovement,
} from "@game-core/api/actorSpecialFloorHooks";
import {
  MS_BLOCK_ACTOR_CAPABILITIES,
  MS_BOWLING_BALL_ACTOR_CAPABILITIES,
} from "@ruleset-ms/impl/catalogActors";

describe("actor special floor hooks", () => {
  it("derives trap hooks from actor movement policy", () => {
    const blockHooks = actorTrapFamilyHooks(MS_BLOCK_ACTOR_CAPABILITIES);
    const bowlingBallHooks = actorTrapFamilyHooks(MS_BOWLING_BALL_ACTOR_CAPABILITIES);

    expect(blockHooks).toEqual({
      heldFloorOutcome: "hold-direction",
      releaseBehavior: "move-current-direction",
    });
    expect(actorTrapReleaseStartsMovement(blockHooks)).toBe(true);
    expect(bowlingBallHooks).toEqual({
      heldFloorOutcome: "hold-direction",
      releaseBehavior: "move-current-direction",
    });
  });

  it("derives cloner hooks from actor movement policy", () => {
    const hooks = actorClonerFamilyHooks(MS_BOWLING_BALL_ACTOR_CAPABILITIES);

    expect(hooks).toEqual({
      heldFloorOutcome: "hold-direction",
      entryBehavior: "occupy-and-hold",
      blockedCollisionBehavior: "deny-entry",
      exitBehavior: "move-current-direction",
      runtimeCloneBehavior: "clone-family-runtime",
    });
    expect(actorClonerExitStartsMovement(hooks)).toBe(true);
    expect(actorClonerClonesFamilyRuntime(hooks)).toBe(true);
  });

  it("carries support and falling defaults through a dedicated hook shape", () => {
    expect(actorSupportFamilyHooks(MS_BOWLING_BALL_ACTOR_CAPABILITIES)).toEqual({
      airHook: "chip-support",
      unsupportedOutcome: "fall",
      supportLossOutcome: "fall",
      fallingCollisionBehavior: "default",
    });
  });
});
