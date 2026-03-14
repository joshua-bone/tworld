import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const scenarioName = process.env.TWORLD_MS_REPLAY_FILTER?.trim() || "";
const stepRange = process.env.TWORLD_MS_STEP_RANGE?.trim() || "0:1";
const solutionPath = process.env.TWORLD_MS_SOLUTION_FILE?.trim() || "";
const positionsText = process.env.TWORLD_MS_POSITIONS?.trim() || "";

function parseStepRange(value: string): { start: number; endExclusive: number } {
  const [startText, endText] = value.split(":");
  const start = Number.parseInt(startText ?? "0", 10);
  const end = Number.parseInt(endText ?? startText ?? "0", 10);
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeEnd = Number.isFinite(end) ? end : safeStart;
  return {
    start: safeStart,
    endExclusive: safeEnd + 1,
  };
}

function parsePositions(value: string): number[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number.parseInt(entry, 10))
    .filter((entry) => Number.isFinite(entry));
}

async function main(): Promise<void> {
  if (!solutionPath || !scenarioName) {
    throw new Error("Set TWORLD_MS_SOLUTION_FILE and TWORLD_MS_REPLAY_FILTER.");
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const candidate = new MsGameEngineAdapter(new NodeLevelRepository());
  const loaded = await solutionRepository.loadSolutionFile(resolve(repoRoot, solutionPath));
  const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
  const scenario = plan.scenarios.find((entry) => entry.name === scenarioName);

  if (!scenario) {
    throw new Error(`Replay scenario not found: ${scenarioName}`);
  }

  const { start, endExclusive } = parseStepRange(stepRange);
  const positions = parsePositions(positionsText);
  const trace = await candidate.runReplayTraceDebugWindow(scenario.request, scenario.replay, scenario.maxTicks, start, endExclusive);

  console.log(
    JSON.stringify(
      {
        scenario: scenario.name,
        request: scenario.request,
        positions,
        steps: trace.steps.map((step) => ({
          step: step.tick,
          snapshot: {
            chip: step.chip,
            soundEffects: step.soundEffects,
            mapHash: step.mapHash,
            lastMove: step.lastMove,
            replayCursor: step.replayCursor,
          },
          phases: step.phases.map((phase) => ({
            phase: phase.phase,
            chipStatus: phase.chipStatus,
            chipFloor: phase.chipFloor,
            controllerDir: phase.controllerDir,
            lastSlipDir: phase.lastSlipDir,
            soundEffects: phase.soundEffects,
            mapHash: phase.mapHash,
            activeCreatures: phase.activeCreatures.filter(
              (actor) => actor.id === 64 || positions.includes(actor.position.pos),
            ),
            blocks: phase.blocks.filter((actor) => positions.includes(actor.position.pos)),
            cells: positions.map((pos) => phase.map.cells[pos]).filter(Boolean),
          })),
        })),
      },
      null,
      2,
    ),
  );
}

await main();
