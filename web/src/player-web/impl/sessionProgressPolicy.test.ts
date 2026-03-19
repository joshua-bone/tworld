import { describe, expect, it } from "vitest";
import { shouldPersistLevelProgress } from "@player-web/impl/sessionProgressPolicy";

describe("sessionProgressPolicy", () => {
  it("persists only live manual runs with a terminal result", () => {
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "game",
        sessionMode: "manual",
        sessionStartedFromReplay: false,
      }),
    ).toBe(true);
  });

  it("does not persist replay sessions or replay-launched sessions", () => {
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "game",
        sessionMode: "replay",
        sessionStartedFromReplay: false,
      }),
    ).toBe(false);
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "game",
        sessionMode: "manual",
        sessionStartedFromReplay: true,
      }),
    ).toBe(false);
  });

  it("does not persist incomplete sessions or non-game modes", () => {
    expect(
      shouldPersistLevelProgress({
        hasResult: false,
        mode: "game",
        sessionMode: "manual",
        sessionStartedFromReplay: false,
      }),
    ).toBe(false);
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "series-list",
        sessionMode: "manual",
        sessionStartedFromReplay: false,
      }),
    ).toBe(false);
  });
});
