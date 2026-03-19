import { describe, expect, it } from "vitest";
import { collectDebugTraceMismatches } from "@replay-verifier/impl/engine/comparators/debugTraceComparison";
import type { GameDebugTrace } from "@game-core/api/debug";

function createTrace(): GameDebugTrace {
  return {
    request: {
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123,
    },
    debugSchemaVersion: 2,
    scheduledInputs: [],
    initialState: {
      phase: "initial",
      input: "none",
      inputCode: 0,
      status: "playing",
      tick: -1,
      currentTime: -1,
      timeOffset: 0,
      secondsPlayed: 0,
      timelimit: 200,
      chipsNeeded: 1,
      statusFlags: 0,
      lastMoveCode: 0,
      lastMove: "none",
      stepping: 0,
      initRandomSlideDir: "north",
      replayCursor: 0,
      randomState: {
        main: { initial: "123", value: "123", shared: false },
        lynx: { prng1: 0, prng2: 0 },
      },
      soundEffects: 0,
      view: { x: 0, y: 0 },
      inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0] },
      chip: null,
      creatureCount: 0,
      creaturesHash: "0",
      mapHash: "0",
      creatures: [],
    },
    initialDebugState: {
      phase: "initial",
      tick: 0,
      currentTime: -1,
      replayCursor: 0,
      currentInputCode: 0,
      currentInput: "none",
      lastMoveCode: 0,
      lastMove: "none",
      chipsNeeded: 1,
      statusFlags: 0,
      chipStatus: "okay",
      chipStatusCode: 0,
      chipWait: 0,
      controllerDir: "none",
      lastSlipDir: "none",
      goalPos: -1,
      completed: false,
      msccSlippers: 0,
      soundEffects: 0,
      chipFloor: { id: 1, state: 0, stateFlags: [], movementMode: "none", slipDir: "none" },
      mapHash: "0",
      creaturesHash: "0",
      activeCreatures: [],
      blocks: [],
      slipList: [],
      boardFlags: [],
      map: { cells: [] },
    },
    steps: [
      {
        phase: "tick",
        input: "east",
        inputCode: 8,
        status: "playing",
        tick: 0,
        currentTime: 0,
        timeOffset: 0,
        secondsPlayed: 0,
        timelimit: 200,
        chipsNeeded: 1,
        statusFlags: 0,
        lastMoveCode: 0,
        lastMove: "none",
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: 1,
        randomState: {
          main: { initial: "123", value: "123", shared: false },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects: 0,
        view: { x: 0, y: 0 },
        inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0] },
        chip: null,
        creatureCount: 0,
        creaturesHash: "0",
        mapHash: "0",
        creatures: [],
        phases: [
          {
            phase: "post-input-latch",
            tick: 0,
            currentTime: 0,
            replayCursor: 1,
            currentInputCode: 8,
            currentInput: "east",
            lastMoveCode: 0,
            lastMove: "none",
            chipsNeeded: 1,
            statusFlags: 0,
            chipStatus: "okay",
            chipStatusCode: 0,
            chipWait: 0,
            controllerDir: "none",
            lastSlipDir: "none",
            goalPos: -1,
            completed: false,
            msccSlippers: 0,
            soundEffects: 0,
            chipFloor: { id: 1, state: 0, stateFlags: [], movementMode: "none", slipDir: "none" },
            mapHash: "0",
            creaturesHash: "0",
            activeCreatures: [],
            blocks: [],
            slipList: [],
            boardFlags: [],
            map: { cells: [] },
          },
        ],
      },
    ],
    result: {
      status: "playing",
      finalTick: 0,
      stepCount: 1,
    },
  };
}

describe("collectDebugTraceMismatches", () => {
  it("prioritizes phase mismatches before end-of-tick snapshot mismatches", () => {
    const expected = createTrace();
    const actual = createTrace();
    actual.steps[0]!.phases[0]!.controllerDir = "south";
    actual.steps[0]!.mapHash = "late-drift";

    const mismatches = collectDebugTraceMismatches(actual, expected);

    expect(mismatches[0]).toMatchObject({
      path: "$.steps[0].phases[0].controllerDir",
      phaseName: "post-input-latch",
      stepIndex: 0,
      expected: "none",
      actual: "south",
    });
  });
});
