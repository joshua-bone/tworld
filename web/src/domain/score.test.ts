import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { mapLevelInfoEntriesToScoreLevels } from "@application/mappers/characterization";
import { createScoreTable, createTimesTable } from "@domain/score";

const repository = new NodeCharacterizationFixtureRepository();

describe("score parity", () => {
  it("matches checked-in score fixtures for every bundled series", async () => {
    const manifest = await repository.loadManifest();

    for (const seriesFile of manifest.includedSeries) {
      const levelInfo = await repository.loadLevelInfo(seriesFile);
      const expected = await repository.loadScoreTable(seriesFile);
      const actual = createScoreTable(mapLevelInfoEntriesToScoreLevels(levelInfo.levels), true, "0");

      expect(actual).toEqual({
        rowLevelIndexes: expected.rowLevelIndexes,
        table: expected.table,
      });
    }
  });

  it("matches checked-in time fixtures for every bundled series", async () => {
    const manifest = await repository.loadManifest();

    for (const seriesFile of manifest.includedSeries) {
      const levelInfo = await repository.loadLevelInfo(seriesFile);
      const expected = await repository.loadTimesTable(seriesFile);
      const actual = createTimesTable(mapLevelInfoEntriesToScoreLevels(levelInfo.levels), expected.showPartial, "0");

      expect(actual).toEqual({
        rowLevelIndexes: expected.rowLevelIndexes,
        table: expected.table,
      });
    }
  });
});
