import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { mapInputTraceFixtureToGameTrace } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { initializeEngineState } from "@game-core/impl/initialize";
import { replaySolutionCodec } from "@game-core/api/codec";
import { stepEngineState } from "@game-core/impl/step";

const repository = new NodeCharacterizationFixtureRepository();

describe("game domain skeleton", () => {
  it("builds a pure engine state from an initialization trace", async () => {
    const trace = mapInputTraceFixtureToGameTrace(await repository.loadInputTrace("intro-ms-level-1-init"));
    const state = initializeEngineState({
      request: trace.request,
      initialSnapshot: trace.initialState,
    });

    expect(state.request).toEqual(trace.request);
    expect(state.timer.tick).toBe(-1);
    expect(state.inventory.chipsNeeded).toBe(6);
    expect(state.replay.randomState.main.initial).toBe("123456789");
    expect(state.actors).toHaveLength(1);
  });

  it("applies a pure step boundary from a canonical trace snapshot", async () => {
    const trace = mapInputTraceFixtureToGameTrace(await repository.loadInputTrace("intro-ms-level-1-east-chips"));
    const initial = initializeEngineState({
      request: trace.request,
      initialSnapshot: trace.initialState,
    });
    const transition = stepEngineState({
      current: initial,
      input: trace.scheduledInputs[0]!,
      nextSnapshot: trace.steps[0]!,
    });

    expect(transition.input.inputName).toBe("east");
    expect(transition.state.timer.tick).toBe(0);
    expect(transition.state.chip?.position.pos).toBe(trace.steps[0]!.chip?.position.pos);
    expect(transition.state.map.hash).toBe(trace.steps[0]!.mapHash);
  });

  it("exposes a pure replay solution codec facade", async () => {
    const fixture = await repository.loadSolutionRoundTrip("ms-long-orthogonal");
    const encoded = replaySolutionCodec.encode(fixture.levelNumber, fixture.password, fixture.bestTimeTicks, fixture.source);
    const decoded = replaySolutionCodec.decode(encoded);

    expect(Array.from(encoded, (value) => value.toString(16).padStart(2, "0")).join("")).toBe(fixture.encoded.hex);
    expect(decoded).toEqual(fixture.memoryRoundTrip);
  });
});
