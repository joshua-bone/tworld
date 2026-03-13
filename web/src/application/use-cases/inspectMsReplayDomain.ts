import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@adapters/levels/loadNodeReplaySweepSeriesCatalog";
import { NodeSolutionFileRepository } from "@adapters/solutions/NodeSolutionFileRepository";
import { buildReplayTraceScenariosFromSolutionFile } from "@application/use-cases/buildReplayTraceScenariosFromSolutionFile";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { parseMsLevel } from "@domain/game/rules/ms/level";
import { createReplayPlan, plannedReplayInput } from "@domain/game/playback";
import { advanceMsInteractiveSession, createMsReplaySession } from "@domain/game/rules/ms/engine";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const scenarioName = process.env.TWORLD_MS_REPLAY_FILTER?.trim() || "";
const solutionPath = process.env.TWORLD_MS_SOLUTION_FILE?.trim() || "";
const stepRange = process.env.TWORLD_MS_STEP_RANGE?.trim() || "0:5";
const positionsText = process.env.TWORLD_POSITIONS?.trim() || "";
const includeSlipList = process.env.TWORLD_INCLUDE_SLIP_LIST?.trim() === "1";

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
  const levelRepository = new NodeLevelRepository(repoRoot);
  const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, solutionPath));
  const sweepPlan = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog);
  const scenario = sweepPlan.scenarios.find((entry) => entry.name === scenarioName);

  if (!scenario) {
    throw new Error(`Replay scenario not found: ${scenarioName}`);
  }

  const loadedLevel = await levelRepository.loadLevel(scenario.request);
  const level = parseMsLevel(loadedLevel.levelData);
  const replay = scenario.replay;
  let session = createMsReplaySession(scenario.request, level, replay);
  let plan = createReplayPlan(replay);
  const { start, end } = parseStepRange(stepRange);
  const positions = positionsText
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  const ticks: unknown[] = [];

  for (let tick = 0; tick <= end; tick += 1) {
    const { input, plan: nextPlan } = plannedReplayInput(plan, tick);
    plan = nextPlan;
    session = advanceMsInteractiveSession(session, input.inputCode);

    if (tick < start) {
      continue;
    }

    ticks.push({
      tick,
      input,
      chip: session.state.engine.chip,
      creatureSlipList: includeSlipList ? session.state.internal.creatureSlipList : undefined,
      trackedBlocks: session.state.internal.blocks
        .filter((block) => positions.includes(block.pos))
        .map((block) => ({
          pos: block.pos,
          dir: block.dir,
          floorMovement: block.floorMovement,
          floorMovementDir: block.floorMovementDir,
        })),
      trapCreatures: session.state.internal.creatures
        .filter((creature) => positions.includes(creature.pos) || level.traps.some((trap) => trap.to === creature.pos))
        .map((creature) => ({
          serial: creature.serial,
          id: creature.id,
          dir: creature.dir,
          pos: creature.pos,
          released: creature.released,
          turning: creature.turning,
          hasMoved: creature.hasMoved,
          floorMovement: creature.floorMovement,
          floorMovementDir: creature.floorMovementDir,
        })),
      controllerDir: session.state.internal.controllerDir,
      cells: positions.map((pos) => session.state.engine.map.cells[pos]),
    });
  }

  console.log(JSON.stringify({ scenario: scenario.name, traps: level.traps, ticks }, null, 2));
}

await main();
