import { describe, expect, it } from "vitest";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { NodeTraceScenarioRepository } from "@adapters/scenarios/NodeTraceScenarioRepository";
import { compareInputTraceScenario } from "@application/use-cases/compareInputTraceScenario";

const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;
const supportedScenarioNames = new Set([
  "intro-ms-level-1-init",
  "intro-ms-level-1-east-chips",
  "intro-ms-level-2-init",
  "intro-ms-level-3-init",
  "intro-ms-level-4-init",
  "intro-ms-level-5-init",
  "intro-ms-level-2-watch-step-east",
  "intro-ms-level-3-friends-idle",
  "intro-ms-level-6-init",
  "intro-ms-level-7-init",
  "intro-ms-level-8-init",
  "intro-ms-level-9-init",
  "intro-ms-level-4-south-fail",
  "intro-ms-level-5-east-blocked",
  "intro-ms-level-6-teleports-east",
  "intro-ms-level-7-south-fail",
  "intro-ms-level-8-buttons-east",
  "intro-ms-level-9-complete",
  "cclp1-ms-level-8-cloner-idle",
  "cclp1-ms-level-18-blobs-idle",
  "cclp1-ms-level-23-walker-idle",
  "cclp1-ms-level-39-teeth-paramecia-idle",
  "cclp2-ms-level-14-tanks-idle",
  "cclp1-ms-level-7-brown-east",
  "cclp2-ms-level-10-blue-east",
  "cclp2-ms-level-32-red-south",
  "cclp1-ms-level-109-green-north",
  "cclp2-ms-level-2-block-south",
  "cclp1-ms-level-31-slide-north",
  "cclp2-ms-level-59-random-west",
  "cclp2-ms-level-59-random-east",
]);

runSuite("TS MS engine supported trace differential", () => {
  it("matches the live native oracle for the currently supported MS traces", async () => {
    const scenarioRepository = new NodeTraceScenarioRepository();
    const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
    const scenarios = (await scenarioRepository.loadInputTraceScenarios()).filter((scenario) =>
      supportedScenarioNames.has(scenario.name),
    );

    expect(scenarios.map((scenario) => scenario.name)).toEqual([
      "intro-ms-level-1-init",
      "intro-ms-level-2-init",
      "intro-ms-level-3-init",
      "intro-ms-level-4-init",
      "intro-ms-level-5-init",
      "intro-ms-level-6-init",
      "intro-ms-level-7-init",
      "intro-ms-level-8-init",
      "intro-ms-level-9-init",
      "intro-ms-level-1-east-chips",
      "intro-ms-level-2-watch-step-east",
      "intro-ms-level-3-friends-idle",
      "intro-ms-level-6-teleports-east",
      "intro-ms-level-8-buttons-east",
      "intro-ms-level-4-south-fail",
      "intro-ms-level-5-east-blocked",
      "intro-ms-level-7-south-fail",
      "intro-ms-level-9-complete",
      "cclp1-ms-level-8-cloner-idle",
      "cclp1-ms-level-18-blobs-idle",
      "cclp1-ms-level-23-walker-idle",
      "cclp1-ms-level-39-teeth-paramecia-idle",
      "cclp2-ms-level-14-tanks-idle",
      "cclp1-ms-level-7-brown-east",
      "cclp2-ms-level-10-blue-east",
      "cclp2-ms-level-32-red-south",
      "cclp1-ms-level-109-green-north",
      "cclp2-ms-level-2-block-south",
      "cclp1-ms-level-31-slide-north",
      "cclp2-ms-level-59-random-west",
      "cclp2-ms-level-59-random-east",
    ]);

    for (const scenario of scenarios) {
      const comparison = await compareInputTraceScenario(candidate, oracle, scenario);
      expect(comparison.mismatches).toEqual([]);
    }
  });
});
