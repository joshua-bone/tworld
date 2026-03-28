import { describe, expect, it } from "vitest";
import {
  applyLynxActorEnteredCell,
  applyLynxBlockedActorMoveStart,
  lynxActorHoldsDirectionOnFloor,
} from "@ruleset-lynx/impl/actorMovementLifecycle";
import type { LynxActorMovementActor } from "@ruleset-lynx/impl/actorMovement";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createActor(overrides: Partial<LynxActorMovementActor> = {}): LynxActorMovementActor {
  return {
    id: MS_TILE.Ball,
    pos: 34,
    z: 1,
    dir: MS_DIRECTION.east,
    moving: 0,
    frame: 0,
    moveKind: "planar",
    ignoreIceFromAir: false,
    hidden: false,
    pushed: false,
    deferPush: false,
    deferPushArmed: false,
    dormant: false,
    ...overrides,
  };
}

describe("lynx actor movement lifecycle", () => {
  it("treats trap-like floors as held-direction floors for bowling balls", () => {
    expect(lynxActorHoldsDirectionOnFloor(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe(true);
    expect(lynxActorHoldsDirectionOnFloor(MS_TILE.Empty, MS_TILE.BowlingBall)).toBe(false);
  });

  it("applies blocked-start ice turns for stay-in-place actors only", () => {
    const ordinaryActor = createActor();
    applyLynxBlockedActorMoveStart(
      {
        turnBlockedIceDirection: () => MS_DIRECTION.west,
      },
      ordinaryActor,
      MS_DIRECTION.east,
      MS_TILE.Ice,
    );
    expect(ordinaryActor.dir).toBe(MS_DIRECTION.west);

    const bowlingBall = createActor({
      id: MS_TILE.BowlingBall,
      dir: MS_DIRECTION.east,
    });
    applyLynxBlockedActorMoveStart(
      {
        turnBlockedIceDirection: () => MS_DIRECTION.west,
      },
      bowlingBall,
      MS_DIRECTION.east,
      MS_TILE.Ice,
    );
    expect(bowlingBall.dir).toBe(MS_DIRECTION.east);
  });

  it("tracks ice arrival separately for planar and airborne steps", () => {
    const planarActor = createActor({
      dir: MS_DIRECTION.east,
      moveKind: "planar",
    });
    applyLynxActorEnteredCell(
      {
        applyIceWallTurn: () => MS_DIRECTION.south,
      },
      planarActor,
      MS_TILE.Ice,
    );
    expect(planarActor.dir).toBe(MS_DIRECTION.south);
    expect(planarActor.ignoreIceFromAir).toBe(false);

    const airborneActor = createActor({
      moveKind: "air",
    });
    applyLynxActorEnteredCell(
      {
        applyIceWallTurn: () => MS_DIRECTION.south,
      },
      airborneActor,
      MS_TILE.Ice,
    );
    expect(airborneActor.ignoreIceFromAir).toBe(true);
  });
});
