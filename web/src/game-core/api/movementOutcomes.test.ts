import { describe, expect, it } from "vitest";
import {
  ARRIVAL_RESULT,
  COLLISION_RESULT,
  MOVEMENT_ATTEMPT_RESULT,
  MOVEMENT_CHECK_RESULT,
  allowedMovement,
  arrivalCompleted,
  arrivalRemoved,
  blockedMovement,
  blockedMovementCheck,
  collided,
  collisionOccurred,
  completedArrival,
  movementDidSucceed,
  movementIsAllowed,
  movedMovement,
  noArrival,
  noCollision,
  removedOnArrival,
  resolvedArrival,
} from "@game-core/api/movementOutcomes";

describe("movementOutcomes", () => {
  it("creates movement checks with explicit allowed and blocked states", () => {
    expect(allowedMovement()).toEqual({ status: MOVEMENT_CHECK_RESULT.allowed });
    expect(blockedMovementCheck()).toEqual({ status: MOVEMENT_CHECK_RESULT.blocked });
    expect(movementIsAllowed(allowedMovement())).toBe(true);
    expect(movementIsAllowed(blockedMovementCheck())).toBe(false);
  });

  it("creates movement attempts with structured moved and blocked results", () => {
    expect(movedMovement()).toEqual({ status: MOVEMENT_ATTEMPT_RESULT.moved, soundEffects: 0 });
    expect(blockedMovement(7)).toEqual({ status: MOVEMENT_ATTEMPT_RESULT.blocked, soundEffects: 7 });
    expect(movementDidSucceed(movedMovement(5))).toBe(true);
    expect(movementDidSucceed(blockedMovement())).toBe(false);
  });

  it("creates arrival and collision results with explicit statuses", () => {
    expect(noArrival()).toEqual({ status: ARRIVAL_RESULT.none, soundEffects: 0 });
    expect(resolvedArrival(3)).toEqual({ status: ARRIVAL_RESULT.resolved, soundEffects: 3 });
    expect(removedOnArrival(4)).toEqual({ status: ARRIVAL_RESULT.removed, soundEffects: 4 });
    expect(completedArrival(5)).toEqual({ status: ARRIVAL_RESULT.completed, soundEffects: 5 });
    expect(arrivalCompleted(completedArrival())).toBe(true);
    expect(arrivalRemoved(removedOnArrival())).toBe(true);

    expect(noCollision()).toEqual({ status: COLLISION_RESULT.none });
    expect(collided()).toEqual({ status: COLLISION_RESULT.collided });
    expect(collisionOccurred(collided())).toBe(true);
    expect(collisionOccurred(noCollision())).toBe(false);
  });
});
