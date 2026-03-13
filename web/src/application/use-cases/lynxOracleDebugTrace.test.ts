import { describe, expect, it } from "vitest";
import { NodeTraceScenarioRepository } from "@adapters/scenarios/NodeTraceScenarioRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@adapters/oracle/NativeOracleGameEngineAdapter";

const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;

runSuite("native Lynx oracle debug trace", () => {
  it(
    "exposes post-turn map mutation phases for intro-lynx-level-8-buttons-east",
    async () => {
      const scenarioRepository = new NodeTraceScenarioRepository();
      const scenario = (await scenarioRepository.loadInputTraceScenarios()).find(
        (entry) => entry.name === "intro-lynx-level-8-buttons-east",
      );
      const oracle = new NativeOracleGameEngineAdapter({
        oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
      });

      expect(scenario?.name).toBe("intro-lynx-level-8-buttons-east");

      const trace = await oracle.runInputTraceDebug(scenario!.request, scenario!.commands, scenario!.maxTicks);
      const phases = trace.steps[0]?.phases.map((entry) => entry.phase) ?? [];
      const firstStepHashes = trace.steps[0]?.phases.map((entry) => entry.mapHash) ?? [];
      const hasVisibleMutation = trace.steps.some((step) => {
        const hashes = step.phases.map((phase) => phase.mapHash);
        return hashes.some((hash) => hash !== hashes[0]);
      });

      expect(phases).toEqual([
        "post-input-latch",
        "post-initial-housekeeping",
        "post-creature-intent",
        "post-creature-movement",
        "post-teleport-resolution",
        "post-putwall-resolution",
        "final",
      ]);
      expect(firstStepHashes[0]).not.toBe(firstStepHashes[3]);
      expect(hasVisibleMutation).toBe(true);
    },
    30_000,
  );
});
