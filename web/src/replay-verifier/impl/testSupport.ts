import type { SeriesCatalogEntry } from "@content/api/series";
import type { GameTrace } from "@game-core/api/types";
import type { LoadedSolutionFile } from "@replay-verifier/ports/SolutionFileRepository";

export function createCompletedReplaySweepTrace(): GameTrace {
  return {
    request: {
      seriesFile: "CCLP1.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 1,
    },
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
          initial: "1",
          value: "1",
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
        tools: [],
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
      finalTick: 10,
      stepCount: 0,
    },
  };
}

export function createReplaySweepLoadedSolutionFile(
  ruleset: "MS" | "Lynx",
  path = `/tmp/CCLP1-${ruleset.toLowerCase()}.dac.tws`,
): LoadedSolutionFile {
  const setName = ruleset === "MS" ? "CCLP1.dac" : "CCLP1-lynx.dac";
  return {
    path,
    label: path.split("/").at(-1) ?? path,
    file: {
      ruleset,
      flags: 0,
      extraHeader: new Uint8Array(),
      setName,
      entries: [
        {
          levelNumber: 1,
          password: "ABCD",
          bestTimeTicks: 10,
          solutionData: new Uint8Array([1, 2, 3]),
          expandedSolution: {
            flags: 0,
            randomSlideDirection: 0,
            stepping: 0,
            randomSeed: 1,
            moves: [],
          },
        },
      ],
    },
  };
}

export function createReplaySweepSeriesCatalog(ruleset: "MS" | "Lynx"): SeriesCatalogEntry[] {
  const filebase = ruleset === "MS" ? "CCLP1.dac" : "CCLP1-Lynx.dac";
  const mapFile = ruleset === "MS" ? "./data/CCLP1.dat" : "./data/CCLP1.dat";
  return [
    {
      name: filebase,
      filebase,
      mapfilename: mapFile,
      ruleset,
      levels: [
        {
          index: 0,
          number: 1,
          name: "Test",
          author: "Test",
          password: "ABCD",
          timeLimitSeconds: 100,
          chipsRequired: 0,
          bestTimeTicks: 0,
          levelSize: 0,
          solutionSize: 0,
          levelHash: "0",
          gameplayHash: "0",
          hasSolution: false,
          sgflags: 0,
          unsolvable: null,
        },
      ],
    },
  ];
}
