import { describe, it } from "vitest";
import { BOWLING_BALL_CHARACTERIZATION_SCENARIOS } from "@game-core/impl/bowlingBallCharacterizationMatrix";

describe("Lynx bowling ball characterization backlog", () => {
  for (const scenario of BOWLING_BALL_CHARACTERIZATION_SCENARIOS) {
    if (scenario.ruleset === "ms") {
      continue;
    }
    it.todo(`${scenario.id}: ${scenario.label}`);
  }
});
