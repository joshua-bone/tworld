import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { NodeOracleDebugFixtureRepository } from "@adapters/fixtures/NodeOracleDebugFixtureRepository";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { NodeSolutionFileRepository } from "@adapters/solutions/NodeSolutionFileRepository";
import { NodeOracleDebugScenarioRepository } from "@adapters/scenarios/NodeOracleDebugScenarioRepository";
import type { OracleReplayDebugSpec } from "@application/contracts/oracleDebug";
import { mapOracleDebugFixtureToGameDebugTrace } from "@application/mappers/oracleDebug";
import { compareReplayTraceDebugScenario } from "@application/engine/use-cases/compareReplayTraceDebugScenario";
import { buildReplayTraceScenariosFromSolutionFile } from "@application/use-cases/buildReplayTraceScenariosFromSolutionFile";
import { loadSeriesCatalog } from "@application/use-cases/loadSeriesCatalog";
import { NativeOracleGameEngineAdapter } from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { collectDebugTraceMismatches } from "@application/engine/comparators/debugTraceComparison";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../../");

describe("TS MS engine replay debug differential", () => {
  it("matches the reduced CCLP1 teleport/block debug replay", async () => {
    const scenarioRepository = new NodeOracleDebugScenarioRepository();
    const fixtureRepository = new NodeOracleDebugFixtureRepository();
    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const scenario = (await scenarioRepository.loadSpecs()).find(
      (entry): entry is OracleReplayDebugSpec =>
        entry.name === "cclp1-ms-level-113-teleport-block-debug" && entry.command !== "input-trace-debug",
    );
    const expectedFixture = await fixtureRepository.loadTrace("cclp1-ms-level-113-teleport-block-debug");

    expect(scenario).toBeDefined();
    const comparison = await compareReplayTraceDebugScenario(
      candidate,
      mapOracleDebugFixtureToGameDebugTrace(expectedFixture),
      scenario!,
    );

    expect(comparison.mismatches).toEqual([]);
  });

  it("exports native floor state for hidden actor/block overlaps in exact CCLP1:124", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/CCLP1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "CCLP1.dac.tws:124",
    );

    expect(scenario).toBeDefined();

    const trace = await new TsMsGameEngineAdapter(new NodeLevelRepository()).runReplayTraceDebug(
      scenario!.request,
      scenario!.replay,
      scenario!.maxTicks,
    );

    const hiddenActorPhase = trace.steps[640]?.phases.find((entry) => entry.phase === "post-chip-movement");
    const hiddenActor = hiddenActorPhase?.activeCreatures[1];
    const visibleBlock = hiddenActorPhase?.blocks[0];
    const hiddenBlockPhase = trace.steps[1340]?.phases.find((entry) => entry.phase === "post-chip-movement");
    const hiddenBlock = hiddenBlockPhase?.blocks[1];

    expect(hiddenActor?.hidden).toBe(true);
    expect(hiddenActor?.position.pos).toBe(902);
    expect(hiddenActor?.floor.id).toBe(1);
    expect(visibleBlock?.position.pos).toBe(902);
    expect(visibleBlock?.floor.id).toBe(54);
    expect(hiddenBlock?.hidden).toBe(true);
    expect(hiddenBlock?.position.pos).toBe(363);
    expect(hiddenBlock?.floor.id).toBe(1);
  }, 30_000);

  it("exports Empty floor state for hidden active creatures in exact CCLP1:141", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/CCLP1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "CCLP1.dac.tws:141",
    );

    expect(scenario).toBeDefined();

    const trace = await new TsMsGameEngineAdapter(new NodeLevelRepository()).runReplayTraceDebug(
      scenario!.request,
      scenario!.replay,
      scenario!.maxTicks,
    );

    const hiddenCreaturePhase = trace.steps[1488]?.phases.find((entry) => entry.phase === "post-input-latch");
    const hiddenCreature = hiddenCreaturePhase?.activeCreatures[18];

    expect(hiddenCreature?.hidden).toBe(true);
    expect(hiddenCreature?.position.pos).toBe(781);
    expect(hiddenCreature?.floor.id).toBe(1);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:24", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:24",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 90, 101);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(90, 101),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:10", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:10",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 5);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(0, 5),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:100", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:100",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 8);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(0, 8),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:47", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:47",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 7, 9);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(7, 9),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:48", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:48",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 19, 21);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(19, 21),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:102", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:102",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 12, 15);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(12, 15),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:125", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:125",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 8, 9);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(8, 9),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:12", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:12",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 20, 23);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(20, 23),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:42", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:42",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 346, 349);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(346, 349),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:106", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:106",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, 1118, 1114, 1118);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, 1118);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(1114, 1118),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);

  it("matches the bounded debug window for exact public_EvanD1:105", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/public_EvanD1.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "public_EvanD1.dac.tws:105",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 1464, 1465);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(1464, 1465),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);
});
