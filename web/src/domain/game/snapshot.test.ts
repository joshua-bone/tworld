import { describe, expect, it } from "vitest";
import type { EngineState } from "@domain/game/model";
import { engineStateToSnapshot } from "@domain/game/snapshot";

describe("engineStateToSnapshot", () => {
  it("falls back to the view position when no visible Chip actor is present", () => {
    const state: EngineState = {
      request: {
        seriesFile: "test-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      status: "playing",
      timer: {
        tick: 0,
        currentTime: 0,
        timeOffset: 0,
        secondsPlayed: 0,
        timeLimit: 200,
      },
      inventory: {
        keys: [0, 0, 0, 0],
        boots: [0, 0, 0, 0],
        chipsNeeded: 0,
      },
      replay: {
        cursor: 0,
        stepping: 0,
        moveCount: 0,
        bestTimeTicks: Number.POSITIVE_INFINITY,
        initialRandomSlideDirection: "north",
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
      },
      chip: null,
      actors: [],
      map: {
        hash: "0",
        creaturesHash: "0",
        creatureCount: 0,
        cells: [],
      },
      view: {
        x: 16,
        y: 24,
      },
      soundEffects: 0,
      statusFlags: 0,
      lastMove: {
        code: 0,
        name: "none",
      },
    };

    const snapshot = engineStateToSnapshot(state, "initial", { inputCode: 0, inputName: "none" });

    expect(snapshot.chip).toEqual({
      id: -1,
      layer: -1,
      dir: "none",
      position: {
        x: 2,
        y: 3,
        pos: 98,
      },
      state: 0,
      source: "view",
    });
  });
});
