import type { CharacterizationFixtureRepository } from "@application/ports/CharacterizationFixtureRepository";
import { mapSolutionListFixture } from "@application/mappers/characterization";
import { buildSolutionCatalog } from "@domain/solution";

export async function loadSolutionCatalog(
  repository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSolutionList">,
) {
  const manifest = await repository.loadManifest();
  const fixtures = await Promise.all(manifest.includedSeries.map((seriesFile) => repository.loadSolutionList(seriesFile)));
  return buildSolutionCatalog(fixtures.map(mapSolutionListFixture));
}
