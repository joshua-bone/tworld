import { dirname, resolve } from "node:path";
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
import { createRulesetReplaySweepTerminalReporter } from "@replay-verifier/impl/rulesetReplaySweepTerminalReporter";
import { runLynxSolutionFileReplaySweep } from "@replay-verifier/impl/runLynxSolutionFileReplaySweep";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const replayScenarioFilter = process.env.TWORLD_LYNX_REPLAY_FILTER?.trim() || null;
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

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
  const reporter = createRulesetReplaySweepTerminalReporter("Lynx", useColor);

  const report = await runLynxSolutionFileReplaySweep(
    { fixtureRepository, solutionRepository, candidate, oracle },
    solutionFiles,
    {
      scenarioNameIncludes: replayScenarioFilter,
      seriesCatalog,
      progress: reporter.progress,
    },
  );

  process.exitCode = reporter.finish(report);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
