import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";

export interface ReplayActionSelection {
  seriesFile: string | null;
  levelNumber: number | null;
}

export interface ReplayActionRequest {
  seriesFile: string;
  levelNumber: number;
}

export interface ReplayActionContext {
  series: SeriesCatalogEntry | null;
  level: SeriesLevel | null;
}

function findSeries(catalog: readonly SeriesCatalogEntry[], seriesFile: string | null): SeriesCatalogEntry | null {
  if (!seriesFile) {
    return null;
  }

  return catalog.find((series) => series.filebase === seriesFile) ?? null;
}

export function resolveReplayActionContext(
  catalog: readonly SeriesCatalogEntry[],
  selection: ReplayActionSelection,
  request: ReplayActionRequest | null,
): ReplayActionContext {
  const activeSeries = request ? findSeries(catalog, request.seriesFile) : null;
  if (activeSeries) {
    return {
      series: activeSeries,
      level: activeSeries.levels.find((level) => level.number === request?.levelNumber) ?? null,
    };
  }

  const selectedSeries = findSeries(catalog, selection.seriesFile);
  return {
    series: selectedSeries,
    level: selectedSeries?.levels.find((level) => level.number === selection.levelNumber) ?? null,
  };
}
