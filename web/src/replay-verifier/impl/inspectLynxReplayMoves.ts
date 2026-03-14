import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const solutionPath = process.env.TWORLD_LYNX_SOLUTION_FILE?.trim() || "";
const scenarioName = process.env.TWORLD_LYNX_REPLAY_FILTER?.trim() || "";
const centerIndex = Number.parseInt(process.env.TWORLD_LYNX_MOVE_INDEX ?? "", 10);
const centerTick = Number.parseInt(process.env.TWORLD_LYNX_MOVE_TICK ?? "", 10);
const radius = Number.parseInt(process.env.TWORLD_LYNX_MOVE_RADIUS ?? "6", 10);

function clampStart(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function main(): Promise<void> {
  if (!solutionPath || !scenarioName) {
    throw new Error("Set TWORLD_LYNX_SOLUTION_FILE and TWORLD_LYNX_REPLAY_FILTER.");
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const loaded = await solutionRepository.loadSolutionFile(resolve(repoRoot, solutionPath));
  const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
  const scenario = plan.scenarios.find((entry) => entry.name === scenarioName);

  if (!scenario) {
    throw new Error(`Replay scenario not found: ${scenarioName}`);
  }

  const moves = scenario.replay.moves;
  const fallbackIndex = Number.isFinite(centerIndex)
    ? centerIndex
    : Number.isFinite(centerTick)
      ? moves.findIndex((move) => move.when >= centerTick)
      : 0;
  const resolvedIndex = fallbackIndex >= 0 ? fallbackIndex : Math.max(0, moves.length - 1);
  const start = clampStart(resolvedIndex - (Number.isFinite(radius) ? radius : 6));
  const end = Math.min(moves.length, resolvedIndex + (Number.isFinite(radius) ? radius : 6) + 1);

  console.log(
    JSON.stringify(
      {
        scenario: scenario.name,
        moveCount: moves.length,
        centerIndex: resolvedIndex,
        centerTick: moves[resolvedIndex]?.when ?? null,
        slice: moves.slice(start, end).map((move, index) => ({
          index: start + index,
          when: move.when,
          dir: move.dir,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
