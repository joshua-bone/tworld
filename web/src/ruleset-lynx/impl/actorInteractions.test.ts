import { ACTOR_INTERACTION_TARGET_KIND } from "@game-core/api/actorInteractions";
import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorArrivalOutcome,
  lynxActorCollisionOutcome,
  lynxActorInteractionOutcome,
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
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    });
    expect(lynxActorHazardOutcome(MS_TILE.Fire, MS_TILE.Ball)).toBe("deny-entry");
    expect(lynxActorThiefOutcome(MS_TILE.Chip)).toBe("steal-boots-tools");
    expect(lynxActorHeldFloorOutcome(MS_TILE.CloneMachine, MS_TILE.Fireball)).toBe("hold-direction");
  });

  it("uses the same interaction seam for portable-item and runtime-actor targets", () => {
    expect(
      lynxActorInteractionOutcome(MS_TILE.Ball, {
        kind: ACTOR_INTERACTION_TARGET_KIND.portableItem,
        tileId: MS_TILE.Hook,
      }),
    ).toEqual({
      chipFails: false,
      denyMove: true,
      removeMovingActor: false,
      removeTargetActor: false,
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    });
    expect(
      lynxActorInteractionOutcome(MS_TILE.Chip, {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId: MS_TILE.Ball,
      }).chipFails,
    ).toBe(true);
  });

  it("expresses bowling-ball destroy and same-direction wall behavior through collision policy", () => {
    expect(
      lynxActorInteractionOutcome(MS_TILE.BowlingBall, {
        kind: ACTOR_INTERACTION_TARGET_KIND.portableItem,
        tileId: MS_TILE.Sandbag,
      }),
    ).toEqual({
      chipFails: false,
      denyMove: false,
      removeMovingActor: true,
      removeTargetActor: true,
      preserveTarget: false,
      consumeTarget: true,
      transformTargetTileId: null,
    });
    expect(
      lynxActorInteractionOutcome(MS_TILE.BowlingBall, {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId: MS_TILE.Ball,
      }),
    ).toEqual({
      chipFails: false,
      denyMove: false,
      removeMovingActor: true,
      removeTargetActor: true,
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    });
    expect(
      lynxActorInteractionOutcome(MS_TILE.Chip, {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId: MS_TILE.BowlingBall,
        sameDirection: true,
      }),
    ).toEqual({
      chipFails: false,
      denyMove: true,
      removeMovingActor: false,
      removeTargetActor: false,
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    });
  });

  it("returns typed arrival outcomes for actor landings", () => {
    expect(lynxActorArrivalOutcome(MS_TILE.Button_Red, MS_TILE.Ball)).toBe("button");
    expect(lynxActorArrivalOutcome(MS_TILE.Beartrap, MS_TILE.Ball)).toBe("trap");
    expect(lynxActorArrivalOutcome(MS_TILE.Water, MS_TILE.Block)).toBe("block-water");
    expect(lynxActorArrivalOutcome(MS_TILE.Bomb, MS_TILE.Ball)).toBe("creature-bomb");
    expect(lynxActorArrivalOutcome(MS_TILE.Empty, MS_TILE.Ball)).toBe("none");
  });

  it("preserves actor hazard immunities when arrival handlers exist", () => {
    expect(lynxActorArrivalOutcome(MS_TILE.Water, MS_TILE.Glider)).toBe("none");
    expect(lynxActorArrivalOutcome(MS_TILE.Fire, MS_TILE.Fireball)).toBe("none");
  });
});
