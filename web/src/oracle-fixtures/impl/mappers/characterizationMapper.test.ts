import { describe, expect, it } from "vitest";
import { mapInputTraceFixtureToGameTrace } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import type { InputTraceFixture } from "@oracle-fixtures/impl/contracts/characterizationContract";

function createFixtureWithOptionalTools(tools?: number[]): InputTraceFixture {
  return {
    command: "replay-trace",
    series: "CC1.dac",
    levelNumber: 8,
    levelIndex: 7,
    ruleset: "MS",
    maxTicks: 100,
    timerSecondMs: 1000,
    randomSeed: "1",
    scheduledInputs: [],
    initialState: {
      phase: "initial",
      tick: -1,
      status: "playing",
      input: "none",
      inputCode: 0,
      replayCursor: 0,
      currentTime: -1,
      timeOffset: 0,
      secondsPlayed: 0,
      timelimit: 100,
      chipsNeeded: 0,
      statusFlags: 0,
      lastMoveCode: 0,
      lastMove: "none",
      stepping: 0,
      initRandomSlideDir: "north",
      randomState: {
        main: { initial: "1", value: "1", shared: true },
        lynx: { prng1: 0, prng2: 0 },
      },
      soundEffects: 0,
      view: { x: 0, y: 0 },
      inventory: {
        keys: [0, 0, 0, 0],
        boots: [0, 0, 0, 0],
        ...(tools ? { tools } : {}),
      },
      chip: null,
      creatureCount: 0,
      creaturesHash: "0",
      mapHash: "0",
      creatures: [],
    },
    steps: [],
    result: {
      status: "completed",
      finalTick: 0,
      stepCount: 0,
    },
  };
}

describe("mapInputTraceFixtureToGameTrace", () => {
  it("normalizes missing tool inventory to an empty slot", () => {
    const trace = mapInputTraceFixtureToGameTrace(createFixtureWithOptionalTools());

    expect(trace.initialState.inventory.tools).toEqual([0]);
  });

  it("preserves explicit tool inventory values", () => {
    const trace = mapInputTraceFixtureToGameTrace(createFixtureWithOptionalTools([42]));

    expect(trace.initialState.inventory.tools).toEqual([42]);
  });
});
