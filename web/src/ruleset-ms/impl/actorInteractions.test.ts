import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorArrivalOutcome,
  msActorCollisionOutcome,
  msActorHazardOutcome,
  msActorHeldFloorOutcome,
  msActorThiefOutcome,
} from "@ruleset-ms/impl/actorInteractions";

describe("ms actor interactions", () => {
  it("maps collision, hazard, thief, and held-floor outcomes through actor policy", () => {
    expect(msActorCollisionOutcome(MS_TILE.Ball, MS_TILE.Chip)).toEqual({
      chipFails: true,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: false,
    });
    expect(msActorHazardOutcome(MS_TILE.Fire, MS_TILE.Bug)).toBe("deny-entry");
    expect(msActorThiefOutcome(MS_TILE.Chip)).toBe("steal-boots-tools");
    expect(msActorHeldFloorOutcome(MS_TILE.Beartrap, MS_TILE.Fireball)).toBe("hold-direction");
  });

  it("returns typed arrival outcomes for actor landings", () => {
    expect(msActorArrivalOutcome(MS_TILE.Water, MS_TILE.Block)).toBe("block-water");
    expect(msActorArrivalOutcome(MS_TILE.Fire, MS_TILE.Glider)).toBe("creature-fire");
    expect(msActorArrivalOutcome(MS_TILE.Bomb, MS_TILE.Ball)).toBe("creature-bomb");
    expect(msActorArrivalOutcome(MS_TILE.Empty, MS_TILE.Ball)).toBe("none");
  });
});
