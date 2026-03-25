import { describe, expect, it } from "vitest";
import { buildLevelProgressIndex } from "@player-web/impl/levelProgress";
import {
  MOBILE_LIBRARY_SECTIONS,
  formatMobileFamilyBrowseMeta,
  listMobileLibraryFamilies,
  mobileLibrarySectionForFamily,
  mobileLevelStatusClassName,
  mobileLevelStatusDescription,
  mobileLevelStatusLabel,
  resolveMobileFamilyRuleset,
  resolveToggledMobileFamilyRuleset,
  shiftMobileLibrarySection,
} from "@player-web/impl/mobile/mobileCatalog";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import type { CuratedCatalogView, SetFamily } from "@player-web/impl/modern/curatedCatalog";
import type { BrowserResolvedLevelProgressSummary } from "@player-web/ports/BrowserProfileStore";

function createLevel(overrides: Partial<SeriesLevel> = {}): SeriesLevel {
  return {
    author: "",
    bestTimeTicks: 0,
    chipsRequired: 0,
    gameplayHash: "hash",
    hasSolution: false,
    index: 0,
    levelHash: "level-hash",
    levelSize: 32,
    name: "Level",
    number: 1,
    password: "",
    sgflags: 0,
    solutionSize: 0,
    timeLimitSeconds: 0,
    unsolvable: null,
    ...overrides,
  };
}

function createEntry(overrides: Partial<SeriesCatalogEntry> = {}): SeriesCatalogEntry {
  return {
    filebase: "family.dac",
    levels: [createLevel()],
    mapfilename: "family.dat",
    name: "Family",
    ruleset: "Lynx",
    ...overrides,
  };
}

function createFamily(overrides: Partial<SetFamily> = {}): SetFamily {
  return {
    badge: null,
    context: null,
    continueSelection: null,
    description: "desc",
    entries: [],
    id: "family",
    launchEntries: {},
    levelCount: 1,
    links: [],
    order: 1,
    rulesetLabels: {},
    section: "official",
    sidebarSummary: null,
    title: "Family",
    yearLabel: null,
    ...overrides,
  };
}

describe("mobileCatalog", () => {
  it("lists the expected top-level mobile library sections", () => {
    expect(MOBILE_LIBRARY_SECTIONS.map((section) => section.id)).toEqual(["official", "curated", "uploads"]);
  });

  it("maps curated catalog sections onto mobile library sections", () => {
    expect(mobileLibrarySectionForFamily(createFamily({ section: "official" }))).toBe("official");
    expect(mobileLibrarySectionForFamily(createFamily({ section: "intro" }))).toBe("curated");
    expect(mobileLibrarySectionForFamily(createFamily({ section: "other" }))).toBe("official");
    expect(mobileLibrarySectionForFamily(createFamily({ section: "local" }))).toBe("uploads");
    expect(mobileLibrarySectionForFamily(null)).toBe("official");
  });

  it("collects families for each mobile library section", () => {
    const official = createFamily({ id: "official", section: "official" });
    const intro = createFamily({ id: "intro", section: "intro" });
    const other = createFamily({ id: "other", section: "other" });
    const local = createFamily({ id: "local", section: "local" });
    const view: CuratedCatalogView = {
      introFamilies: [intro],
      localFamilies: [local],
      officialFamilies: [official],
      otherFamilies: [other],
    };

    expect(listMobileLibraryFamilies(view, "official")).toEqual([official]);
    expect(listMobileLibraryFamilies(view, "curated")).toEqual([intro]);
    expect(listMobileLibraryFamilies(view, "uploads")).toEqual([local]);
  });

  it("shifts mobile library sections in tab order for swipe navigation", () => {
    expect(shiftMobileLibrarySection("official", 1)).toBe("curated");
    expect(shiftMobileLibrarySection("curated", 1)).toBe("uploads");
    expect(shiftMobileLibrarySection("uploads", 1)).toBe("uploads");
    expect(shiftMobileLibrarySection("uploads", -1)).toBe("curated");
    expect(shiftMobileLibrarySection("curated", -1)).toBe("official");
    expect(shiftMobileLibrarySection("official", -1)).toBe("official");
  });

  it("resolves the preferred family ruleset and toggles between available rulesets", () => {
    const family = createFamily({
      launchEntries: {
        Lynx: createEntry({ filebase: "lynx", levels: [], mapfilename: "lynx.dat", name: "Lynx", ruleset: "Lynx" }),
        MS: createEntry({ filebase: "ms", levels: [], mapfilename: "ms.dat", name: "MS", ruleset: "MS" }),
      },
    });

    expect(resolveMobileFamilyRuleset(family, "MS")).toBe("MS");
    expect(resolveMobileFamilyRuleset(family, "Lynx")).toBe("Lynx");
    expect(resolveMobileFamilyRuleset(family, null)).toBe("Lynx");
    expect(resolveToggledMobileFamilyRuleset(family, "MS")).toBe("Lynx");
    expect(resolveToggledMobileFamilyRuleset(family, "Lynx")).toBe("MS");
  });

  it("describes mobile level progress badges", () => {
    const clean: BrowserResolvedLevelProgressSummary = {
      bestElapsedTicks: 1,
      bestResult: "completed-clean" as const,
      bestScore: 100,
      bestUndoUsedCount: 0,
      gameplayHash: "g",
      lastElapsedTicks: 1,
      lastPlayedAtMs: 1,
      lastResult: "completed-clean" as const,
      lastScore: 100,
      lastUndoUsedCount: 0,
      ruleset: "Lynx" as const,
    };
    const undo = { ...clean, bestResult: "completed-with-undo" as const };
    const attempted = { ...clean, bestResult: "failed" as const };

    expect(mobileLevelStatusLabel(clean)).toBe("✓");
    expect(mobileLevelStatusDescription(clean)).toBe("Cleared clean");
    expect(mobileLevelStatusClassName(clean)).toBe("completed");

    expect(mobileLevelStatusLabel(undo)).toBe("U");
    expect(mobileLevelStatusDescription(undo)).toBe("Cleared with undo");
    expect(mobileLevelStatusClassName(undo)).toBe("completed");

    expect(mobileLevelStatusLabel(attempted)).toBe("A");
    expect(mobileLevelStatusDescription(attempted)).toBe("Attempted");
    expect(mobileLevelStatusClassName(attempted)).toBe("attempted");

    expect(mobileLevelStatusLabel(null)).toBe("");
    expect(mobileLevelStatusDescription(null)).toBe("Unplayed");
    expect(mobileLevelStatusClassName(null)).toBe("unplayed");
  });

  it("formats family browse metadata like the desktop cleared summary", () => {
    const family = createFamily({
      launchEntries: {
        Lynx: createEntry({
          filebase: "CCLP1-Lynx.dac",
          levels: [createLevel({ gameplayHash: "hash-1", name: "Lesson" })],
          mapfilename: "CCLP1-Lynx.dat",
          name: "CCLP1 Lynx",
          ruleset: "Lynx",
        }),
        MS: createEntry({
          filebase: "CCLP1-MS.dac",
          levels: [createLevel({ gameplayHash: "hash-1", name: "Lesson" })],
          mapfilename: "CCLP1-MS.dat",
          name: "CCLP1 MS",
          ruleset: "MS",
        }),
      },
      levelCount: 1,
      sidebarSummary: "Easy difficulty",
    });
    const progressByKey = buildLevelProgressIndex([
      {
        bestElapsedTicks: 20,
        bestResult: "completed-clean",
        bestUndoUsedCount: 0,
        gameplayHash: "hash-1",
        lastElapsedTicks: 20,
        lastPlayedAtMs: 1,
        lastResult: "completed-clean",
        lastUndoUsedCount: 0,
        ruleset: "Lynx",
      },
    ]);

    expect(formatMobileFamilyBrowseMeta(family, progressByKey)).toBe(
      "Cleared: 1/1 (Lynx) 0/1 (MS)",
    );
  });
});
