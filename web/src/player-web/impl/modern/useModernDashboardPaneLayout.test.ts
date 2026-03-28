import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import {
  buildDashboardStyle,
  estimateLevelsPaneWidth,
  estimateSetsPaneWidth,
} from "@player-web/impl/modern/useModernDashboardPaneLayout";

function createEntry(levelNames: readonly string[]): SeriesCatalogEntry {
  return {
    name: "Test",
    filebase: "Test-Lynx.dac",
    mapfilename: "./data/Test.dat",
    ruleset: "Lynx",
    levels: levelNames.map((name, index) => ({
      index,
      number: index + 1,
      name,
      author: "Test",
      password: "ABCD",
      timeLimitSeconds: 100,
      chipsRequired: 0,
      bestTimeTicks: 0,
      levelSize: 0,
      solutionSize: 0,
      levelHash: `${name}:level`,
      gameplayHash: `${name}:gameplay`,
      hasSolution: false,
      sgflags: 0,
      unsolvable: null,
    })),
  };
}

function createFamily(title: string, sidebarSummary: string | null = null): SetFamily {
  const entry = createEntry(["One", "Two"]);
  return {
    id: title.toLowerCase(),
    section: "official",
    title,
    badge: null,
    sidebarSummary,
    yearLabel: "2026",
    description: title,
    context: null,
    links: [],
    levelCount: entry.levels.length,
    entries: [entry],
    launchEntries: {
      Lynx: entry,
    },
    rulesetLabels: {},
    continueSelection: null,
    order: 1,
  };
}

describe("useModernDashboardPaneLayout", () => {
  it("estimates the sets pane width from family titles and summaries", () => {
    const width = estimateSetsPaneWidth(
      createFamily("A Very Long Official Pack Name", "With a lengthy sidebar summary"),
      [
        createFamily("Short"),
        createFamily("A Very Long Official Pack Name", "With a lengthy sidebar summary"),
      ],
    );

    expect(width).toBeGreaterThan(268);
    expect(width).toBeLessThanOrEqual(400);
  });

  it("estimates the levels pane width from the longest level name", () => {
    expect(estimateLevelsPaneWidth(null)).toBe(276);
    expect(
      estimateLevelsPaneWidth(
        createEntry([
          "Short",
          "An Extremely Long Level Name That Should Widen The Sidebar",
        ]),
      ),
    ).toBeGreaterThan(276);
  });

  it("builds collapsed pane widths into dashboard css variables", () => {
    expect(buildDashboardStyle(true, 320, false, 280)).toEqual({
      "--modern-dashboard-sets-min-width": "44px",
      "--modern-dashboard-sets-width": "44px",
      "--modern-dashboard-levels-min-width": "210px",
      "--modern-dashboard-levels-width": "280px",
    });
  });
});
