import { describe, expect, it } from "vitest";
import { TsLynxGameEngineAdapter } from "@adapters/engine/TsLynxGameEngineAdapter";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { NodeTraceScenarioRepository } from "@adapters/scenarios/NodeTraceScenarioRepository";
import { compareInputTraceScenario } from "@application/use-cases/compareInputTraceScenario";

const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;
const supportedScenarioNames = [
  "intro-lynx-level-1-init",
  "intro-lynx-level-2-init",
  "intro-lynx-level-3-init",
  "intro-lynx-level-4-init",
  "intro-lynx-level-5-init",
  "intro-lynx-level-6-init",
  "intro-lynx-level-7-init",
  "intro-lynx-level-8-init",
  "intro-lynx-level-9-init",
  "intro-lynx-level-1-east-chips",
  "intro-lynx-level-2-watch-step-east",
  "intro-lynx-level-3-friends-idle",
  "intro-lynx-level-6-teleports-east",
  "intro-lynx-level-8-buttons-east",
];
const supportedScenarioNameSet = new Set(supportedScenarioNames);

runSuite("TS Lynx engine supported trace differential", () => {
  it("loads the currently supported Lynx init scenarios", async () => {
    const scenarioRepository = new NodeTraceScenarioRepository();
    const scenarios = (await scenarioRepository.loadInputTraceScenarios()).filter((scenario) =>
      supportedScenarioNameSet.has(scenario.name),
    );

    expect(scenarios.map((scenario) => scenario.name)).toEqual(supportedScenarioNames);
  });

  for (const scenarioName of supportedScenarioNames) {
    it(`matches the live native oracle for ${scenarioName}`, async () => {
      const scenarioRepository = new NodeTraceScenarioRepository();
      const candidate = new TsLynxGameEngineAdapter(new NodeLevelRepository());
      const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
      const scenario = (await scenarioRepository.loadInputTraceScenarios()).find((item) => item.name === scenarioName);

      expect(scenario?.name).toBe(scenarioName);
      const comparison = await compareInputTraceScenario(candidate, oracle, scenario!);
      expect(comparison.mismatches).toEqual([]);
    });
  }
});
