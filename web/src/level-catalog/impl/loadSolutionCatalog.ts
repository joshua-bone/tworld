import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import { mapSolutionListFixture } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { buildSolutionCatalog } from "@content/api/solution";

export async function loadSolutionCatalog(
  repository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSolutionList">,
) {
  const manifest = await repository.loadManifest();
  const fixtures = await Promise.all(manifest.includedSeries.map((seriesFile) => repository.loadSolutionList(seriesFile)));
  return buildSolutionCatalog(fixtures.map(mapSolutionListFixture));
}
