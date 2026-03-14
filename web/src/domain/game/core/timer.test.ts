import { describe, expect, it } from "vitest";
import type { EngineTimer } from "@domain/game/model";
import { advanceTimer, syncTimerSecondsPlayed, timerSecondsPlayed } from "@domain/game/core/timer";

function makeTimer(overrides: Partial<EngineTimer> = {}): EngineTimer {
  return {
    tick: 7,
    currentTime: 39,
    timeOffset: 1,
    secondsPlayed: 0,
    timeLimit: 999,
    ...overrides,
  };
}

describe("timer core helpers", () => {
  it("computes seconds played from current time and offset", () => {
    expect(timerSecondsPlayed(makeTimer(), 20)).toBe(2);
    expect(timerSecondsPlayed(makeTimer({ currentTime: -1, timeOffset: 0 }), 20)).toBe(-0);
  });

  it("syncs seconds played without changing other timer fields", () => {
    expect(syncTimerSecondsPlayed(makeTimer({ secondsPlayed: 99 }), 20)).toEqual({
      tick: 7,
      currentTime: 39,
      timeOffset: 1,
      secondsPlayed: 2,
      timeLimit: 999,
    });
  });

  it("advances tick and current time together before syncing seconds played", () => {
    expect(advanceTimer(makeTimer(), 1, 20)).toEqual({
      tick: 8,
      currentTime: 40,
      timeOffset: 1,
      secondsPlayed: 2,
      timeLimit: 999,
    });
    expect(advanceTimer(makeTimer(), 0, 20)).toEqual({
      tick: 7,
      currentTime: 39,
      timeOffset: 1,
      secondsPlayed: 2,
      timeLimit: 999,
    });
  });
});
