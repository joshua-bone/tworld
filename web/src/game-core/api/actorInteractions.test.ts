import { describe, expect, it } from "vitest";
import {
  actorHazardDeniesEntry,
  actorHazardOutcome,
  actorThiefOutcome,
  chipFailCollisionOutcome,
  noActorCollisionOutcome,
} from "@game-core/api/actorInteractions";

describe("actorInteractions", () => {
  it("maps hazard responses to typed arrival outcomes", () => {
    expect(actorHazardOutcome("water", "transform")).toBe("block-water");
    expect(actorHazardOutcome("water", "destroy")).toBe("creature-water");
    expect(actorHazardOutcome("fire", "deny")).toBe("deny-entry");
    expect(actorHazardOutcome("bomb", "destroy")).toBe("creature-bomb");
    expect(actorHazardOutcome("bomb", "ignore")).toBe("none");
  });

  it("classifies entry-denying hazards, thief effects, and collision defaults", () => {
    expect(actorHazardDeniesEntry("deny-entry")).toBe(true);
    expect(actorHazardDeniesEntry("creature-fire")).toBe(false);
    expect(actorThiefOutcome("steal-boots-tools")).toBe("steal-boots-tools");
    expect(actorThiefOutcome("none")).toBe("none");
    expect(noActorCollisionOutcome()).toEqual({
      chipFails: false,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: false,
    });
    expect(chipFailCollisionOutcome(true)).toEqual({
      chipFails: true,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: true,
    });
  });
});
