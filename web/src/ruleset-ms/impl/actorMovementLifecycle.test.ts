import { describe, expect, it, vi } from "vitest";
import {
  applyBlockedMsActorMoveStart,
  msActorHoldsDirectionOnFloor,
  type MsMovementLifecycleCreature,
} from "@ruleset-ms/impl/actorMovementLifecycle";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createCreature(overrides: Partial<MsMovementLifecycleCreature> = {}): MsMovementLifecycleCreature {
  return {
    id: MS_TILE.Bug,
    dir: MS_DIRECTION.north,
    pos: 5,
    moving: 0,
    released: false,
    turning: false,
    hidden: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    ...overrides,
  };
}

describe("ms actor movement lifecycle", () => {
  it("treats trap-like floors as held-direction floors for bowling balls", () => {
    expect(msActorHoldsDirectionOnFloor(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe(true);
    expect(msActorHoldsDirectionOnFloor(MS_TILE.Empty, MS_TILE.BowlingBall)).toBe(false);
  });

  it("applies blocked-start facing feedback for ordinary creatures", () => {
    const creature = createCreature();
    const updateCreatureTile = vi.fn();

    applyBlockedMsActorMoveStart(
      {
        floorAt: () => MS_TILE.Empty,
        updateCreatureTile,
      },
      creature,
      MS_DIRECTION.east,
    );

    expect(creature.dir).toBe(MS_DIRECTION.east);
    expect(updateCreatureTile).toHaveBeenCalledWith(creature);
  });

  it("does not apply blocked-start feedback for revert-portable actors", () => {
    const creature = createCreature({
      id: MS_TILE.BowlingBall,
      dir: MS_DIRECTION.north,
    });
    const updateCreatureTile = vi.fn();

    applyBlockedMsActorMoveStart(
      {
        floorAt: () => MS_TILE.Empty,
        updateCreatureTile,
      },
      creature,
      MS_DIRECTION.east,
    );

    expect(creature.dir).toBe(MS_DIRECTION.north);
    expect(updateCreatureTile).not.toHaveBeenCalled();
  });
});
