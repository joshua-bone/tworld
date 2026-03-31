import { ACTOR_INTERACTION_TARGET_KIND } from "@game-core/api/actorInteractions";
import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorArrivalOutcome,
  msActorCollisionOutcome,
  msActorInteractionOutcome,
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
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    });
    expect(msActorHazardOutcome(MS_TILE.Fire, MS_TILE.Bug)).toBe("deny-entry");
    expect(msActorThiefOutcome(MS_TILE.Chip)).toBe("steal-boots-tools");
    expect(msActorHeldFloorOutcome(MS_TILE.Beartrap, MS_TILE.Fireball)).toBe("hold-direction");
  });

  it("uses the same interaction seam for portable-item and runtime-actor targets", () => {
    expect(
      msActorInteractionOutcome(MS_TILE.Ball, {
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
      msActorInteractionOutcome(MS_TILE.IceBlock, {
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
      msActorInteractionOutcome(MS_TILE.Chip, {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId: MS_TILE.Ball,
      }).chipFails,
    ).toBe(true);
  });

  it("expresses bowling-ball destroy and same-direction wall behavior through collision policy", () => {
    expect(
      msActorInteractionOutcome(MS_TILE.BowlingBall, {
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
      msActorInteractionOutcome(MS_TILE.BowlingBall, {
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
      msActorInteractionOutcome(MS_TILE.Chip, {
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
    expect(msActorArrivalOutcome(MS_TILE.Water, MS_TILE.Block)).toBe("block-water");
    expect(msActorArrivalOutcome(MS_TILE.Water, MS_TILE.IceBlock)).toBe("ice-block-water");
    expect(msActorArrivalOutcome(MS_TILE.Fire, MS_TILE.IceBlock)).toBe("ice-block-fire");
    expect(msActorArrivalOutcome(MS_TILE.Fire, MS_TILE.Glider)).toBe("creature-fire");
    expect(msActorArrivalOutcome(MS_TILE.Bomb, MS_TILE.Ball)).toBe("creature-bomb");
    expect(msActorArrivalOutcome(MS_TILE.Empty, MS_TILE.Ball)).toBe("none");
  });

  it("preserves actor hazard immunities when arrival handlers exist", () => {
    expect(msActorArrivalOutcome(MS_TILE.Water, MS_TILE.Glider)).toBe("none");
    expect(msActorArrivalOutcome(MS_TILE.Fire, MS_TILE.Fireball)).toBe("none");
  });
});
