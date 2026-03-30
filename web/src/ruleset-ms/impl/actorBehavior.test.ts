import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorArrivalBehaviorFromBehavior,
  msActorBlockedMoveKindFromBehavior,
  msActorClonerCloneBehavior,
  msActorClonerEntryBehavior,
  msActorCollisionStrategyFromBehavior,
  msActorHeldFloorOutcomeFromBehavior,
  msActorSupportHooksFromBehavior,
  msActorTrapReleaseStartsMovement,
} from "@ruleset-ms/impl/actorBehavior";

describe("ms actor behavior", () => {
  it("routes special-floor family behavior through actor handlers", () => {
    expect(msActorHeldFloorOutcomeFromBehavior(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(msActorHeldFloorOutcomeFromBehavior(MS_TILE.Empty, MS_TILE.BowlingBall)).toBe("none");
    expect(msActorTrapReleaseStartsMovement(MS_TILE.BowlingBall)).toBe(true);
    expect(msActorTrapReleaseStartsMovement(MS_TILE.Empty)).toBe(false);

    expect(msActorClonerEntryBehavior(MS_TILE.BowlingBall)).toMatchObject({
      entryBehavior: "occupy-and-hold",
      blockedCollisionBehavior: "deny-entry",
    });
    expect(msActorClonerCloneBehavior(MS_TILE.BowlingBall)).toMatchObject({
      exitStartsMovement: true,
      cloneFamilyRuntime: true,
    });
    expect(msActorSupportHooksFromBehavior(MS_TILE.BowlingBall).airHook).toBe("chip-support");
    expect(msActorSupportHooksFromBehavior(MS_TILE.Block).airHook).toBe("non-chip-support");
    expect(msActorBlockedMoveKindFromBehavior(MS_TILE.BowlingBall)).toBe("revert-portable");
    expect(msActorBlockedMoveKindFromBehavior(MS_TILE.Ball)).toBe("stay");
    expect(msActorCollisionStrategyFromBehavior(MS_TILE.BowlingBall)).toBe("ballistic-destroy");
    expect(msActorCollisionStrategyFromBehavior(MS_TILE.Ball)).toBe("default");
    expect(msActorArrivalBehaviorFromBehavior(MS_TILE.Water, MS_TILE.Block)).toEqual({
      hazardOutcome: "block-water",
      arrivalOutcome: "block-water",
    });
    expect(msActorArrivalBehaviorFromBehavior(MS_TILE.Fire, MS_TILE.Bug)).toEqual({
      hazardOutcome: "deny-entry",
      arrivalOutcome: "none",
    });
  });
});
