import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { mapInputTraceFixtureToGameTrace } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { runCanonicalTrace } from "@game-core/impl/run";

const repository = new NodeCharacterizationFixtureRepository();

describe("canonical trace runner", () => {
  it("rebuilds initialization traces from the pure engine state", async () => {
    const trace = mapInputTraceFixtureToGameTrace(await repository.loadInputTrace("intro-ms-level-1-init"));
    const result = runCanonicalTrace(
      {
        request: trace.request,
        initialSnapshot: trace.initialState,
      },
      {
        scheduledInputs: trace.scheduledInputs,
        maxTicks: 0,
        stepSnapshots: trace.steps,
      },
    );

    expect(result.trace).toEqual(trace);
    expect(result.recordedMoves).toEqual([]);
  });

  it("rebuilds transition traces through the explicit TS tick loop", async () => {
    const trace = mapInputTraceFixtureToGameTrace(await repository.loadInputTrace("intro-ms-level-1-east-chips"));
    const result = runCanonicalTrace(
      {
        request: trace.request,
        initialSnapshot: trace.initialState,
      },
      {
        scheduledInputs: trace.scheduledInputs,
        maxTicks: trace.steps.length,
        stepSnapshots: trace.steps,
      },
    );

    expect(result.trace).toEqual(trace);
    expect(result.recordedMoves).toEqual([
      { when: 0, dir: 8 },
      { when: 4, dir: 8 },
      { when: 8, dir: 8 },
      { when: 12, dir: 8 },
    ]);
  });
});
