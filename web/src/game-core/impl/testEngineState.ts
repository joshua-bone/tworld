import type { EngineMapCell, EngineState } from "@game-core/api/model";

export function createTestEngineState(
  cells: EngineMapCell[],
  ruleset: EngineState["request"]["ruleset"],
  seriesFile = "test.dat",
): EngineState {
  return {
    request: {
      seriesFile,
      levelNumber: 1,
      ruleset,
    },
    status: "playing",
    timer: {
      tick: 0,
      currentTime: 0,
      timeOffset: 0,
      secondsPlayed: 0,
      timeLimit: 0,
    },
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      tools: [0],
      chipsNeeded: 0,
    },
    replay: {
      cursor: 0,
      stepping: 0,
      moveCount: 0,
      bestTimeTicks: 0,
      initialRandomSlideDirection: "north",
      randomState: {
        main: {
          initial: "0",
          value: "0",
          shared: false,
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
      hash: "",
      creaturesHash: "",
      creatureCount: 0,
      cells,
    },
    view: {
      x: 0,
      y: 0,
    },
    soundEffects: 0,
    statusFlags: 0,
    lastMove: {
      code: 0,
      name: "none",
    },
  };
}
