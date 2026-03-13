import { loadSeriesCatalog } from "@application/use-cases/loadSeriesCatalog";
import type { CharacterizationFixtureRepository } from "@application/ports/CharacterizationFixtureRepository";

export async function loadPlayableSeriesCatalog(
  repository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSeriesList" | "loadLevelInfo">,
) {
  const catalog = await loadSeriesCatalog(repository);
  return catalog.filter((series) => series.ruleset === "MS");
}
