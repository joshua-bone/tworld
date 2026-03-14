import { describe, expect, it } from "vitest";
import { createGameDebugTrace, createGameTrace } from "@domain/game/trace";
import type { GameDebugPhaseSnapshot } from "@domain/game/debug";
import type { GameCommand, GameRequest, GameSnapshot } from "@domain/game/types";

function createRequest(): GameRequest {
  return {
    seriesFile: "test.dac",
    levelNumber: 1,
    ruleset: "MS",
    randomSeed: 123,
  };
}

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    phase: "tick",
    input: "none",
    inputCode: 0,
    status: "playing",
    tick: 0,
    currentTime: 0,
    timeOffset: 0,
    secondsPlayed: 0,
    timelimit: 100,
    chipsNeeded: 0,
    statusFlags: 0,
    lastMoveCode: 0,
    lastMove: "none",
    stepping: 0,
    initRandomSlideDir: "north",
    replayCursor: 0,
    randomState: {
      main: {
        initial: "0",
        value: "0",
        shared: true,
      },
      lynx: {
        prng1: 0,
        prng2: 0,
      },
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
    ...overrides,
  };
}

function createPhaseSnapshot(): GameDebugPhaseSnapshot {
  return {
    phase: "initial",
    tick: -1,
    currentTime: 0,
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
    goalPos: 0,
    completed: false,
    msccSlippers: 0,
    soundEffects: 0,
    chipFloor: {
      id: 0,
      state: 0,
      stateFlags: [],
      movementMode: "none",
      slipDir: "none",
    },
    mapHash: "0",
    creaturesHash: "0",
    activeCreatures: [],
    blocks: [],
    slipList: [],
    boardFlags: [],
    map: {
      cells: [],
    },
  };
}

describe("trace builders", () => {
  it("builds a game trace with cloned scheduled inputs and inferred result state", () => {
    const scheduledInputs: GameCommand[] = [
      { tick: 0, inputCode: 8, inputName: "east" },
    ];
    const initialState = createSnapshot({ status: "playing", currentTime: 0 });
    const steps = [createSnapshot({ status: "completed", currentTime: 4 })];

    const trace = createGameTrace({
      request: createRequest(),
      scheduledInputs,
      initialState,
      steps,
    });

    scheduledInputs[0]!.inputCode = 1;

    expect(trace.scheduledInputs[0]!.inputCode).toBe(8);
    expect(trace.result).toEqual({
      status: "completed",
      finalTick: 4,
      stepCount: 1,
    });
  });

  it("uses explicit result overrides for empty debug traces", () => {
    const debugTrace = createGameDebugTrace({
      request: createRequest(),
      debugSchemaVersion: 2,
      scheduledInputs: [],
      initialState: createSnapshot({ status: "playing", currentTime: 0 }),
      initialDebugState: createPhaseSnapshot(),
      steps: [],
      result: {
        status: "failed",
        finalTick: 9,
      },
    });

    expect(debugTrace.result).toEqual({
      status: "failed",
      finalTick: 9,
      stepCount: 0,
    });
  });
});
