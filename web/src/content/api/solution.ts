export interface SolutionCatalogEntry {
  series: string;
  files: string[];
}

export interface SolutionCatalogSource {
  series: string;
  files: string[];
}

export function buildSolutionCatalog(fixtures: SolutionCatalogSource[]): SolutionCatalogEntry[] {
  return fixtures.map((fixture) => ({
    series: fixture.series,
    files: [...fixture.files].sort((left, right) => left.localeCompare(right)),
  }));
}
