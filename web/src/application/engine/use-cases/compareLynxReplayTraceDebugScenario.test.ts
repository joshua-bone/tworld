import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TsLynxGameEngineAdapter } from "@adapters/engine/TsLynxGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import { NativeOracleGameEngineAdapter } from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@adapters/solutions/NodeSolutionFileRepository";
import { loadSeriesCatalog } from "@application/use-cases/loadSeriesCatalog";
import { buildReplayTraceScenariosFromSolutionFile } from "@application/use-cases/buildReplayTraceScenariosFromSolutionFile";
import { collectDebugTraceMismatches } from "@application/engine/comparators/debugTraceComparison";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../../");
const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;

runSuite("TS Lynx engine replay debug differential", () => {
  it.skip("matches the bounded debug window for exact CCLP1-lynx:1", async () => {
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const seriesCatalog = await loadSeriesCatalog(fixtureRepository);
    const solutionRepository = new NodeSolutionFileRepository();
    const loadedSolution = await solutionRepository.loadSolutionFile(resolve(repoRoot, "save/CCLP1-lynx.dac.tws"));
    const scenario = buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find(
      (entry) => entry.name === "CCLP1-lynx.dac.tws:1",
    );

    expect(scenario).toBeDefined();

    const candidate = new TsLynxGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter();
    const expected = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 18, 22);
    const actual = await candidate.runReplayTraceDebug(scenario!.request, scenario!.replay, scenario!.maxTicks);
    const slicedActual = {
      ...actual,
      steps: actual.steps.slice(18, 22),
    };
    const mismatches = collectDebugTraceMismatches(slicedActual, expected);

    expect(mismatches).toEqual([]);
  }, 30_000);
});
