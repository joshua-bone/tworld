import { describe, expect, it } from "vitest";
import {
  bowlingBallArtworkSpriteId,
  createMovingBowlingBallState,
  createStillBowlingBallState,
} from "@game-core/impl/bowlingBall";

describe("bowlingBall", () => {
  it("creates still and moving shared family state with persistent keys-boots inventory", () => {
    expect(createStillBowlingBallState()).toEqual({
      mode: "still",
      travelDirection: null,
      localInventory: {
        keys: [0, 0, 0, 0],
        boots: [0, 0, 0, 0],
      },
    });
    expect(createMovingBowlingBallState(8)).toEqual({
      mode: "moving",
      travelDirection: 8,
      localInventory: {
        keys: [0, 0, 0, 0],
        boots: [0, 0, 0, 0],
      },
    });
  });

  it("projects artwork sprite ids by runtime mode", () => {
    expect(bowlingBallArtworkSpriteId("moving")).toBe("bowling_ball_moving");
    expect(bowlingBallArtworkSpriteId("still")).toBe("bowling_ball_still");
  });
});
