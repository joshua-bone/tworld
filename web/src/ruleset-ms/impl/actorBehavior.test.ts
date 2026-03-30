import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorClonerCloneBehavior,
  msActorClonerEntryBehavior,
  msActorHeldFloorOutcomeFromBehavior,
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
  });
});
