import { describe, expect, it } from "vitest";
import type { OracleDebugTraceFixture } from "@oracle-fixtures/impl/contracts/oracleDebugContract";
import { NodeOracleDebugFixtureRepository } from "@oracle-fixtures/impl/NodeOracleDebugFixtureRepository";
import { mapOracleDebugFixtureToGameDebugTrace } from "@oracle-fixtures/impl/mappers/oracleDebug";

describe("mapOracleDebugFixtureToGameDebugTrace", () => {
  it("maps a checked-in oracle debug fixture into the debug trace contract", async () => {
    const repository = new NodeOracleDebugFixtureRepository();
    const fixture = await repository.loadTrace("cclp1-ms-level-113-teleport-block-debug");
    const trace = mapOracleDebugFixtureToGameDebugTrace(fixture);

    expect(trace.request).toEqual({
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 113,
      ruleset: "MS",
      randomSeed: 1690830071,
    });
    expect(trace.debugSchemaVersion).toBe(2);
    expect(trace.initialDebugState.phase).toBe("initial");
    expect(trace.steps[0]?.phases[0]?.phase).toBe("post-input-latch");
  });

  it("normalizes missing tool inventory on debug traces", () => {
    const fixture: OracleDebugTraceFixture = {
      command: "replay-trace-solution-debug",
      series: "CC1.dac",
      levelNumber: 8,
      levelIndex: 7,
      ruleset: "MS",
      maxTicks: 100,
      timerSecondMs: 1000,
      randomSeed: "1",
      debugSchemaVersion: 2,
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
        },
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
        chipsNeeded: 0,
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
        chipFloor: { id: 0, state: 0, stateFlags: [], movementMode: "none", slipDir: "none" },
        mapHash: "0",
        creaturesHash: "0",
        activeCreatures: [],
        blocks: [],
        slipList: [],
        boardFlags: [],
        map: { cells: [] },
      },
      steps: [],
      result: {
        status: "completed",
        finalTick: 0,
        stepCount: 0,
      },
    };

    const trace = mapOracleDebugFixtureToGameDebugTrace(fixture);

    expect(trace.initialState.inventory.tools).toEqual([0]);
  });
});
