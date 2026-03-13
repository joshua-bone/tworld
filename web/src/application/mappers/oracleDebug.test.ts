import { describe, expect, it } from "vitest";
import { NodeOracleDebugFixtureRepository } from "@adapters/fixtures/NodeOracleDebugFixtureRepository";
import { mapOracleDebugFixtureToGameDebugTrace } from "@application/mappers/oracleDebug";

describe("mapOracleDebugFixtureToGameDebugTrace", () => {
  it("maps a checked-in oracle debug fixture into the debug trace contract", async () => {
    const repository = new NodeOracleDebugFixtureRepository();
    const fixture = await repository.loadTrace("cclp1-ms-level-113-teleport-block-debug");
    const trace = mapOracleDebugFixtureToGameDebugTrace(fixture);

    expect(trace.request).toEqual({
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 113,
      ruleset: "MS",
      randomSeed: 1690830071,
    });
    expect(trace.debugSchemaVersion).toBe(2);
    expect(trace.initialDebugState.phase).toBe("initial");
    expect(trace.steps[0]?.phases[0]?.phase).toBe("post-input-latch");
  });
});
