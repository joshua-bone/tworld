import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorArrivalOutcome,
  lynxActorCollisionOutcome,
  lynxActorHazardOutcome,
  lynxActorHeldFloorOutcome,
  lynxActorThiefOutcome,
} from "@ruleset-lynx/impl/actorInteractions";

describe("lynx actor interactions", () => {
  it("maps collision, hazard, thief, and held-floor outcomes through actor policy", () => {
    expect(lynxActorCollisionOutcome(MS_TILE.Chip, MS_TILE.Ball)).toEqual({
      chipFails: true,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: true,
    });
    expect(lynxActorHazardOutcome(MS_TILE.Fire, MS_TILE.Ball)).toBe("deny-entry");
    expect(lynxActorThiefOutcome(MS_TILE.Chip)).toBe("steal-boots-tools");
    expect(lynxActorHeldFloorOutcome(MS_TILE.CloneMachine, MS_TILE.Fireball)).toBe("hold-direction");
  });

  it("returns typed arrival outcomes for actor landings", () => {
    expect(lynxActorArrivalOutcome(MS_TILE.Button_Red, MS_TILE.Ball)).toBe("button");
    expect(lynxActorArrivalOutcome(MS_TILE.Beartrap, MS_TILE.Ball)).toBe("trap");
    expect(lynxActorArrivalOutcome(MS_TILE.Water, MS_TILE.Block)).toBe("block-water");
    expect(lynxActorArrivalOutcome(MS_TILE.Bomb, MS_TILE.Ball)).toBe("creature-bomb");
    expect(lynxActorArrivalOutcome(MS_TILE.Empty, MS_TILE.Ball)).toBe("none");
  });
});
