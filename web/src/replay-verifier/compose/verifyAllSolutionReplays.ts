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
import {
  buildReplayTraceScenariosFromSolutionFile,
  isUnsupportedReplaySeries,
} from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { createAllReplayVerifierTerminalReporter, summarizeReplayVerifierError } from "@replay-verifier/impl/allReplayVerifierTerminalReporter";
import { discoverReplaySweepSolutionFiles, matchesReplayFilter } from "@replay-verifier/impl/replaySweepSupport";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { SupportedReplaySweepRuleset } from "@replay-verifier/impl/solutionFileReplaySweepTypes";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const solutionFileFilter = process.env.TWORLD_SOLUTION_FILE_FILTER?.trim() || null;
const replayFilter = process.env.TWORLD_REPLAY_FILTER?.trim() || null;
const failOnErrors = process.env.TWORLD_VERIFY_STRICT === "1";
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function discoverSolutionFiles(): string[] {
  const explicitPaths = (process.env.TWORLD_SOLUTION_FILE?.split(",") ?? [])
    .map((path) => path.trim())
    .filter(Boolean);

  return discoverReplaySweepSolutionFiles({
    repoRoot,
    explicitPaths,
    fileFilter: solutionFileFilter,
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
  const levelRepository = new NodeLevelRepository();
  const oracle = new NativeOracleGameEngineAdapter({
    oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
  });
  const candidates: Record<SupportedReplaySweepRuleset, Pick<GameEnginePort, "runReplayTrace">> = {
    Lynx: new LynxGameEngineAdapter(levelRepository),
    MS: new MsGameEngineAdapter(levelRepository),
  };
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const reporter = createAllReplayVerifierTerminalReporter(useColor);

  for (const solutionPath of solutionFiles) {
    const loaded = await solutionRepository.loadSolutionFile(solutionPath);

    if (isUnsupportedReplaySeries(loaded, seriesCatalog)) {
      reporter.onUnsupportedFile(loaded.label);
      continue;
    }

    const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
    const scenarios = plan.scenarios.filter((scenario) => matchesReplayFilter(scenario.name, replayFilter));
    reporter.onSolutionFileStart(loaded.label, plan.series.filebase, loaded.file.ruleset as SupportedReplaySweepRuleset, scenarios.length);

    for (const scenario of scenarios) {
      let expected;
      try {
        expected = await oracle.runReplayTrace(scenario.request, scenario.replay, scenario.maxTicks);
      } catch (error) {
        reporter.onLegacyFailure(
          scenario.name,
          scenario.request.levelNumber,
          scenario.request.ruleset as SupportedReplaySweepRuleset,
          `legacy $error: ${summarizeReplayVerifierError(error)}`,
          "$error",
        );
        continue;
      }

      if (expected.result.status !== "completed") {
        reporter.onLegacyFailure(
          scenario.name,
          scenario.request.levelNumber,
          scenario.request.ruleset as SupportedReplaySweepRuleset,
          `legacy ${expected.result.status} at tick ${expected.result.finalTick}`,
          expected.result.status,
        );
        continue;
      }

      try {
        const actual = await candidates[scenario.request.ruleset as SupportedReplaySweepRuleset].runReplayTrace(
          scenario.request,
          scenario.replay,
          scenario.maxTicks,
        );
        const mismatches = reporter.compareTraces(actual, expected);
        if (mismatches.length === 0) {
          reporter.onPass(
            scenario.name,
            scenario.request.levelNumber,
            scenario.request.ruleset as SupportedReplaySweepRuleset,
          );
          continue;
        }

        reporter.onTraceComparisonFailure(
          scenario.name,
          scenario.request.levelNumber,
          scenario.request.ruleset as SupportedReplaySweepRuleset,
          mismatches[0]!,
        );
      } catch (error) {
        reporter.onTraceComparisonFailure(
          scenario.name,
          scenario.request.levelNumber,
          scenario.request.ruleset as SupportedReplaySweepRuleset,
          {
            path: "$engine",
            expected: "matching completed native trace",
            actual: summarizeReplayVerifierError(error),
          },
        );
      }
    }

    reporter.onSolutionFileComplete();
  }

  reporter.finish(failOnErrors);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
