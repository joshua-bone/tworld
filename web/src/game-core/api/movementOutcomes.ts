export const MOVEMENT_CHECK_RESULT = {
  allowed: "allowed",
  blocked: "blocked",
} as const;

export type MovementCheckResultStatus = (typeof MOVEMENT_CHECK_RESULT)[keyof typeof MOVEMENT_CHECK_RESULT];

export interface MovementCheckResult {
  status: MovementCheckResultStatus;
}

export const MOVEMENT_ATTEMPT_RESULT = {
  moved: "moved",
  blocked: "blocked",
} as const;

export type MovementAttemptResultStatus = (typeof MOVEMENT_ATTEMPT_RESULT)[keyof typeof MOVEMENT_ATTEMPT_RESULT];

export interface MovementAttemptResult {
  status: MovementAttemptResultStatus;
  soundEffects: number;
}

export const ARRIVAL_RESULT = {
  none: "none",
  resolved: "resolved",
  removed: "removed",
  completed: "completed",
} as const;

export type ArrivalResultStatus = (typeof ARRIVAL_RESULT)[keyof typeof ARRIVAL_RESULT];

export interface ArrivalResult {
  status: ArrivalResultStatus;
  soundEffects: number;
}

export const COLLISION_RESULT = {
  none: "none",
  collided: "collided",
} as const;

export type CollisionResultStatus = (typeof COLLISION_RESULT)[keyof typeof COLLISION_RESULT];

export interface CollisionResult {
  status: CollisionResultStatus;
}

export function allowedMovement(): MovementCheckResult {
  return { status: MOVEMENT_CHECK_RESULT.allowed };
}

export function blockedMovementCheck(): MovementCheckResult {
  return { status: MOVEMENT_CHECK_RESULT.blocked };
}

export function movementIsAllowed(result: MovementCheckResult): boolean {
  return result.status === MOVEMENT_CHECK_RESULT.allowed;
}

export function movedMovement(soundEffects = 0): MovementAttemptResult {
  return {
    status: MOVEMENT_ATTEMPT_RESULT.moved,
    soundEffects,
  };
}

export function blockedMovement(soundEffects = 0): MovementAttemptResult {
  return {
    status: MOVEMENT_ATTEMPT_RESULT.blocked,
    soundEffects,
  };
}

export function movementDidSucceed(result: MovementAttemptResult): boolean {
  return result.status === MOVEMENT_ATTEMPT_RESULT.moved;
}

export function noArrival(soundEffects = 0): ArrivalResult {
  return {
    status: ARRIVAL_RESULT.none,
    soundEffects,
  };
}

export function resolvedArrival(soundEffects = 0): ArrivalResult {
  return {
    status: ARRIVAL_RESULT.resolved,
    soundEffects,
  };
}

export function removedOnArrival(soundEffects = 0): ArrivalResult {
  return {
    status: ARRIVAL_RESULT.removed,
    soundEffects,
  };
}

export function completedArrival(soundEffects = 0): ArrivalResult {
  return {
    status: ARRIVAL_RESULT.completed,
    soundEffects,
  };
}

export function arrivalCompleted(result: ArrivalResult): boolean {
  return result.status === ARRIVAL_RESULT.completed;
}

export function arrivalRemoved(result: ArrivalResult): boolean {
  return result.status === ARRIVAL_RESULT.removed;
}

export function noCollision(): CollisionResult {
  return { status: COLLISION_RESULT.none };
}

export function collided(): CollisionResult {
  return { status: COLLISION_RESULT.collided };
}

export function collisionOccurred(result: CollisionResult): boolean {
  return result.status === COLLISION_RESULT.collided;
}
