import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { createRulesetReplaySweepTerminalReporter } from "@replay-verifier/impl/rulesetReplaySweepTerminalReporter";
import { discoverReplaySweepSolutionFiles, envPrefixForRuleset, readReplaySweepEnv } from "@replay-verifier/impl/replaySweepSupport";
import {
  runSolutionFileReplaySweep,
  type SolutionFileReplaySweepOptions,
} from "@replay-verifier/impl/runSolutionFileReplaySweep";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { SupportedReplaySweepRuleset } from "@replay-verifier/impl/solutionFileReplaySweepTypes";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function parseRulesetArg(argv: string[]): SupportedReplaySweepRuleset {
  const value = argv[2];
  if (value === "MS" || value === "Lynx") {
    return value;
  }
  throw new Error(`Expected ruleset argument "MS" or "Lynx", got ${value ?? "(missing)"}`);
}

function discoverSolutionFiles(ruleset: SupportedReplaySweepRuleset): string[] {
  const envPrefix = envPrefixForRuleset(ruleset);
  const explicitPaths = (readReplaySweepEnv(`TWORLD_${envPrefix}_SOLUTION_FILE`, "TWORLD_SOLUTION_FILE")?.split(",") ?? [])
    .map((path) => path.trim())
    .filter(Boolean);

  return discoverReplaySweepSolutionFiles({
    repoRoot,
    explicitPaths,
    fileFilter: readReplaySweepEnv(`TWORLD_${envPrefix}_SOLUTION_FILE_FILTER`, "TWORLD_SOLUTION_FILE_FILTER"),
  });
}

async function main(): Promise<void> {
  const ruleset = parseRulesetArg(process.argv);
  const envPrefix = envPrefixForRuleset(ruleset);
  const replayScenarioFilter = readReplaySweepEnv(`TWORLD_${envPrefix}_REPLAY_FILTER`, "TWORLD_REPLAY_FILTER");
  const solutionFiles = discoverSolutionFiles(ruleset);

  if (!process.env.TWORLD_ORACLE_BIN && !NativeOracleGameEngineAdapter.hasDefaultOracle()) {
    console.log(`Skipping ${ruleset} replay verification because no native oracle binary is available.`);
    return;
  }

  if (solutionFiles.length === 0) {
    console.log("No solution files found.");
    return;
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const solutionRepository = new NodeSolutionFileRepository();
  const levelRepository = new NodeLevelRepository();
  const candidates: Record<SupportedReplaySweepRuleset, Pick<GameEnginePort, "runReplayTrace">> = {
    Lynx: new LynxGameEngineAdapter(levelRepository),
    MS: new MsGameEngineAdapter(levelRepository),
  };
  const oracle = new NativeOracleGameEngineAdapter({
    oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
  });
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const reporter = createRulesetReplaySweepTerminalReporter(ruleset, useColor);

  const options: SolutionFileReplaySweepOptions = {
    scenarioNameIncludes: replayScenarioFilter,
    seriesCatalog,
    progress: reporter.progress,
  };

  const report = await runSolutionFileReplaySweep(
    ruleset,
    {
      fixtureRepository,
      solutionRepository,
      candidate: candidates[ruleset],
      oracle,
    },
    solutionFiles,
    options,
  );

  process.exitCode = reporter.finish(report);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
