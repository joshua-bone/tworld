import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import {
  formatLynxReplaySweepFailureSummary,
  runLynxSolutionFileReplaySweep,
  type LynxReplaySweepFailure,
  type LynxReplaySweepReport,
} from "@replay-verifier/impl/runLynxSolutionFileReplaySweep";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const replayScenarioFilter = process.env.TWORLD_LYNX_REPLAY_FILTER?.trim() || null;

function discoverSolutionFiles(): string[] {
  const envPaths = process.env.TWORLD_LYNX_SOLUTION_FILE?.split(",")
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

function rankCounts(values: string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function summarizeFailure(failure: LynxReplaySweepFailure): string {
  const mismatch = failure.mismatches[0];
  if (!mismatch) {
    return `${failure.scenarioName} -> no mismatch details`;
  }
  return `${failure.scenarioName} -> ${mismatch.path}: expected ${mismatch.expected}, got ${mismatch.actual}`;
}

async function main(): Promise<void> {
  const solutionFiles = discoverSolutionFiles();
  if (solutionFiles.length === 0) {
    console.log("No solution files found.");
    return;
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const solutionRepository = new NodeSolutionFileRepository();
  const candidate = new LynxGameEngineAdapter(new NodeLevelRepository());
  const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);

  let replayCount = 0;
  const unsupportedFiles: string[] = [];
  const failures: LynxReplaySweepFailure[] = [];

  for (const solutionPath of solutionFiles) {
    const label = basename(solutionPath);
    console.log(`== ${label} ==`);

    const report = await runLynxSolutionFileReplaySweep(
      { fixtureRepository, solutionRepository, candidate, oracle },
      [solutionPath],
      { scenarioNameIncludes: replayScenarioFilter, seriesCatalog },
    );

    replayCount += report.replayCount;
    unsupportedFiles.push(...report.unsupportedFiles);
    failures.push(...report.failures);

    console.log(`checked ${report.replayCount}, failing ${report.failures.length}`);
    for (const failure of report.failures) {
      console.log(`FAIL ${summarizeFailure(failure)}`);
    }
  }

  const aggregateReport: LynxReplaySweepReport = {
    replayCount,
    unsupportedFiles: unsupportedFiles.sort((left, right) => left.localeCompare(right)),
    failures,
    failureCountBySeries: rankCounts(failures.map((failure) => failure.seriesFile)),
    firstMismatchPathCounts: rankCounts(
      failures
        .map((failure) => failure.mismatchPaths[0])
        .filter((path): path is string => typeof path === "string" && path.length > 0),
    ),
  };

  console.log("");
  console.log(formatLynxReplaySweepFailureSummary(aggregateReport, Math.max(15, aggregateReport.failures.length)));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
