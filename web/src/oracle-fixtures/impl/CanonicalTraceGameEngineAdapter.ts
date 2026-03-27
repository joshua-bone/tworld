import { runCanonicalTrace } from "@game-core/impl/run";
import { normalizeTraceSnapshot } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { formatTraceCommandSpec } from "@replay-verifier/impl/traceScenario";
import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import type { GameEnginePort, GameEngineTrace } from "@game-runtime/ports/GameEngine";

export class CanonicalTraceGameEngineAdapter implements GameEnginePort {
  constructor(private readonly repository: CharacterizationFixtureRepository) {}

  supportsRuleset(): boolean {
    return true;
  }

  async runInputTrace(
    request: Parameters<GameEnginePort["runInputTrace"]>[0],
    commands: Parameters<GameEnginePort["runInputTrace"]>[1],
    maxTicks: number,
  ): Promise<GameEngineTrace> {
    const manifest = await this.repository.loadManifest();
    const commandSpec = formatTraceCommandSpec(commands);
    const matchingSpec = manifest.traceSpecs.find(
      (traceSpec) =>
        traceSpec.series === request.seriesFile &&
        traceSpec.ruleset === request.ruleset &&
        traceSpec.levelNumber === request.levelNumber &&
        traceSpec.maxTicks === maxTicks &&
        traceSpec.randomSeed === request.randomSeed &&
        traceSpec.inputs === commandSpec,
    );

    if (!matchingSpec) {
      throw new Error(
        `fixture trace not found for ${request.seriesFile} level ${request.levelNumber} (${request.ruleset})`,
      );
    }

    const fixture = await this.repository.loadInputTrace(matchingSpec.name);
    return runCanonicalTrace(
      {
        request,
        initialSnapshot: normalizeTraceSnapshot(fixture.initialState),
      },
      {
        scheduledInputs: commands,
        maxTicks,
        stepSnapshots: fixture.steps.map(normalizeTraceSnapshot),
      },
    ).trace;
  }

  async runReplayTrace(
    _request: Parameters<GameEnginePort["runReplayTrace"]>[0],
    _replay: Parameters<GameEnginePort["runReplayTrace"]>[1],
    _maxTicks: number,
  ): Promise<GameEngineTrace> {
    throw new Error("canonical-trace gameplay adapter does not support replay traces yet");
  }
}
