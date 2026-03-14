import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NativeOracleGameEngineAdapter } from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { MS_TILE } from "@ruleset-ms/api/tiles";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;

function msReplaySolutionPath(name: string): string {
  return resolve(repoRoot, "save", name.split(":")[0] ?? "");
}

async function loadMsReplayScenario(name: string) {
  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const loadedSolution = await solutionRepository.loadSolutionFile(msReplaySolutionPath(name));
  return buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find((entry) => entry.name === name);
}

runSuite("native MS replay characterization", () => {
  it("drops the opening stray east block from the actor list by step 4 in CCLP5 Voting Initiative:47", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Initiative-MS.tws:47");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const step = trace.steps[4];

    expect(step?.creatureCount).toBe(3);
    expect(step?.lastMove).toBe("north");
    expect(step?.soundEffects).toBe(1 << 12);
    expect(step?.creatures).toEqual([
      expect.objectContaining({ id: MS_TILE.Ball, dir: "north", position: { pos: 95, x: 31, y: 2 } }),
      expect.objectContaining({ id: MS_TILE.Swimming_Chip, dir: "north", position: { pos: 430, x: 14, y: 13 } }),
      expect.objectContaining({ id: MS_TILE.Block, dir: "north", position: { pos: 562, x: 18, y: 17 } }),
    ]);
  }, 30_000);

  it("has ninety live actors at the late cloner tick in CCLP5 Voting Initiative:50", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Initiative-MS.tws:50");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const step = trace.steps[251];

    expect(step?.creatureCount).toBe(90);
    expect(step?.lastMove).toBe("south");
    expect(step?.soundEffects).toBe(1 << 12);
    expect(step?.randomState.main.value).toBe("603798699");
    expect(step?.creatures.slice(0, 4)).toEqual([
      expect.objectContaining({ id: MS_TILE.Ball, dir: "west", position: { pos: 57, x: 25, y: 1 } }),
      expect.objectContaining({ id: MS_TILE.Ball, dir: "west", position: { pos: 59, x: 27, y: 1 } }),
      expect.objectContaining({ id: MS_TILE.Ball, dir: "east", position: { pos: 61, x: 29, y: 1 } }),
      expect.objectContaining({ id: MS_TILE.Ball, dir: "east", position: { pos: 62, x: 30, y: 1 } }),
    ]);
  }, 30_000);

  it("advances the MS RNG to 1985890719 by step 242 in CCLP5 Voting Zipline:2", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Zipline-MS.tws:2");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const step = trace.steps[242];

    expect(step?.randomState.main.initial).toBe("4781984");
    expect(step?.randomState.main.value).toBe("1985890719");
    expect(step?.creatureCount).toBe(8);
    expect(step?.lastMove).toBe("east");
    expect(step?.creatures.slice(0, 5)).toEqual([
      expect.objectContaining({ id: MS_TILE.Blob, dir: "north", position: { pos: 143, x: 15, y: 4 } }),
      expect.objectContaining({ id: MS_TILE.Walker, dir: "north", position: { pos: 207, x: 15, y: 6 } }),
      expect.objectContaining({ id: MS_TILE.Walker, dir: "north", position: { pos: 739, x: 3, y: 23 } }),
      expect.objectContaining({ id: MS_TILE.Tank, dir: "west", position: { pos: 742, x: 6, y: 23 } }),
      expect.objectContaining({ id: MS_TILE.Blob, dir: "east", position: { pos: 782, x: 14, y: 24 } }),
    ]);
  }, 30_000);

  it("keeps the leading tank column facing east at step 320 in CCLP5 Voting Zipline:14", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Zipline-MS.tws:14");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const step = trace.steps[320];

    expect(step?.creatureCount).toBe(96);
    expect(step?.lastMove).toBe("west");
    expect(step?.soundEffects).toBe((1 << 12) | (1 << 6));
    expect(step?.creatures.slice(0, 4)).toEqual([
      expect.objectContaining({ id: MS_TILE.Tank, dir: "east", position: { pos: 31, x: 31, y: 0 } }),
      expect.objectContaining({ id: MS_TILE.Tank, dir: "east", position: { pos: 63, x: 31, y: 1 } }),
      expect.objectContaining({ id: MS_TILE.Tank, dir: "east", position: { pos: 95, x: 31, y: 2 } }),
      expect.objectContaining({ id: MS_TILE.Tank, dir: "east", position: { pos: 127, x: 31, y: 3 } }),
    ]);
  }, 30_000);

  it("keeps the teleport probe bomb sound when Chip stays on the teleport in CCLP5 Voting Nonsense:22", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Nonsense-MS.tws:22");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const step = trace.steps[3072];

    expect(step?.soundEffects).toBe((1 << 9) | (1 << 16));
    expect(step?.chip).toEqual(
      expect.objectContaining({
        dir: "north",
        position: { pos: 221, x: 29, y: 6 },
      }),
    );
    expect(step?.mapHash).toBe("7fdce39d7e6edcf8");
  }, 30_000);

  it("consumes the second random-slide direction after a blocked ice retry in CCLP5 Voting Yogurt:47", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Yogurt-MS.tws:47");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const step = trace.steps[470];

    expect(step?.soundEffects).toBe(1 << 5);
    expect(step?.randomState.main.value).toBe("1485917616");
    expect(step?.chip).toEqual(
      expect.objectContaining({
        dir: "south",
        position: { pos: 716, x: 12, y: 22 },
      }),
    );
  }, 30_000);

  it("keeps the pushed block off Chip's teleport landing tile in CCLP5 Voting Vanadium:12", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Vanadium-MS.tws:12");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 314, 315);
    const postChipMovement = trace.steps[0]?.phases.find((entry) => entry.phase === "post-chip-movement");
    const teleportedChip = postChipMovement?.activeCreatures.find((actor) => actor.id === MS_TILE.Chip);
    const blockAt333 = postChipMovement?.map.cells[333];
    const chipAt395 = postChipMovement?.map.cells[395];

    expect(teleportedChip).toEqual(
      expect.objectContaining({
        position: { pos: 395, x: 11, y: 12 },
        floor: expect.objectContaining({ id: MS_TILE.Teleport }),
      }),
    );
    expect(blockAt333).toEqual(
      expect.objectContaining({
        top: { id: MS_TILE.Block_Static, state: 0 },
        bottom: { id: MS_TILE.Teleport, state: 0 },
      }),
    );
    expect(chipAt395).toEqual(
      expect.objectContaining({
        top: { id: 64, state: 0 },
        bottom: { id: MS_TILE.Teleport, state: 0 },
      }),
    );
  }, 30_000);

  it("allows Chip to land on a teleport whose forced-exit step is creature-occupied in CCLP5 Voting Darkness:11", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Darkness-MS.tws:11");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 507, 508);
    const postChipMovement = trace.steps[0]?.phases.find((entry) => entry.phase === "post-chip-movement");
    const teleportedChip = postChipMovement?.activeCreatures.find((actor) => actor.id === MS_TILE.Chip);
    const creatureAt708 = postChipMovement?.activeCreatures.find((actor) => actor.position.pos === 708);
    const chipCell = postChipMovement?.map.cells[709];

    expect(teleportedChip).toEqual(
      expect.objectContaining({
        position: { pos: 709, x: 5, y: 22 },
        floor: expect.objectContaining({ id: MS_TILE.Teleport }),
      }),
    );
    expect(creatureAt708).toEqual(
      expect.objectContaining({
        id: MS_TILE.Ball,
        position: { pos: 708, x: 4, y: 22 },
      }),
    );
    expect(chipCell).toEqual(
      expect.objectContaining({
        top: { id: 65, state: 0 },
        bottom: { id: MS_TILE.Teleport, state: 0 },
      }),
    );
  }, 30_000);

  it("stays on the late Spatula map hash at step 3720 in CCLP5 Voting Spatula:6", async () => {
    const scenario = await loadMsReplayScenario("CCLP5Voting-Spatula-MS.tws:6");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const step = trace.steps[3720];

    expect(step?.chip).toEqual(
      expect.objectContaining({
        dir: "south",
        position: { pos: 348, x: 28, y: 10 },
      }),
    );
    expect(step?.soundEffects).toBe(0);
    expect(step?.mapHash).toBe("0e01fd1b592bb6f8");
  }, 30_000);
});
