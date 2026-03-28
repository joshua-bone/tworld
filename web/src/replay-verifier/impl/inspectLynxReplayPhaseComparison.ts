import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { prepareLoadedLynxLevel } from "@ruleset-lynx/api/levelLoader";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const solutionPath = process.env.TWORLD_LYNX_SOLUTION_FILE?.trim() || "";
const scenarioName = process.env.TWORLD_LYNX_REPLAY_FILTER?.trim() || "";
const phaseName = process.env.TWORLD_LYNX_DEBUG_TARGET_PHASE?.trim() || "";
const targetPos = Number.parseInt(process.env.TWORLD_LYNX_DEBUG_TARGET_POS ?? "", 10);
const stepRange = process.env.TWORLD_LYNX_STEP_RANGE?.trim() || "0:0";
const targetStep = Number.parseInt(process.env.TWORLD_LYNX_DEBUG_TARGET_STEP ?? "", 10);

function parseStepRange(value: string): { start: number; end: number } {
  const [startText, endText] = value.split(":");
  const start = Number.parseInt(startText ?? "0", 10);
  const end = Number.parseInt(endText ?? startText ?? "0", 10);
  return {
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? end : start,
  };
}

function findActorAtPos(
  phase:
    | {
        activeCreatures: Array<{ position: { pos: number } }>;
        blocks: Array<{ position: { pos: number } }>;
      }
    | null
    | undefined,
  pos: number,
) {
  if (!phase) {
    return { active: null, block: null };
  }

  return {
    active: phase.activeCreatures.find((actor) => actor.position.pos === pos) ?? null,
    block: phase.blocks.find((actor) => actor.position.pos === pos) ?? null,
  };
}

async function main(): Promise<void> {
  if (!solutionPath || !scenarioName || !phaseName || !Number.isFinite(targetPos) || targetPos < 0) {
    throw new Error(
      "Set TWORLD_LYNX_SOLUTION_FILE, TWORLD_LYNX_REPLAY_FILTER, TWORLD_LYNX_STEP_RANGE, TWORLD_LYNX_DEBUG_TARGET_STEP, TWORLD_LYNX_DEBUG_TARGET_PHASE, and TWORLD_LYNX_DEBUG_TARGET_POS.",
    );
  }

  const { start, end } = parseStepRange(stepRange);
  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const loaded = await solutionRepository.loadSolutionFile(resolve(repoRoot, solutionPath));
  const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
  const scenario = plan.scenarios.find((entry) => entry.name === scenarioName);

  if (!scenario) {
    throw new Error(`Replay scenario not found: ${scenarioName}`);
  }

  const candidate = new LynxGameEngineAdapter(new NodeLevelRepository(repoRoot));
  const levelRepository = new NodeLevelRepository(repoRoot);
  const oracle = new NativeOracleGameEngineAdapter({
    oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
  });
  const loadedLevel = await levelRepository.loadLevel(scenario.request);
  const level = prepareLoadedLynxLevel(loadedLevel);

  const actual = await candidate.runReplayTraceDebugWindow(
    scenario.request,
    scenario.replay,
    scenario.maxTicks,
    start,
    end + 1,
  );
  const expected = await oracle.runReplayTraceDebugWindow(
    scenario.request,
    scenario.replay,
    scenario.maxTicks,
    start,
    end + 1,
  );

  const expectedStep = expected.steps[targetStep] ?? null;
  const actualStep = actual.steps[targetStep] ?? null;
  const expectedPhase = expectedStep?.phases.find((phase) => phase.phase === phaseName) ?? null;
  const actualPhase = actualStep?.phases.find((phase) => phase.phase === phaseName) ?? null;

  const expectedActors = findActorAtPos(expectedPhase, targetPos);
  const actualActors = findActorAtPos(actualPhase, targetPos);

  console.log(
    JSON.stringify(
      {
        scenario: scenario.name,
        target: {
          phaseName,
          targetPos,
          windowStart: start,
          windowEnd: end,
          localStepIndex: targetStep,
          absoluteStepIndex: start + targetStep,
        },
        rawLevelCellAtPos: level.cells[targetPos] ?? null,
        expected: {
          phase: expectedPhase
            ? {
                phase: expectedPhase.phase,
                currentInputCode: expectedPhase.currentInputCode,
                soundEffects: expectedPhase.soundEffects,
                mapHash: expectedPhase.mapHash,
                chip: expectedPhase.activeCreatures[0] ?? null,
                actorAtPos: expectedActors.active,
                blockAtPos: expectedActors.block,
                cellAtPos: expectedPhase.map.cells[targetPos] ?? null,
              }
            : null,
        },
        actual: {
          phase: actualPhase
            ? {
                phase: actualPhase.phase,
                currentInputCode: actualPhase.currentInputCode,
                soundEffects: actualPhase.soundEffects,
                mapHash: actualPhase.mapHash,
                chip: actualPhase.activeCreatures[0] ?? null,
                actorAtPos: actualActors.active,
                blockAtPos: actualActors.block,
                cellAtPos: actualPhase.map.cells[targetPos] ?? null,
              }
            : null,
        },
      },
      null,
      2,
    ),
  );
}

await main();
