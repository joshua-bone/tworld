import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { NativeOracleGameEngineAdapter } from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { collectDebugTraceMismatches } from "@replay-verifier/impl/engine/comparators/debugTraceComparison";

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

    const candidate = new LynxGameEngineAdapter(new NodeLevelRepository());
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
