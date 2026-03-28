import { basename, dirname, resolve } from "node:path";
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
import { discoverReplaySweepSolutionFiles } from "@replay-verifier/impl/replaySweepSupport";
import {
  buildSolutionFileReplaySweepReport,
  formatSolutionFileReplaySweepFailureSummary,
  summarizeSolutionFileReplaySweepFailure,
} from "@replay-verifier/impl/solutionFileReplaySweepReport";
import { runLynxSolutionFileReplaySweep, type LynxReplaySweepFailure } from "@replay-verifier/impl/runLynxSolutionFileReplaySweep";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const replayScenarioFilter = process.env.TWORLD_LYNX_REPLAY_FILTER?.trim() || null;

function discoverSolutionFiles(): string[] {
  const explicitPaths = (process.env.TWORLD_LYNX_SOLUTION_FILE?.split(",") ?? [])
    .map((path) => path.trim())
    .filter(Boolean);

  return discoverReplaySweepSolutionFiles({
    repoRoot,
    explicitPaths,
  });
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
      console.log(`FAIL ${failure.scenarioName} -> ${summarizeSolutionFileReplaySweepFailure(failure)}`);
    }
  }

  console.log("");
  console.log(
    formatSolutionFileReplaySweepFailureSummary(
      buildSolutionFileReplaySweepReport({
        replayCount,
        unsupportedFiles,
        failures,
      }),
      Math.max(15, failures.length),
    ),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
