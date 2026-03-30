import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorArrivalBehavior,
  lynxActorBlockedMoveKind,
  lynxActorClonerCloneBehavior,
  lynxActorClonerEntryBehavior,
  lynxActorCollisionStrategy,
  lynxActorHeldFloorOutcome,
  lynxActorSupportHooks,
  lynxActorTrapReleaseStartsMovement,
} from "@ruleset-lynx/impl/actorLifecycleQueries";

describe("lynx actor behavior", () => {
  it("routes special-floor family behavior through actor handlers", () => {
    expect(lynxActorHeldFloorOutcome(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(lynxActorHeldFloorOutcome(MS_TILE.Empty, MS_TILE.BowlingBall)).toBe("none");
    expect(lynxActorTrapReleaseStartsMovement(MS_TILE.BowlingBall)).toBe(true);
    expect(lynxActorTrapReleaseStartsMovement(MS_TILE.Empty)).toBe(false);

    expect(lynxActorClonerEntryBehavior(MS_TILE.BowlingBall)).toMatchObject({
      entryBehavior: "occupy-and-hold",
      blockedCollisionBehavior: "deny-entry",
    });
    expect(lynxActorClonerCloneBehavior(MS_TILE.BowlingBall)).toMatchObject({
      exitStartsMovement: true,
      cloneFamilyRuntime: true,
    });
    expect(lynxActorSupportHooks(MS_TILE.BowlingBall).airHook).toBe("chip-support");
    expect(lynxActorSupportHooks(MS_TILE.Block).airHook).toBe("non-chip-support");
    expect(lynxActorBlockedMoveKind(MS_TILE.BowlingBall)).toBe("revert-portable");
    expect(lynxActorBlockedMoveKind(MS_TILE.Ball)).toBe("stay");
    expect(lynxActorCollisionStrategy(MS_TILE.BowlingBall)).toBe("ballistic-destroy");
    expect(lynxActorCollisionStrategy(MS_TILE.Ball)).toBe("default");
    expect(lynxActorArrivalBehavior(MS_TILE.Water, MS_TILE.Block)).toEqual({
      hazardOutcome: "block-water",
      arrivalOutcome: "block-water",
    });
    expect(lynxActorArrivalBehavior(MS_TILE.Fire, MS_TILE.Ball)).toEqual({
      hazardOutcome: "deny-entry",
      arrivalOutcome: "none",
    });
  });
});
