import { existsSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@adapters/levels/loadNodeReplaySweepSeriesCatalog";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@adapters/solutions/NodeSolutionFileRepository";
import {
  formatMsReplaySweepFailureSummary,
  runMsSolutionFileReplaySweep,
} from "@application/use-cases/runMsSolutionFileReplaySweep";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const replayScenarioFilter = process.env.TWORLD_MS_REPLAY_FILTER?.trim() || null;
const replaySweepTimeoutMs = Number.parseInt(
  process.env.TWORLD_MS_SWEEP_TIMEOUT_MS ?? (replayScenarioFilter ? "300000" : "900000"),
  10,
);

async function loadReplaySweepSeriesCatalog() {
  return loadNodeReplaySweepSeriesCatalog(new NodeCharacterizationFixtureRepository(), repoRoot);
}

function discoverSolutionFiles(): string[] {
  const envPaths = process.env.TWORLD_MS_SOLUTION_FILE?.split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  if (envPaths?.length) {
    return envPaths.map((path) => resolve(repoRoot, path));
  }

  const saveDir = resolve(repoRoot, "save");
  if (!existsSync(saveDir)) {
    return [];
  }

  return readdirSync(saveDir)
    .filter((entry) => extname(entry).toLowerCase() === ".tws")
    .map((entry) => resolve(saveDir, entry))
    .sort((left, right) => left.localeCompare(right));
}

const solutionFiles = discoverSolutionFiles();
const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() && solutionFiles.length > 0 ? describe : describe.skip;

runSuite("TS MS engine solution-file replay sweep", () => {
  it(
    "matches the live native oracle for every MS replay in the discovered solution files",
    async () => {
      const report = await runMsSolutionFileReplaySweep(
        {
          fixtureRepository: new NodeCharacterizationFixtureRepository(),
          solutionRepository: new NodeSolutionFileRepository(),
          candidate: new TsMsGameEngineAdapter(new NodeLevelRepository()),
          oracle: new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath }),
        },
        solutionFiles,
        {
          scenarioNameIncludes: replayScenarioFilter,
          seriesCatalog: await loadReplaySweepSeriesCatalog(),
        },
      );

      expect(report.unsupportedFiles).toEqual([]);
      expect(report.replayCount).toBeGreaterThan(0);
      if (report.failures.length > 0) {
        throw new Error(formatMsReplaySweepFailureSummary(report));
      }
    },
    Number.isFinite(replaySweepTimeoutMs) && replaySweepTimeoutMs > 0 ? replaySweepTimeoutMs : 900_000,
  );
});
