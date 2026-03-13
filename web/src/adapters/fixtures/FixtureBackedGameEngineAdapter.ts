import { mapInputTraceFixtureToGameTrace } from "@application/mappers/characterization";
import { formatTraceCommandSpec } from "@application/mappers/traceScenario";
import type { CharacterizationFixtureRepository } from "@application/ports/CharacterizationFixtureRepository";
import type { GameEnginePort, GameEngineTrace } from "@application/ports/GameEngine";

export class FixtureBackedGameEngineAdapter implements GameEnginePort {
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
        `fixture trace not found for ${request.seriesFile} level ${request.levelNumber} (${request.ruleset}) ${commandSpec}`,
      );
    }

    return mapInputTraceFixtureToGameTrace(await this.repository.loadInputTrace(matchingSpec.name));
  }

  async runReplayTrace(
    _request: Parameters<GameEnginePort["runReplayTrace"]>[0],
    _replay: Parameters<GameEnginePort["runReplayTrace"]>[1],
    _maxTicks: number,
  ): Promise<GameEngineTrace> {
    throw new Error("fixture-backed gameplay adapter does not support replay traces yet");
  }
}
