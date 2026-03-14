import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { compareReplayTraceScenario } from "@replay-verifier/impl/engine/use-cases/compareReplayTraceScenario";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const scenarioName = process.env.TWORLD_MS_REPLAY_FILTER?.trim() || "";
const stepRange = process.env.TWORLD_MS_STEP_RANGE?.trim() || "0:5";
const solutionPath = process.env.TWORLD_MS_SOLUTION_FILE?.trim() || "";

function parseStepRange(value: string): { start: number; end: number } {
  const [startText, endText] = value.split(":");
  const start = Number.parseInt(startText ?? "0", 10);
  const end = Number.parseInt(endText ?? startText ?? "0", 10);
  return {
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? end : start,
  };
}

async function main(): Promise<void> {
  if (!solutionPath || !scenarioName) {
    throw new Error("Set TWORLD_MS_SOLUTION_FILE and TWORLD_MS_REPLAY_FILTER.");
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const candidate = new MsGameEngineAdapter(new NodeLevelRepository());
  const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
  const loaded = await solutionRepository.loadSolutionFile(resolve(repoRoot, solutionPath));
  const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
  const scenario = plan.scenarios.find((entry) => entry.name === scenarioName);

  if (!scenario) {
    throw new Error(`Replay scenario not found: ${scenarioName}`);
  }

  const comparison = await compareReplayTraceScenario(candidate, oracle, scenario);
  const { start, end } = parseStepRange(stepRange);

  console.log(
    JSON.stringify(
      {
        scenario: scenario.name,
        request: scenario.request,
        replay: {
          bestTimeTicks: scenario.replay.bestTimeTicks,
          randomSeed: scenario.replay.randomSeed,
          randomSlideDirection: scenario.replay.randomSlideDirection,
          stepping: scenario.replay.stepping,
          moves: scenario.replay.moves.slice(0, 20),
        },
        mismatches: comparison.mismatches,
        initial: {
          expected: comparison.expected.initialState,
          actual: comparison.actual.initialState,
        },
        steps: Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index).map((step) => ({
          step,
          expected: comparison.expected.steps[step] ?? null,
          actual: comparison.actual.steps[step] ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
