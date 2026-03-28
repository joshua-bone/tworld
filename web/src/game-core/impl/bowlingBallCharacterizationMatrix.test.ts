import { describe, expect, it } from "vitest";
import { BOWLING_BALL_CHARACTERIZATION_SCENARIOS } from "@game-core/impl/bowlingBallCharacterizationMatrix";

describe("bowling ball characterization matrix", () => {
  it("keeps stable unique scenario ids", () => {
    const ids = BOWLING_BALL_CHARACTERIZATION_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every planned bowling ball characterization category", () => {
    expect(new Set(BOWLING_BALL_CHARACTERIZATION_SCENARIOS.map((scenario) => scenario.category))).toEqual(
      new Set(["activation", "movement", "collision", "trap-cloner", "air-support"]),
    );
  });
});
