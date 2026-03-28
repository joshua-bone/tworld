import { describe, expect, it, vi } from "vitest";
import {
  formatSolutionFileReplaySweepFailureSummary,
  runSolutionFileReplaySweep,
} from "@replay-verifier/impl/runSolutionFileReplaySweep";
import {
  createCompletedReplaySweepTrace,
  createReplaySweepLoadedSolutionFile,
  createReplaySweepSeriesCatalog,
} from "@replay-verifier/impl/testSupport";

describe("runSolutionFileReplaySweep", () => {
  it("fails fast without invoking the oracle when the candidate does not support the ruleset", async () => {
    const loaded = createReplaySweepLoadedSolutionFile("Lynx");
    const seriesCatalog = createReplaySweepSeriesCatalog("Lynx");
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
    const loaded = createReplaySweepLoadedSolutionFile("MS", "/tmp/CCLP1.dac.tws");
    const seriesCatalog = createReplaySweepSeriesCatalog("MS");
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
          runReplayTrace: vi.fn(async () => createCompletedReplaySweepTrace()),
        },
        oracle: {
          supportsRuleset: () => true,
          runReplayTrace: vi.fn(async () => createCompletedReplaySweepTrace()),
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

  it("formats replay sweep summaries with ranked counts and limited sample failures", () => {
    const summary = formatSolutionFileReplaySweepFailureSummary(
      {
        replayCount: 3,
        unsupportedFiles: ["unsupported.tws"],
        failures: [
          {
            scenarioName: "CCLP1.dac:1",
            solutionFile: "/tmp/CCLP1.dac.tws",
            seriesFile: "CCLP1.dac",
            levelNumber: 1,
            mismatchPaths: ["$.steps[582].chip.position.pos", "$.result.finalTick"],
            mismatches: [
              {
                path: "$.steps[582].chip.position.pos",
                expected: 485,
                actual: 509,
              },
              {
                path: "$.result.finalTick",
                expected: 10,
                actual: 11,
              },
            ],
          },
          {
            scenarioName: "CCLP1.dac:2",
            solutionFile: "/tmp/CCLP1-second.dac.tws",
            seriesFile: "CCLP1.dac",
            levelNumber: 2,
            mismatchPaths: ["$engine"],
            mismatches: [
              {
                path: "$engine",
                expected: "MS replay trace support",
                actual: "candidate engine does not support ruleset MS",
              },
            ],
          },
          {
            scenarioName: "CCLP2.dac:1",
            solutionFile: "/tmp/CCLP2.dac.tws",
            seriesFile: "CCLP2.dac",
            levelNumber: 1,
            mismatchPaths: ["$.steps[9].status"],
            mismatches: [
              {
                path: "$.steps[9].status",
                expected: "playing",
                actual: "failed",
              },
            ],
          },
        ],
        failureCountBySeries: [
          { key: "CCLP1.dac", count: 2 },
          { key: "CCLP2.dac", count: 1 },
        ],
        firstMismatchPathCounts: [
          { key: "$.steps[582].chip.position.pos", count: 1 },
          { key: "$.steps[9].status", count: 1 },
          { key: "$engine", count: 1 },
        ],
      },
      2,
    );

    expect(summary).toContain("unsupported files: unsupported.tws");
    expect(summary).toContain("replays checked: 3");
    expect(summary).toContain("failing replays: 3");
    expect(summary).toContain("failing series:");
    expect(summary).toContain("- CCLP1.dac: 2");
    expect(summary).toContain("- CCLP2.dac: 1");
    expect(summary).toContain("top first mismatch paths:");
    expect(summary).toContain("- $.steps[582].chip.position.pos: 1");
    expect(summary).toContain("- $.steps[9].status: 1");
    expect(summary).toContain("- $engine: 1");
    expect(summary).toContain("sample failures:");
    expect(summary).toContain(
      "- CCLP1.dac:1 -> $.steps[582].chip.position.pos: expected 485, got 509 | $.result.finalTick: expected 10, got 11",
    );
    expect(summary).toContain(
      "- CCLP1.dac:2 -> $engine: expected MS replay trace support, got candidate engine does not support ruleset MS",
    );
    expect(summary).not.toContain("CCLP2.dac:1 ->");
  });
});
