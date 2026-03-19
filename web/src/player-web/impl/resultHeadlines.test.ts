import { describe, expect, it } from "vitest";
import { buildInteractiveFailureCause } from "@game-runtime/impl/interactiveSessionRun";
import {
  buildFailureHeadlineCandidates,
  selectResultHeadline,
  selectWinHeadline,
} from "@player-web/impl/resultHeadlines";

describe("resultHeadlines", () => {
  it("uses the Microsoft win-message ladder by attempt count", () => {
    expect(selectWinHeadline(1)).toBe("Yowser! First Try!");
    expect(selectWinHeadline(2)).toBe("Go Bit Buster!");
    expect(selectWinHeadline(3)).toBe("Go Bit Buster!");
    expect(selectWinHeadline(4)).toBe("Finished! Good Work!");
    expect(selectWinHeadline(5)).toBe("Finished! Good Work!");
    expect(selectWinHeadline(6)).toBe("At last! You did it!");
  });

  it("limits timeout headlines to timeout-valid messages", () => {
    expect(
      buildFailureHeadlineCandidates(
        buildInteractiveFailureCause({
          kind: "timeout",
          message: "Ran out of time at 30.2s",
        }),
      ),
    ).toEqual([
      "Ooops! Out of time!",
      "Well, that was an untimely demise.",
      "You do know there's a time limit on this level, right?",
      "Look, we don't have all the time in the world!",
      "Alert: The system has determined that you are either moving or thinking too slowly.",
      "The idea here is to win the level, not lose it!",
    ]);
  });

  it("allows bomb-specific and generic non-time headlines for bomb deaths only", () => {
    expect(
      buildFailureHeadlineCandidates(
        buildInteractiveFailureCause({
          kind: "bomb",
          message: "Hit a bomb at (3, 17)",
        }),
      ),
    ).toEqual([
      "Ooops! Don't touch the bombs!",
      "Whoops... Let's try again.",
      "Why don't ya watch where you're going?",
      "Getting killed can be injurious to Chip's health!",
      "Uh-oh: Chip performed a fatal operation and was terminated.",
      "Hey, are you doing that on purpose?",
      "Great, now look what you did!",
      "The idea here is to win the level, not lose it!",
    ]);
  });

  it("recognizes moving-block deaths as a valid Microsoft-specific case", () => {
    expect(
      buildFailureHeadlineCandidates(
        buildInteractiveFailureCause({
          actorName: "block",
          kind: "other",
          message: "Crushed by block at (12, 25)",
        }),
      )[0],
    ).toBe("Ooops! Watch out for moving blocks!");
  });

  it("does not leak bomb-only or timeout-only headlines into ordinary monster deaths", () => {
    const candidates = buildFailureHeadlineCandidates(
      buildInteractiveFailureCause({
        actorName: "ant",
        kind: "monster",
        message: "Killed by ant at (12, 25)",
      }),
    );

    expect(candidates).toContain("Ooops! Look out for creatures!");
    expect(candidates).not.toContain("Ooops! Don't touch the bombs!");
    expect(candidates).not.toContain("Ooops! Out of time!");
  });

  it("picks deterministic valid failure headlines", () => {
    const result = {
      outcome: "failed" as const,
      endPosition: { x: 12, y: 25, z: 1 },
      cause: buildInteractiveFailureCause({
        actorName: "ant",
        kind: "monster",
        message: "Killed by ant at (12, 25)",
        position: { x: 12, y: 25, z: 1 },
      }),
      score: null,
    };

    const headline = selectResultHeadline({
      attemptCount: 4,
      entropyKey: "CCLP1-MS.dac:13:failed:602:0:monster:4",
      result,
    });

    expect(buildFailureHeadlineCandidates(result.cause)).toContain(headline);
    expect(
      selectResultHeadline({
        attemptCount: 4,
        entropyKey: "CCLP1-MS.dac:13:failed:602:0:monster:4",
        result,
      }),
    ).toBe(headline);
  });
});
