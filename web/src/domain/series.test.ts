import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { buildSeriesCatalog } from "@domain/series";
import { parseDatFile, parseSeriesConfig } from "@domain/series-file";

const repository = new NodeCharacterizationFixtureRepository();
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");

describe("series parsing", () => {
  it("parses bundled series files into the same metadata the oracle emits", async () => {
    const manifest = await repository.loadManifest();
    const seriesList = await repository.loadSeriesList();

    const parsedCatalog = await Promise.all(
      manifest.includedSeries.map(async (seriesFile) => {
        const configText = await readFile(resolve(repoRoot, "sets", seriesFile), "utf-8");
        const config = parseSeriesConfig(configText);
        const datBytes = new Uint8Array(await readFile(resolve(repoRoot, "data", config.mapFile)));
        const parsed = parseDatFile(datBytes, { ruleset: config.ruleset });

        return {
          name: seriesFile,
          filebase: seriesFile,
          mapfilename: `./data/${config.mapFile}`,
          ruleset: parsed.ruleset,
          levelCount: parsed.levelCount,
          levels: parsed.levels,
        };
      }),
    );

    const catalog = buildSeriesCatalog(
      parsedCatalog.map(({ levels, ...series }) => series),
      Object.fromEntries(parsedCatalog.map((series) => [series.filebase, series.levels] as const)),
    );

    expect(catalog).toHaveLength(manifest.includedSeries.length);

    for (const series of parsedCatalog) {
      const expectedSeries = seriesList.series.find((entry) => entry.filebase === series.filebase);
      const expectedLevels = await repository.loadLevelInfo(series.filebase);
      expect(expectedSeries).toEqual({
        name: series.name,
        filebase: series.filebase,
        mapfilename: series.mapfilename,
        ruleset: series.ruleset,
        levelCount: series.levelCount,
      });
      expect(series.levels).toEqual(expectedLevels.levels);
    }

    expect(catalog.find((entry) => entry.filebase === "intro-ms.dac")?.levels).toHaveLength(9);
  });
});
