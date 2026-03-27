import { describe, expect, it } from "vitest";
import type { EngineTimer } from "@game-core/api/model";
import type { GameSnapshot } from "@game-core/api/types";
import { advanceTimer, createInitialEngineTimer, snapshotToEngineTimer, syncTimerSecondsPlayed, timerSecondsPlayed } from "@game-core/impl/timer";

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

function makeSnapshot(): GameSnapshot {
  return {
    phase: "initial",
    input: "",
    inputCode: 0,
    currentTime: 39,
    tick: 7,
    timelimit: 999,
    timeOffset: 1,
    chipsNeeded: 0,
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      tools: [0],
    },
    chip: null,
    creatures: [],
    creatureCount: 0,
    replayCursor: 0,
    stepping: 0,
    lastMove: "",
    lastMoveCode: 0,
    initRandomSlideDir: "north",
    randomState: {
      main: { initial: "0", value: "0", shared: false },
      lynx: { prng1: 0, prng2: 0 },
    },
    status: "playing",
    statusFlags: 0,
    soundEffects: 0,
    secondsPlayed: 2,
    mapHash: "hash",
    creaturesHash: "creatures",
    view: { x: 0, y: 0 },
  };
}

describe("timer core helpers", () => {
  it("creates the shared initial engine timer shape", () => {
    expect(createInitialEngineTimer(999)).toEqual({
      tick: -1,
      currentTime: -1,
      timeOffset: 0,
      secondsPlayed: 0,
      timeLimit: 999,
    });
  });

  it("maps snapshots into engine timers", () => {
    expect(snapshotToEngineTimer(makeSnapshot())).toEqual({
      tick: 7,
      currentTime: 39,
      timeOffset: 1,
      secondsPlayed: 2,
      timeLimit: 999,
    });
  });

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
