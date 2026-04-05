import { describe, expect, it } from "vitest";
import { loadNodeSeriesCatalogEntries } from "@level-catalog/impl/loadNodeSeriesCatalogEntries";
import { interactivePerfScenarios } from "./interactivePerfScenarios";

describe("interactivePerfScenarios", () => {
  it("resolve to real catalog entries and level numbers", async () => {
    const catalog = await loadNodeSeriesCatalogEntries(
      [...new Set(interactivePerfScenarios.map((scenario) => scenario.request.seriesFile))],
    );
    const byFilebase = new Map(catalog.map((entry) => [entry.filebase, entry] as const));

    for (const scenario of interactivePerfScenarios) {
      const series = byFilebase.get(scenario.request.seriesFile);
      expect(series, scenario.id).toBeDefined();
      expect(series?.levels.some((level) => level.number === scenario.request.levelNumber), scenario.id).toBe(true);
    }
  });
});
