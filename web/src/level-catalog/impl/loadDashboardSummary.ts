import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";

export interface DashboardSummary {
  schemaVersion: number;
  commandCount: number;
  seriesCount: number;
  traceCount: number;
  replayTraceCount: number;
  commands: string[];
  includedSeries: string[];
  excludedSeries: string[];
  traceNames: string[];
  replayTraceNames: string[];
}

export async function loadDashboardSummary(
  repository: Pick<CharacterizationFixtureRepository, "loadManifest">,
): Promise<DashboardSummary> {
  const manifest = await repository.loadManifest();
  return {
    schemaVersion: manifest.schemaVersion,
    commandCount: manifest.commands.length,
    seriesCount: manifest.includedSeries.length,
    traceCount: manifest.traceSpecs.length,
    replayTraceCount: manifest.replayTraceSpecs.length,
    commands: manifest.commands,
    includedSeries: manifest.includedSeries,
    excludedSeries: manifest.excludedSeries,
    traceNames: manifest.traceSpecs.map((traceSpec) => traceSpec.name),
    replayTraceNames: manifest.replayTraceSpecs.map((traceSpec) => traceSpec.name),
  };
}
