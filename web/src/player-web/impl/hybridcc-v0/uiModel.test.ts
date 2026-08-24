import { describe, expect, it } from "vitest";
import type { HybridCcDatCatalogEntry } from "./datCatalog";
import type { HybridCcNativeLevel } from "./nativeLevel";
import { formatFamilyClearedMeta } from "@player-web/impl/modern/modernDashboardPanels";
import {
  buildHybridCcFamilies,
  buildHybridCcSeriesByEntryId,
  HYBRID_CC_V0_RULESET_LABEL,
  hybridCcV0InitialCatalogMessage,
  hybridCcV0FamilyProgressLabel,
  hybridCcV0SubtickIntervalMs,
} from "./uiModel";

function entry(
  id: string,
  filename: string,
  source: HybridCcDatCatalogEntry["source"],
): HybridCcDatCatalogEntry {
  return {
    id,
    filename,
    name: filename.replace(/\.dat$/iu, ""),
    source,
    async loadBytes() {
      return new Uint8Array();
    },
  };
}

function level(number: number): HybridCcNativeLevel {
  return {
    width: 1,
    height: 1,
    depth: 1,
    number,
    requiredChips: 0,
    timeLimitSeconds: 0,
    title: `Level ${number}`,
    author: "",
    hint: "",
    password: "",
    actorOrder: [],
    cells: [],
    encoded: new Uint8Array(),
  };
}

describe("HybridCC v0 modern dashboard model", () => {
  it("presents DAT packs through the shared Lynx dashboard contract", () => {
    const entries = [
      entry("official:CCLP1.dat", "CCLP1.dat", "official"),
      entry("imported:Mine.dat", "Mine.dat", "imported"),
    ];
    const series = buildHybridCcSeriesByEntryId(entries, new Map([
      [entries[0]!.id, [level(1), level(2)]],
      [entries[1]!.id, [level(1)]],
    ]));

    const families = buildHybridCcFamilies(entries, series);

    expect(HYBRID_CC_V0_RULESET_LABEL).toBe("Hybrid v0");
    expect(hybridCcV0FamilyProgressLabel(149)).toBe("Cleared: 0/149 (Hybrid v0)");
    expect(families).toMatchObject([
      {
        title: "CCLP1",
        section: "official",
        levelCount: 2,
        rulesetLabels: { Hybrid: "Hybrid v0" },
      },
      {
        title: "Mine",
        section: "local",
        levelCount: 1,
        rulesetLabels: { Hybrid: "Hybrid v0" },
      },
    ]);
    expect(families[0]!.launchEntries.Hybrid).toBe(series.get(entries[0]!.id));
    expect(families[0]!.launchEntries.MS).toBeUndefined();
    expect(formatFamilyClearedMeta(families[0]!, new Map())).toBe(
      "Cleared: 0/2 (Hybrid v0)",
    );
  });

  it("keeps four input samples per logic step while Shift doubles the game clock", () => {
    expect(hybridCcV0SubtickIntervalMs(false)).toBe(25);
    expect(hybridCcV0SubtickIntervalMs(true)).toBe(12.5);
  });

  it("isolates an unavailable saved DAT from a playable catalog", () => {
    const playable = entry("official:CCLP1.dat", "CCLP1.dat", "official");
    const unavailable = entry("imported:Future.dat", "Future.dat", "imported");
    const entries = [playable, unavailable];
    const series = buildHybridCcSeriesByEntryId(entries, new Map([
      [playable.id, [level(1)]],
    ]));
    const loadErrors = new Map([
      [unavailable.id, "DAT contains a tile outside the Hybrid v0 vocabulary."],
    ]);

    const families = buildHybridCcFamilies(entries, series, loadErrors);

    expect(hybridCcV0InitialCatalogMessage(series.size, loadErrors)).toBeNull();
    expect(families.find((family) => family.id === unavailable.id)).toMatchObject({
      entries: [],
      launchEntries: {},
      levelCount: 0,
      sidebarSummary: "Unavailable in Hybrid v0.",
    });
  });

  it("reports a conversion failure when no DAT in the catalog is playable", () => {
    const loadErrors = new Map([
      ["imported:Future.dat", "HybridCC DAT conversion failed with HybridCC status 18."],
    ]);

    expect(hybridCcV0InitialCatalogMessage(0, loadErrors)).toBe(
      "HybridCC DAT conversion failed with HybridCC status 18.",
    );
    expect(hybridCcV0InitialCatalogMessage(0, new Map())).toBe(
      "No playable DAT sets are available.",
    );
  });

});
