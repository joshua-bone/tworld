import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { mapSolutionListFixture } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { buildSolutionCatalog } from "@content/api/solution";

const repository = new NodeCharacterizationFixtureRepository();

describe("solution normalization", () => {
  it("keeps solution files sorted per series", async () => {
    const manifest = await repository.loadManifest();
    const fixtures = await Promise.all(manifest.includedSeries.map((seriesFile) => repository.loadSolutionList(seriesFile)));
    const catalog = buildSolutionCatalog(fixtures.map(mapSolutionListFixture));

    expect(catalog).toHaveLength(manifest.includedSeries.length);
    expect(catalog.every((entry) => entry.files.join("\n") === [...entry.files].sort().join("\n"))).toBe(true);
  });
});
