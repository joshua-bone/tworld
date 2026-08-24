import { describe, expect, it } from "vitest";
import type { HybridCcDatCatalogEntry } from "./datCatalog";
import type { HybridCcNativeLevel } from "./nativeLevel";
import {
  buildHybridCcFamilies,
  buildHybridCcSeriesByEntryId,
  HYBRID_CC_V0_RULESET_LABEL,
  hybridCcV0FamilyProgressLabel,
  shouldAdvanceHybridCcV0Runtime,
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
        rulesetLabels: { Lynx: "Hybrid v0" },
      },
      {
        title: "Mine",
        section: "local",
        levelCount: 1,
        rulesetLabels: { Lynx: "Hybrid v0" },
      },
    ]);
    expect(families[0]!.launchEntries.Lynx).toBe(series.get(entries[0]!.id));
    expect(families[0]!.launchEntries.MS).toBeUndefined();
  });

  it("holds the engine at Ready until directional play starts", () => {
    expect(shouldAdvanceHybridCcV0Runtime(false, false, 0)).toBe(false);
    expect(shouldAdvanceHybridCcV0Runtime(true, false, 0)).toBe(true);
    expect(shouldAdvanceHybridCcV0Runtime(true, true, 0)).toBe(false);
    expect(shouldAdvanceHybridCcV0Runtime(true, false, 1)).toBe(false);
  });
});
