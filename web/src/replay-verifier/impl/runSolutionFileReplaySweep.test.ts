import { describe, expect, it, vi } from "vitest";
import { runSolutionFileReplaySweep } from "@replay-verifier/impl/runSolutionFileReplaySweep";
import type { LoadedSolutionFile } from "@replay-verifier/ports/SolutionFileRepository";
import type { SeriesCatalogEntry } from "@content/api/series";

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
});
