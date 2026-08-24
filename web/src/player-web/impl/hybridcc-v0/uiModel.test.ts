import { describe, expect, it } from "vitest";
import type { HybridCcDatCatalogEntry } from "./datCatalog";
import type { HybridCcNativeLevel } from "./nativeLevel";
import {
  buildHybridCcFamilies,
  buildHybridCcSeriesByEntryId,
  HYBRID_CC_V0_RULESET_LABEL,
  hybridCcV0FamilyProgressLabel,
  hybridCcV0PresentationTick,
  hybridCcV0StatusLabel,
  hybridCcV0SubtickIntervalMs,
  hybridCcV0TerminalAction,
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

  it("keeps four input samples per logic step while Shift doubles the game clock", () => {
    expect(hybridCcV0SubtickIntervalMs(false)).toBe(25);
    expect(hybridCcV0SubtickIntervalMs(true)).toBe(12.5);
  });

  it("samples presentation at 20 Hz independently of the 10 Hz simulation", () => {
    expect(hybridCcV0PresentationTick(7, 0)).toBe(14);
    expect(hybridCcV0PresentationTick(7, 1)).toBeNull();
    expect(hybridCcV0PresentationTick(7, 2)).toBe(15);
    expect(hybridCcV0PresentationTick(7, 3)).toBeNull();
  });

  it("matches the shared lifecycle labels and terminal actions", () => {
    expect(hybridCcV0StatusLabel(false, false, 0)).toBe("Ready");
    expect(hybridCcV0StatusLabel(true, false, 0)).toBe("Playing");
    expect(hybridCcV0StatusLabel(true, true, 0)).toBe("Paused");
    expect(hybridCcV0StatusLabel(true, false, 1)).toBe("Completed");
    expect(hybridCcV0StatusLabel(true, false, 2)).toBe("Failed");
    expect(hybridCcV0TerminalAction(0)).toBeNull();
    expect(hybridCcV0TerminalAction(1)).toBe("next");
    expect(hybridCcV0TerminalAction(2)).toBe("retry");
  });
});
