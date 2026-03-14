import { describe, expect, it } from "vitest";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { compareInputTraceScenario } from "@replay-verifier/impl/compareInputTraceScenario";

const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;

runSuite("TS MS engine timeout differential", () => {
  it(
    "matches the live native oracle for an idle timeout run",
    async () => {
      const candidate = new MsGameEngineAdapter(new NodeLevelRepository());
      const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });

      const comparison = await compareInputTraceScenario(candidate, oracle, {
        name: "intro-ms-level-1-idle-timeout",
        commandSpec: "",
        request: {
          seriesFile: "intro-ms.dac",
          levelNumber: 1,
          ruleset: "MS",
          randomSeed: 123456789,
        },
        commands: [],
        maxTicks: 4010,
      });

      expect(comparison.mismatches).toEqual([]);
      expect(comparison.actual.result).toEqual({
        status: "failed",
        finalTick: 4000,
        stepCount: 4001,
      });
      expect(comparison.actual.steps.at(-1)?.soundEffects).toBe(1 << 2);
    },
    30_000,
  );
});
