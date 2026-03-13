import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TsLynxGameEngineAdapter } from "@adapters/engine/TsLynxGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@adapters/levels/loadNodeReplaySweepSeriesCatalog";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import { NativeOracleGameEngineAdapter, defaultOraclePath } from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@adapters/solutions/NodeSolutionFileRepository";
import { compareReplayTraceScenario } from "@application/engine/use-cases/compareReplayTraceScenario";
import { collectDebugTraceMismatches } from "@application/engine/comparators/debugTraceComparison";
import { buildReplayTraceScenariosFromSolutionFile } from "@application/use-cases/buildReplayTraceScenariosFromSolutionFile";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const solutionPath = process.env.TWORLD_LYNX_SOLUTION_FILE?.trim() || "";
const scenarioName = process.env.TWORLD_LYNX_REPLAY_FILTER?.trim() || "";
const useDebugTrace = process.env.TWORLD_LYNX_DEBUG_TRACE === "1";
const debugWindowStart = Number.parseInt(process.env.TWORLD_LYNX_DEBUG_WINDOW_START ?? "", 10);
const debugWindowEndExclusive = Number.parseInt(process.env.TWORLD_LYNX_DEBUG_WINDOW_END ?? "", 10);
const debugTargetStep = Number.parseInt(process.env.TWORLD_LYNX_DEBUG_TARGET_STEP ?? "", 10);
const debugTargetPhase = process.env.TWORLD_LYNX_DEBUG_TARGET_PHASE?.trim() || "";
const debugPositions = (process.env.TWORLD_LYNX_DEBUG_POSITIONS ?? "")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value >= 0);
const enabled = process.env.TWORLD_ENABLE_LYNX_REPLAY_INSPECT === "1";
const runSuite = enabled ? describe : describe.skip;

function hasDebugWindow(): boolean {
  return Number.isFinite(debugWindowStart) && Number.isFinite(debugWindowEndExclusive) && debugWindowStart >= 0 && debugWindowEndExclusive >= debugWindowStart;
}

function sliceDebugTraceWindow<T extends { steps: unknown[] }>(trace: T, start: number, endExclusive: number): T {
  return {
    ...trace,
    steps: trace.steps.slice(start, endExclusive),
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
      expected: { top: expected.top, bottom: expected.bottom },
      actual: { top: actual.top, bottom: actual.bottom },
    });
    if (diffs.length >= 16) {
      break;
    }
  }

  return diffs;
}

function directionNameToCode(name: string): number {
  switch (name) {
    case "north":
      return 1;
    case "west":
      return 2;
    case "south":
      return 4;
    case "east":
      return 8;
    default:
      return 0;
  }
}

function directionDelta(code: number): number {
  switch (code) {
    case 1:
      return -32;
    case 2:
      return -1;
    case 4:
      return 32;
    case 8:
      return 1;
    default:
      return 0;
  }
}

runSuite("inspect Lynx replay comparison", () => {
  it(
    "prints the first mismatch for one exact replay",
    async () => {
      expect(solutionPath).not.toBe("");
      expect(scenarioName).not.toBe("");

      const fixtureRepository = new NodeCharacterizationFixtureRepository();
      const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
      const solutionRepository = new NodeSolutionFileRepository();
      const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, solutionPath));
      const sweepPlan = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog);
      const scenario = sweepPlan.scenarios.find((entry) => entry.name === scenarioName);
      expect(scenario).toBeDefined();

      const candidate = new TsLynxGameEngineAdapter(new NodeLevelRepository(repoRoot));
      const oracle = new NativeOracleGameEngineAdapter({
        oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
      });

      if (useDebugTrace) {
        const usedWindowedActual = hasDebugWindow() && "runReplayTraceDebugWindow" in candidate;
        const actual = usedWindowedActual
          ? await (
              candidate as TsLynxGameEngineAdapter & {
                runReplayTraceDebugWindow: (
                  request: Parameters<TsLynxGameEngineAdapter["runReplayTraceDebug"]>[0],
                  replay: Parameters<TsLynxGameEngineAdapter["runReplayTraceDebug"]>[1],
                  maxTicks: number,
                  windowStart: number,
                  windowEndExclusive: number,
                ) => Promise<Awaited<ReturnType<TsLynxGameEngineAdapter["runReplayTraceDebug"]>>>;
              }
            ).runReplayTraceDebugWindow(
              scenario!.request,
              scenario!.replay,
              scenario!.maxTicks,
              debugWindowStart,
              debugWindowEndExclusive,
            )
          : await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
        const expected = hasDebugWindow()
          ? await oracle.runReplayTraceDebugWindow(
              scenario!.request,
              scenario!.replay,
              scenario!.maxTicks,
              debugWindowStart,
              debugWindowEndExclusive,
            )
          : await oracle.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
        const slicedActual = hasDebugWindow() && !usedWindowedActual
          ? sliceDebugTraceWindow(actual, debugWindowStart, debugWindowEndExclusive)
          : actual;
        const comparableActual = hasDebugWindow()
          ? {
              ...slicedActual,
              initialState: expected.initialState,
              initialDebugState: expected.initialDebugState,
            }
          : slicedActual;
        const mismatches = collectDebugTraceMismatches(comparableActual, expected);
        if (Number.isFinite(debugTargetStep) && debugTargetStep >= 0 && debugTargetPhase) {
          const expectedStep = expected.steps[debugTargetStep] ?? null;
          const actualStep = comparableActual.steps[debugTargetStep] ?? null;
          const expectedPhase = expectedStep?.phases.find((phase) => phase.phase === debugTargetPhase) ?? null;
          const actualPhase = actualStep?.phases.find((phase) => phase.phase === debugTargetPhase) ?? null;

          console.log(
            JSON.stringify(
              {
                scenario: scenario!.name,
                target: {
                  stepIndex: debugTargetStep,
                  phaseName: debugTargetPhase,
                },
                phaseCellDiffs: collectCellDiffs(
                  expectedPhase as Parameters<typeof collectCellDiffs>[0],
                  actualPhase as Parameters<typeof collectCellDiffs>[1],
                ),
                expectedCells: debugPositions.map((pos) => expectedPhase?.map.cells[pos] ?? null),
                actualCells: debugPositions.map((pos) => actualPhase?.map.cells[pos] ?? null),
                expectedPhase,
                actualPhase,
                firstMismatch: mismatches[0] ?? null,
              },
              null,
              2,
            ),
          );
          expect(true).toBe(true);
          return;
        }
        const localStepIndex = mismatches[0]?.stepIndex ?? null;
        const expectedStep = localStepIndex === null ? null : expected.steps[localStepIndex] ?? null;
        const actualStep = localStepIndex === null ? null : comparableActual.steps[localStepIndex] ?? null;
        const phaseName = mismatches[0]?.phaseName ?? null;
        const expectedPhase = phaseName ? expectedStep?.phases.find((phase) => phase.phase === phaseName) ?? null : null;
        const actualPhase = phaseName ? actualStep?.phases.find((phase) => phase.phase === phaseName) ?? null : null;
        const expectedChip = expectedPhase?.activeCreatures[0] ?? null;
        const actualChip = actualPhase?.activeCreatures[0] ?? null;
        const expectedTargetPos =
          expectedChip && directionNameToCode(expectedChip.tdir)
            ? expectedChip.position.pos + directionDelta(directionNameToCode(expectedChip.tdir))
            : null;
        const actualTargetPos =
          actualChip && directionNameToCode(actualChip.tdir)
            ? actualChip.position.pos + directionDelta(directionNameToCode(actualChip.tdir))
            : null;

        console.log(
          JSON.stringify(
            {
              scenario: scenario!.name,
              firstMismatch: mismatches[0] ?? null,
              phaseCellDiffs: collectCellDiffs(
                expectedPhase as Parameters<typeof collectCellDiffs>[0],
                actualPhase as Parameters<typeof collectCellDiffs>[1],
              ),
              expectedTargetCell:
                expectedTargetPos !== null ? expectedStep?.phases.find((phase) => phase.phase === phaseName)?.map.cells[expectedTargetPos] ?? null : null,
              actualTargetCell:
                actualTargetPos !== null ? actualStep?.phases.find((phase) => phase.phase === phaseName)?.map.cells[actualTargetPos] ?? null : null,
              expectedPhase: expectedPhase
                ? {
                    phase: expectedPhase.phase,
                    tick: expectedPhase.tick,
                    currentInputCode: expectedPhase.currentInputCode,
                    soundEffects: expectedPhase.soundEffects,
                    mapHash: expectedPhase.mapHash,
                    creaturesHash: expectedPhase.creaturesHash,
                    activeCreatures: expectedPhase.activeCreatures,
                    blocks: expectedPhase.blocks,
                    boardFlags: expectedPhase.boardFlags,
                  }
                : null,
              actualPhase: actualPhase
                ? {
                    phase: actualPhase.phase,
                    tick: actualPhase.tick,
                    currentInputCode: actualPhase.currentInputCode,
                    soundEffects: actualPhase.soundEffects,
                    mapHash: actualPhase.mapHash,
                    creaturesHash: actualPhase.creaturesHash,
                    activeCreatures: actualPhase.activeCreatures,
                    blocks: actualPhase.blocks,
                    boardFlags: actualPhase.boardFlags,
                  }
                : null,
            },
            null,
            2,
          ),
        );
        expect(true).toBe(true);
        return;
      }

      const comparison = await compareReplayTraceScenario(candidate, oracle, scenario!);
      const first = comparison.mismatches[0];
      const stepIndex = Number((first?.path.match(/^\$\.steps\[(\d+)\]/)?.[1]) ?? 0);
      const expectedStep = comparison.expected.steps[stepIndex];
      const actualStep = comparison.actual.steps[stepIndex];

      console.log(
        JSON.stringify(
          {
            scenario: scenario!.name,
            firstMismatch: first ?? null,
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

      expect(true).toBe(true);
    },
    60_000,
  );
});
