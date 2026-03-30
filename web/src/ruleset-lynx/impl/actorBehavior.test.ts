import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorArrivalBehaviorFromBehavior,
  lynxActorBlockedMoveKindFromBehavior,
  lynxActorClonerCloneBehavior,
  lynxActorClonerEntryBehavior,
  lynxActorCollisionStrategyFromBehavior,
  lynxActorHeldFloorOutcomeFromBehavior,
  lynxActorSupportHooksFromBehavior,
  lynxActorTrapReleaseStartsMovement,
} from "@ruleset-lynx/impl/actorBehavior";

describe("lynx actor behavior", () => {
  it("routes special-floor family behavior through actor handlers", () => {
    expect(lynxActorHeldFloorOutcomeFromBehavior(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(lynxActorHeldFloorOutcomeFromBehavior(MS_TILE.Empty, MS_TILE.BowlingBall)).toBe("none");
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
    expect(lynxActorSupportHooksFromBehavior(MS_TILE.BowlingBall).airHook).toBe("chip-support");
    expect(lynxActorSupportHooksFromBehavior(MS_TILE.Block).airHook).toBe("non-chip-support");
    expect(lynxActorBlockedMoveKindFromBehavior(MS_TILE.BowlingBall)).toBe("revert-portable");
    expect(lynxActorBlockedMoveKindFromBehavior(MS_TILE.Ball)).toBe("stay");
    expect(lynxActorCollisionStrategyFromBehavior(MS_TILE.BowlingBall)).toBe("ballistic-destroy");
    expect(lynxActorCollisionStrategyFromBehavior(MS_TILE.Ball)).toBe("default");
    expect(lynxActorArrivalBehaviorFromBehavior(MS_TILE.Water, MS_TILE.Block)).toEqual({
      hazardOutcome: "block-water",
      arrivalOutcome: "block-water",
    });
    expect(lynxActorArrivalBehaviorFromBehavior(MS_TILE.Fire, MS_TILE.Ball)).toEqual({
      hazardOutcome: "deny-entry",
      arrivalOutcome: "none",
    });
  });
});
