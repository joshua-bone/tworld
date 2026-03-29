import {
  createStatefulActorLocalInventoryState,
  type StatefulActorLocalInventoryState,
} from "@game-core/impl/statefulActorLocalInventory";

export type BowlingBallMode = "still" | "moving";

export interface BowlingBallState extends Record<string, unknown>, StatefulActorLocalInventoryState {
  mode: BowlingBallMode;
  travelDirection: number | null;
}

export function createBowlingBallState(
  mode: BowlingBallMode,
  travelDirection: number | null = null,
): BowlingBallState {
  const { localInventory } = createStatefulActorLocalInventoryState("keys-boots");
  if (!localInventory) {
    throw new Error("bowling ball state requires keys-boots inventory");
  }

  return {
    mode,
    travelDirection,
    localInventory,
  };
}

export function createMovingBowlingBallState(
  travelDirection: number | null = null,
): BowlingBallState {
  return createBowlingBallState("moving", travelDirection);
}

export function createStillBowlingBallState(
  travelDirection: number | null = null,
): BowlingBallState {
  return createBowlingBallState("still", travelDirection);
}

export function cloneBowlingBallState(
  state: BowlingBallState,
): BowlingBallState {
  return structuredClone(state);
}

export function setBowlingBallMode(
  state: BowlingBallState,
  mode: BowlingBallMode,
  travelDirection: number | null = state.travelDirection,
): BowlingBallState {
  state.mode = mode;
  state.travelDirection = travelDirection;
  return state;
}

export function bowlingBallArtworkSpriteId(
  mode: BowlingBallMode,
): "bowling_ball_moving" | "bowling_ball_still" {
  return mode === "still" ? "bowling_ball_still" : "bowling_ball_moving";
}
