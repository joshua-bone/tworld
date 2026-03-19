import type { RulesetName } from "@content/api/ruleset";

export interface SeriesCatalogEntry {
  name: string;
  filebase: string;
  ruleset: RulesetName;
  mapfilename: string;
  levels: SeriesLevel[];
}

export interface SeriesDefinition {
  name: string;
  filebase: string;
  mapfilename: string;
  ruleset: RulesetName;
  levelCount: number;
}

export interface SeriesLevel {
  index: number;
  number: number;
  name: string;
  author: string;
  password: string;
  timeLimitSeconds: number;
  chipsRequired: number;
  bestTimeTicks: number;
  levelSize: number;
  solutionSize: number;
  levelHash: string;
  gameplayHash: string;
  hasSolution: boolean;
  sgflags: number;
  unsolvable: string | null;
}

export function buildSeriesCatalog(seriesList: SeriesDefinition[], levelInfoBySeries: Record<string, SeriesLevel[]>): SeriesCatalogEntry[] {
  return seriesList.map((series) => ({
    name: series.name,
    filebase: series.filebase,
    ruleset: series.ruleset,
    mapfilename: series.mapfilename,
    levels: levelInfoBySeries[series.filebase] ?? [],
  }));
}
