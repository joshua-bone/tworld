import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { HybridCcV1DatCatalogEntry } from "./datCatalog";
import type { HybridCcV1UnavailableDatEntry } from "./datCatalog";
import {
  buildHybridCcV1Families,
  firstPlayableHybridCcV1Entry,
  HYBRID_CC_V1_RULESET_LABEL,
  hybridCcV1InitialCatalogMessage,
  hybridCcV1SeriesFile,
} from "./uiModel";
import { HYBRID_CC_V1_LIBRARY_CATEGORIES } from "./HybridCcV1App";

const officialEntry: HybridCcV1DatCatalogEntry = {
  id: "official:CCLP1.dat",
  filename: "CCLP1.dat",
  name: "Chip's Challenge Level Pack 1",
  source: "official",
  async loadBytes() { return new Uint8Array(); },
};

const series: SeriesCatalogEntry = {
  name: officialEntry.name,
  filebase: "hybrid-v1:official:CCLP1.dat",
  mapfilename: officialEntry.filename,
  ruleset: "Hybrid",
  levels: [],
};

describe("HybridCC v1 catalog UI model", () => {
  it("names the ruleset and namespaces its series independently from v0", () => {
    expect(HYBRID_CC_V1_RULESET_LABEL).toBe("Hybrid v1");
    expect(hybridCcV1SeriesFile(officialEntry)).toBe("hybrid-v1:official:CCLP1.dat");
  });

  it("presents the built-in pack under an exact Sandbox selector heading", () => {
    const sandboxEntry: HybridCcV1DatCatalogEntry = {
      id: "sandbox:legacy_dat_sandbox",
      filename: "legacy_dat_sandbox.dat",
      name: "Legacy DAT Sandbox",
      source: "sandbox",
      async loadBytes() { return new Uint8Array(); },
    };
    const sandboxSeries = { ...series, name: sandboxEntry.name, filebase: hybridCcV1SeriesFile(sandboxEntry) };
    const [family] = buildHybridCcV1Families(
      [sandboxEntry],
      new Map([[sandboxEntry.id, sandboxSeries]]),
    );

    expect(HYBRID_CC_V1_LIBRARY_CATEGORIES).toContainEqual({ id: "sandbox", label: "Sandbox" });
    expect(family).toMatchObject({
      section: "other",
      title: "Legacy DAT Sandbox",
      badge: "Sandbox",
      launchEntries: { Hybrid: sandboxSeries },
    });
  });

  it("makes a converted DAT launchable only as Hybrid v1", () => {
    const [family] = buildHybridCcV1Families(
      [officialEntry],
      new Map([[officialEntry.id, series]]),
    );

    expect(family?.launchEntries).toEqual({ Hybrid: series });
    expect(family?.rulesetLabels).toEqual({ Hybrid: "Hybrid v1" });
    expect(family?.context).toContain("native map format");
  });

  it("keeps a rejected DAT visible with its entry-specific diagnostic", () => {
    const [family] = buildHybridCcV1Families(
      [officialEntry],
      new Map(),
      new Map([[officialEntry.id, "entry 7 uses unsupported DAT tile 0x71"]]),
    );

    expect(family).toMatchObject({
      id: officialEntry.id,
      sidebarSummary: "Unavailable in Hybrid v1.",
      context: "entry 7 uses unsupported DAT tile 0x71",
      entries: [],
      launchEntries: {},
    });
  });

  it("shows an unavailable diagnostic only when no DAT has a playable level", () => {
    const errors = new Map([
      [officialEntry.id, "CCLP1 conversion failed"],
    ]);

    expect(hybridCcV1InitialCatalogMessage(0, errors)).toBe("CCLP1 conversion failed");
    expect(hybridCcV1InitialCatalogMessage(1, errors)).toBeNull();
  });

  it("keeps a partially converted uploaded pack playable and exposes every failed level", () => {
    const partialEntry: HybridCcV1DatCatalogEntry = {
      ...officialEntry,
      id: "imported:partial.dat",
      filename: "partial.dat",
      name: "partial",
      source: "imported",
    };
    const partialSeries: SeriesCatalogEntry = {
      ...series,
      filebase: "hybrid-v1:imported:partial.dat",
      mapfilename: "partial.dat",
      levels: Array.from({ length: 147 }, (_, index) => ({ number: index + 1 })) as SeriesCatalogEntry["levels"],
    };
    const issues: readonly HybridCcV1UnavailableDatEntry[] = [
      {
        entryOrdinal: 78,
        levelNumber: 78,
        status: 4,
        diagnostic: "dat.unsupported_composition.multiple_pickup: More than one pickup.",
      },
      {
        entryOrdinal: 131,
        levelNumber: 131,
        status: 4,
        diagnostic: "dat.unsupported_composition.multiple_device: More than one device.",
      },
    ];
    const issuesByEntryId = new Map([[partialEntry.id, issues]]);

    const [family] = buildHybridCcV1Families(
      [partialEntry],
      new Map([[partialEntry.id, partialSeries]]),
      new Map(),
      issuesByEntryId,
    );

    expect(family?.launchEntries).toEqual({ Hybrid: partialSeries });
    expect(family?.levelCount).toBe(147);
    expect(family?.sidebarSummary).toBe("147 playable · 2 unavailable in Hybrid v1.");
    expect(family?.context).toContain("Level 78 — dat.unsupported_composition.multiple_pickup");
    expect(family?.context).toContain("Level 131 — dat.unsupported_composition.multiple_device");
    const initialMessage = hybridCcV1InitialCatalogMessage(1, new Map(), issuesByEntryId);
    expect(initialMessage).toContain("partial.dat");
    expect(initialMessage).toContain("Level 78 — dat.unsupported_composition.multiple_pickup");
    expect(initialMessage).toContain("Level 131 — dat.unsupported_composition.multiple_device");
  });

  it("neither advertises nor initially selects an excluded official CCLP2 entry", () => {
    const cclp2Entry: HybridCcV1DatCatalogEntry = {
      ...officialEntry,
      id: "official:CCLP2.dat",
      filename: "CCLP2.dat",
      name: "Chip's Challenge Level Pack 2",
    };
    const cclp2Series: SeriesCatalogEntry = {
      ...series,
      name: cclp2Entry.name,
      filebase: hybridCcV1SeriesFile(cclp2Entry),
      mapfilename: cclp2Entry.filename,
    };
    const seriesByEntryId = new Map([
      [cclp2Entry.id, cclp2Series],
      [officialEntry.id, series],
    ]);

    expect(buildHybridCcV1Families([cclp2Entry, officialEntry], seriesByEntryId).map(({ id }) => id))
      .toEqual([officialEntry.id]);
    expect(firstPlayableHybridCcV1Entry([cclp2Entry, officialEntry], seriesByEntryId))
      .toBe(officialEntry);
  });
});
