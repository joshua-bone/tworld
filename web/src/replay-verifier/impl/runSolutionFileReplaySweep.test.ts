import { describe, expect, it, vi } from "vitest";
import { runSolutionFileReplaySweep } from "@replay-verifier/impl/runSolutionFileReplaySweep";
import type { LoadedSolutionFile } from "@replay-verifier/ports/SolutionFileRepository";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { GameTrace } from "@game-core/api/types";

function createCompletedTrace(): GameTrace {
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

describe("runSolutionFileReplaySweep", () => {
  it("fails fast without invoking the oracle when the candidate does not support the ruleset", async () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/CCLP1-lynx.dac.tws",
      label: "CCLP1-lynx.dac.tws",
      file: {
        ruleset: "Lynx",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "CCLP1-lynx.dac",
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
    const seriesCatalog: SeriesCatalogEntry[] = [
      {
        name: "CCLP1-Lynx.dac",
        filebase: "CCLP1-Lynx.dac",
        mapfilename: "./data/CCLP1.dat",
        ruleset: "Lynx",
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
    const candidateRunReplayTrace = vi.fn(async () => {
      throw new Error("candidate should not be called");
    });
    const oracleRunReplayTrace = vi.fn(async () => {
      throw new Error("oracle should not be called");
    });

    const report = await runSolutionFileReplaySweep(
      "Lynx",
      {
        fixtureRepository: {
          loadManifest: vi.fn(),
          loadSeriesList: vi.fn(),
          loadLevelInfo: vi.fn(),
        },
        solutionRepository: {
          loadSolutionFile: vi.fn(async () => loaded),
        },
        candidate: {
          supportsRuleset: () => false,
          runReplayTrace: candidateRunReplayTrace,
        },
        oracle: {
          supportsRuleset: () => true,
          runReplayTrace: oracleRunReplayTrace,
        },
      },
      [loaded.path],
      { seriesCatalog },
    );

    expect(report.replayCount).toBe(1);
    expect(report.unsupportedFiles).toEqual([]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.mismatchPaths).toEqual(["$engine"]);
    expect(candidateRunReplayTrace).not.toHaveBeenCalled();
    expect(oracleRunReplayTrace).not.toHaveBeenCalled();
  });

  it("reports per-file and per-scenario progress", async () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/CCLP1.dac.tws",
      label: "CCLP1.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "CCLP1.dac",
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
    const seriesCatalog: SeriesCatalogEntry[] = [
      {
        name: "CCLP1.dac",
        filebase: "CCLP1.dac",
        mapfilename: "./data/CCLP1.dat",
        ruleset: "MS",
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
    const onUnsupportedFile = vi.fn();
    const onSolutionFileStart = vi.fn();
    const onScenarioComplete = vi.fn();
    const onSolutionFileComplete = vi.fn();

    const report = await runSolutionFileReplaySweep(
      "MS",
      {
        fixtureRepository: {
          loadManifest: vi.fn(),
          loadSeriesList: vi.fn(),
          loadLevelInfo: vi.fn(),
        },
        solutionRepository: {
          loadSolutionFile: vi.fn(async () => loaded),
        },
        candidate: {
          supportsRuleset: () => true,
          runReplayTrace: vi.fn(async () => createCompletedTrace()),
        },
        oracle: {
          supportsRuleset: () => true,
          runReplayTrace: vi.fn(async () => createCompletedTrace()),
        },
      },
      [loaded.path],
      {
        seriesCatalog,
        progress: {
          onUnsupportedFile,
          onSolutionFileStart,
          onScenarioComplete,
          onSolutionFileComplete,
        },
      },
    );

    expect(report.replayCount).toBe(1);
    expect(report.failures).toEqual([]);
    expect(onUnsupportedFile).not.toHaveBeenCalled();
    expect(onSolutionFileStart).toHaveBeenCalledTimes(1);
    expect(onScenarioComplete).toHaveBeenCalledTimes(1);
    expect(onSolutionFileComplete).toHaveBeenCalledTimes(1);
    expect(onSolutionFileStart.mock.calls[0]?.[0]).toMatchObject({
      solutionFile: loaded,
    });
    expect(onScenarioComplete.mock.calls[0]?.[0]).toMatchObject({
      solutionFile: loaded,
      failure: null,
    });
    expect(onSolutionFileComplete.mock.calls[0]?.[0]).toMatchObject({
      solutionFile: loaded,
      replayCount: 1,
      failures: [],
    });
  });
});
