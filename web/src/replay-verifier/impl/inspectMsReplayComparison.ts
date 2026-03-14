import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { NativeOracleGameEngineAdapter, defaultOraclePath } from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { compareReplayTraceScenario } from "@replay-verifier/impl/engine/use-cases/compareReplayTraceScenario";
import { collectDebugTraceMismatches } from "@replay-verifier/impl/engine/comparators/debugTraceComparison";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const solutionPath = process.env.TWORLD_MS_SOLUTION_FILE?.trim() || "";
const scenarioName = process.env.TWORLD_MS_REPLAY_FILTER?.trim() || "";
const maxCellDiffs = Number.parseInt(process.env.TWORLD_MS_MAX_CELL_DIFFS ?? "16", 10);
const useDebugTrace = process.env.TWORLD_MS_DEBUG_TRACE === "1";
const debugWindowStart = Number.parseInt(process.env.TWORLD_MS_DEBUG_WINDOW_START ?? "", 10);
const debugWindowEndExclusive = Number.parseInt(process.env.TWORLD_MS_DEBUG_WINDOW_END ?? "", 10);

function hasDebugWindow(): boolean {
  return Number.isFinite(debugWindowStart) && Number.isFinite(debugWindowEndExclusive) && debugWindowStart >= 0 && debugWindowEndExclusive >= debugWindowStart;
}

function sliceDebugTraceWindow<T extends { steps: unknown[] }>(trace: T, start: number, endExclusive: number): T {
  return {
    ...trace,
    steps: trace.steps.slice(start, endExclusive),
  };
}

function rebaseDebugMismatch(
  mismatch: ReturnType<typeof collectDebugTraceMismatches>[number] | undefined,
  stepOffset: number,
) {
  if (!mismatch) {
    return null;
  }

  const stepIndex = (mismatch.stepIndex ?? 0) + stepOffset;

  return {
    ...mismatch,
    stepIndex,
    path: mismatch.path.replace(/\$\.steps\[(\d+)\]/, (_, index: string) => `$.steps[${Number.parseInt(index, 10) + stepOffset}]`),
  };
}

function collectCellDiffs(
  expectedStep: {
    map?: {
      cells?: Array<{
        position: { pos: number };
        top: { id: number; state: number };
        bottom: { id: number; state: number };
      }>;
    };
  } | undefined,
  actualStep: {
    map?: {
      cells?: Array<{
        position: { pos: number };
        top: { id: number; state: number };
        bottom: { id: number; state: number };
      }>;
    };
  } | undefined,
) {
  const expectedCells = expectedStep?.map?.cells ?? [];
  const actualCells = actualStep?.map?.cells ?? [];
  const limit = Number.isFinite(maxCellDiffs) && maxCellDiffs > 0 ? maxCellDiffs : 16;
  const diffs: Array<{
    pos: number;
    expected: { top: { id: number; state: number }; bottom: { id: number; state: number } };
    actual: { top: { id: number; state: number }; bottom: { id: number; state: number } };
  }> = [];

  for (let index = 0; index < expectedCells.length && index < actualCells.length; index += 1) {
    const expected = expectedCells[index]!;
    const actual = actualCells[index]!;
    if (
      expected.top.id === actual.top.id &&
      expected.top.state === actual.top.state &&
      expected.bottom.id === actual.bottom.id &&
      expected.bottom.state === actual.bottom.state
    ) {
      continue;
    }

    diffs.push({
      pos: expected.position.pos,
      expected: {
        top: expected.top,
        bottom: expected.bottom,
      },
      actual: {
        top: actual.top,
        bottom: actual.bottom,
      },
    });
    if (diffs.length >= limit) {
      break;
    }
  }

  return diffs;
}

async function main(): Promise<void> {
  if (!solutionPath || !scenarioName) {
    throw new Error("Set TWORLD_MS_SOLUTION_FILE and TWORLD_MS_REPLAY_FILTER.");
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, solutionPath));
  const sweepPlan = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog);
  const scenario = sweepPlan.scenarios.find((entry) => entry.name === scenarioName);

  if (!scenario) {
    throw new Error(`Replay scenario not found: ${scenarioName}`);
  }

  const candidate = new MsGameEngineAdapter(new NodeLevelRepository(repoRoot));
  const oracle = new NativeOracleGameEngineAdapter({
    oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
  });

  if (useDebugTrace) {
    const stepOffset = hasDebugWindow() ? debugWindowStart : 0;
    const [candidateTrace, expected] = await Promise.all([
      candidate.runReplayTraceDebug(scenario.request, scenario.replay, scenario.maxTicks),
      hasDebugWindow()
        ? oracle.runReplayTraceDebugWindow(
            scenario.request,
            scenario.replay,
            scenario.maxTicks,
            debugWindowStart,
            debugWindowEndExclusive,
          )
        : oracle.runReplayTraceDebug(scenario.request, scenario.replay, scenario.maxTicks),
    ]);
    const actual = hasDebugWindow()
      ? sliceDebugTraceWindow(candidateTrace, debugWindowStart, debugWindowEndExclusive)
      : candidateTrace;
    const mismatches = collectDebugTraceMismatches(actual, expected);
    const firstDebug = rebaseDebugMismatch(mismatches[0], stepOffset);
    const localStepIndex = (firstDebug?.stepIndex ?? 0) - stepOffset;
    const phaseName = firstDebug?.phaseName;
    const expectedStep = expected.steps[localStepIndex];
    const actualStep = actual.steps[localStepIndex];
    const expectedPhase = phaseName ? expectedStep?.phases.find((phase) => phase.phase === phaseName) : null;
    const actualPhase = phaseName ? actualStep?.phases.find((phase) => phase.phase === phaseName) : null;

    console.log(
      JSON.stringify(
        {
          scenario: scenario.name,
          stepWindow: hasDebugWindow()
            ? {
                start: debugWindowStart,
                endExclusive: debugWindowEndExclusive,
              }
            : null,
          firstMismatch: firstDebug ?? null,
          localMismatch: mismatches[0] ?? null,
          phaseCellDiffs: collectCellDiffs(
            expectedPhase as Parameters<typeof collectCellDiffs>[0],
            actualPhase as Parameters<typeof collectCellDiffs>[1],
          ),
          expectedPhase,
          actualPhase,
          expectedStep,
          actualStep,
        },
        null,
        2,
      ),
    );
    return;
  }

  const comparison = await compareReplayTraceScenario(candidate, oracle, scenario);
  const first = comparison.mismatches[0];

  if (!first) {
    console.log(JSON.stringify({ scenario: scenario.name, mismatch: null }, null, 2));
    return;
  }

  const stepIndex = Number((first.path.match(/^\$\.steps\[(\d+)\]/)?.[1]) ?? 0);
  const expectedStep = comparison.expected.steps[stepIndex];
  const actualStep = comparison.actual.steps[stepIndex];
  console.log(
    JSON.stringify(
      {
        scenario: scenario.name,
        firstMismatch: first,
        cellDiffs: collectCellDiffs(
          expectedStep as Parameters<typeof collectCellDiffs>[0],
          actualStep as Parameters<typeof collectCellDiffs>[1],
        ),
        expectedStep,
        actualStep,
      },
      null,
      2,
    ),
  );
}

await main();
