import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@adapters/levels/loadNodeReplaySweepSeriesCatalog";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { NodeTraceScenarioRepository } from "@adapters/scenarios/NodeTraceScenarioRepository";
import { NodeSolutionFileRepository } from "@adapters/solutions/NodeSolutionFileRepository";
import { collectTraceMismatches } from "@application/engine/comparators/traceComparison";
import { compareReplayTraceScenario } from "@application/engine/use-cases/compareReplayTraceScenario";
import { buildReplayTraceScenariosFromSolutionFile } from "@application/use-cases/buildReplayTraceScenariosFromSolutionFile";

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

async function expectReplayWindowToMatch(name: string, start: number, endExclusive: number) {
  const scenario = await loadMsReplayScenario(name);

  expect(scenario).toBeDefined();

  const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
  const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
  const [actual, expected] = await Promise.all([
    candidate.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks),
    oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks),
  ]);

  const actualSlice = {
    ...actual,
    steps: actual.steps.slice(start, endExclusive),
    result: expected.result,
  };
  const expectedSlice = {
    ...expected,
    steps: expected.steps.slice(start, endExclusive),
  };
  const mismatches: Array<{ path: string; expected: unknown; actual: unknown }> = [];
  collectTraceMismatches(actualSlice, expectedSlice, "$", mismatches, 25);

  expect(mismatches).toEqual([]);
}

runSuite("TS MS engine replay trace differential", () => {
  it("matches the live native oracle for the supported MS replay traces", async () => {
    const scenarioRepository = new NodeTraceScenarioRepository();
    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
    const scenarios = await scenarioRepository.loadReplayTraceScenarios();

    expect(scenarios.map((scenario) => scenario.name)).toEqual([
      "intro-ms-level-5-east-blocked-replay",
      "intro-ms-level-7-south-fail-replay",
      "intro-ms-level-9-complete-replay",
      "cclp1-ms-level-39-teeth-bomb-replay",
      "cclp1-ms-level-83-tank-ice-replay",
      "cclp1-ms-level-85-teleport-beartrap-replay",
      "cclp1-ms-level-93-cloner-fireball-replay",
      "cclp1-ms-level-11-water-swim-replay",
      "cclp1-ms-level-21-block-ice-bomb-replay",
      "cclp1-ms-level-24-ice-cant-move-replay",
      "cclp1-ms-level-7-brown-beartrap-replay",
      "cclp1-ms-level-90-replay-bitfield-wrap",
      "cclp1-ms-level-105-blocked-slide-manual-replay",
      "cclp1-ms-level-26-ice-requeue-replay",
      "cclp1-ms-level-41-blue-button-tank-replay",
      "cclp1-ms-level-111-chipwait-south-replay",
      "cclp1-ms-level-123-clone-controller-replay",
      "cclp1-ms-level-123-wall-leave-replay",
      "cclp1-ms-level-131-beartrap-controller-replay",
      "cclp1-ms-level-134-block-cloner-chain-replay",
      "cclp1-ms-level-138-nested-cloner-sound-replay",
      "cclp1-ms-level-50-slip-queue-replay",
      "cclp1-ms-level-77-time-low-replay",
      "cclp1-ms-level-146-closed-trap-replay",
      "cclp2-ms-level-131-socket-blue-button-replay",
    ]);

    for (const scenario of scenarios) {
      const comparison = await compareReplayTraceScenario(candidate, oracle, scenario);
      expect(comparison.mismatches).toEqual([]);
    }
  }, 60_000);

  it("matches the returning blue-button tank window from CCLP5 Voting Zipline:14", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Zipline-MS.tws:14", 316, 321);
  }, 30_000);

  it("matches the opening RNG window from CCLP5 Voting Zipline:2", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Zipline-MS.tws:2", 0, 3);
  }, 30_000);

  it("matches the late RNG window from CCLP5 Voting Initiative:47", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Initiative-MS.tws:47", 418, 422);
  }, 30_000);

  it("matches the teleport probe bomb-sound window from CCLP5 Voting Nonsense:22", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Nonsense-MS.tws:22", 3072, 3075);
  }, 30_000);

  it("matches the blocked-ice random-slide retry window from CCLP5 Voting Yogurt:47", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Yogurt-MS.tws:47", 470, 473);
  }, 30_000);

  it("matches the block-teleport source reservation window from CCLP5 Voting Vanadium:12", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Vanadium-MS.tws:12", 314, 316);
  }, 30_000);

  it("matches the creature-occupied teleport landing window from CCLP5 Voting Darkness:11", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Darkness-MS.tws:11", 507, 509);
  }, 30_000);

  it("matches the late steady-state window from CCLP5 Voting Spatula:6", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Spatula-MS.tws:6", 3720, 3722);
  }, 30_000);
});
