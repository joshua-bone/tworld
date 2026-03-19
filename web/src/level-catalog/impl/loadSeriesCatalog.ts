import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import {
  mapLevelInfoFixtureToSeriesLevels,
  mapSeriesListFixtureToDefinitions,
} from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { buildSeriesCatalog, type SeriesCatalogEntry } from "@content/api/series";

export async function loadSeriesCatalog(
  repository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSeriesList" | "loadLevelInfo">,
  supplements: SeriesCatalogEntry[] = [],
): Promise<SeriesCatalogEntry[]> {
  const manifest = await repository.loadManifest();
  const seriesList = await repository.loadSeriesList();
  const fixtures = Object.fromEntries(
    await Promise.all(
      manifest.includedSeries.map(async (seriesFile) => [seriesFile, await repository.loadLevelInfo(seriesFile)] as const),
    ),
  );

  const catalog = buildSeriesCatalog(
    mapSeriesListFixtureToDefinitions(seriesList),
    Object.fromEntries(
      Object.entries(fixtures).map(([seriesFile, fixture]) => [seriesFile, mapLevelInfoFixtureToSeriesLevels(fixture)] as const),
    ),
  );

  const byFilebase = new Map(catalog.map((entry) => [entry.filebase, entry] as const));
  for (const supplement of supplements) {
    byFilebase.set(supplement.filebase, supplement);
  }

  return [...byFilebase.values()];
}
