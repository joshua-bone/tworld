import { describe, expect, it } from "vitest";
import { loadBrowserSeriesCatalogEntriesFromLoaders } from "@level-catalog/impl/browserSeriesCatalogEntries.shared";

describe("loadBrowserSeriesCatalogEntriesFromLoaders", () => {
  it("skips optional series load failures when requested", async () => {
    await expect(
      loadBrowserSeriesCatalogEntriesFromLoaders(
        {
          "/virtual/sets/Broken.dac": async () => {
            throw new Error("Failed to fetch dynamically imported module");
          },
        },
        {},
        {
          ignoreSeriesLoadErrors: true,
          seriesFiles: ["Broken.dac"],
        },
      ),
    ).resolves.toEqual([]);
  });

  it("still surfaces series load failures by default", async () => {
    await expect(
      loadBrowserSeriesCatalogEntriesFromLoaders(
        {
          "/virtual/sets/Broken.dac": async () => {
            throw new Error("Failed to fetch dynamically imported module");
          },
        },
        {},
        {
          seriesFiles: ["Broken.dac"],
        },
      ),
    ).rejects.toThrow(
      "Built-in game data for Broken.dac could not be loaded. The site was probably updated while this tab was open. Reload the page and try again.",
    );
  });
});
