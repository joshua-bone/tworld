import { describe, expect, it } from "vitest";
import {
  ACTOR_INTERACTION_TARGET_KIND,
  chipFailCollisionOutcome,
  consumeTargetCollisionOutcome,
  denyMoveCollisionOutcome,
  noActorCollisionOutcome,
  preserveActorCollisionOutcome,
} from "@game-core/api/actorInteractions";

describe("actorInteractions", () => {
  it("exposes typed interaction target kinds", () => {
    expect(ACTOR_INTERACTION_TARGET_KIND.runtimeActor).toBe("runtime-actor");
    expect(ACTOR_INTERACTION_TARGET_KIND.portableItem).toBe("portable-item");
  });

  it("builds typed interaction outcomes for deny, chip-fail, consume, and preserve flows", () => {
    expect(noActorCollisionOutcome()).toEqual({
      chipFails: false,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: false,
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    });
    expect(denyMoveCollisionOutcome().denyMove).toBe(true);
    expect(chipFailCollisionOutcome(true)).toEqual({
      chipFails: true,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: true,
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    });
    expect(consumeTargetCollisionOutcome(7).transformTargetTileId).toBe(7);
    expect(preserveActorCollisionOutcome(chipFailCollisionOutcome()).preserveTarget).toBe(true);
  });
});
