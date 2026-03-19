import { describe, expect, it } from "vitest";
import { CanonicalTraceGameEngineAdapter } from "@oracle-fixtures/impl/CanonicalTraceGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeTraceScenarioRepository } from "@replay-verifier/impl/NodeTraceScenarioRepository";
import { compareInputTraceScenario } from "@replay-verifier/impl/compareInputTraceScenario";

const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;

runSuite("input trace differential", () => {
  it("matches the live native oracle for every checked-in input trace scenario", async () => {
    const scenarioRepository = new NodeTraceScenarioRepository();
    const fixtureRepository = new NodeCharacterizationFixtureRepository();
    const candidate = new CanonicalTraceGameEngineAdapter(fixtureRepository);
    const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
    const scenarios = await scenarioRepository.loadInputTraceScenarios();

    expect(scenarios.length).toBeGreaterThan(0);

    for (const scenario of scenarios) {
      const comparison = await compareInputTraceScenario(candidate, oracle, scenario);
      expect(comparison.mismatches).toEqual([]);
    }
  });
});
