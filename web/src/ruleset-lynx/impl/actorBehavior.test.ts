import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorClonerCloneBehavior,
  lynxActorClonerEntryBehavior,
  lynxActorHeldFloorOutcomeFromBehavior,
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
  });
});
