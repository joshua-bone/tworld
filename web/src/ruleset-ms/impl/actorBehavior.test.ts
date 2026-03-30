import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorArrivalBehavior,
  msActorBlockedMoveKind,
  msActorClonerCloneBehavior,
  msActorClonerEntryBehavior,
  msActorCollisionStrategy,
  msActorHeldFloorOutcome,
  msActorSupportHooks,
  msActorTrapReleaseStartsMovement,
} from "@ruleset-ms/impl/actorLifecycleQueries";

describe("ms actor behavior", () => {
  it("routes special-floor family behavior through actor handlers", () => {
    expect(msActorHeldFloorOutcome(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(msActorHeldFloorOutcome(MS_TILE.Empty, MS_TILE.BowlingBall)).toBe("none");
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
    expect(msActorSupportHooks(MS_TILE.BowlingBall).airHook).toBe("chip-support");
    expect(msActorSupportHooks(MS_TILE.Block).airHook).toBe("non-chip-support");
    expect(msActorBlockedMoveKind(MS_TILE.BowlingBall)).toBe("revert-portable");
    expect(msActorBlockedMoveKind(MS_TILE.Ball)).toBe("stay");
    expect(msActorCollisionStrategy(MS_TILE.BowlingBall)).toBe("ballistic-destroy");
    expect(msActorCollisionStrategy(MS_TILE.Ball)).toBe("default");
    expect(msActorArrivalBehavior(MS_TILE.Water, MS_TILE.Block)).toEqual({
      hazardOutcome: "block-water",
      arrivalOutcome: "block-water",
    });
    expect(msActorArrivalBehavior(MS_TILE.Fire, MS_TILE.Bug)).toEqual({
      hazardOutcome: "deny-entry",
      arrivalOutcome: "none",
    });
  });
});
