import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";

export async function loadPlayableSeriesCatalog(
  repository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSeriesList" | "loadLevelInfo">,
) {
  const catalog = await loadSeriesCatalog(repository);
  return catalog.filter((series) => series.ruleset === "MS");
}
