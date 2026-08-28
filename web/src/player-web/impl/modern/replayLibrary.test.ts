import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry } from "@content/api/series";
import { buildCuratedCatalogView } from "@player-web/impl/modern/curatedCatalog";
import { describeReplayEntry, listReplaysForCurrentLevel, listReplaysForSeriesLevel } from "@player-web/impl/modern/replayLibrary";
import type { BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";

function createEntry(filebase: string, ruleset: "MS" | "Lynx"): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename: `./data/${filebase.replace(/\\.dac$/i, ".dat")}`,
    ruleset,
    levels: [
      {
        index: 0,
        number: 1,
        name: "Replay Test",
        author: "Test",
        password: "ABCD",
        timeLimitSeconds: 100,
        chipsRequired: 0,
        bestTimeTicks: 0,
        levelSize: 0,
        solutionSize: 0,
        levelHash: `${filebase}:1`,
        gameplayHash: `${filebase}:gameplay:1`,
        hasSolution: false,
        sgflags: 0,
        unsolvable: null,
      },
    ],
  };
}

function createReplayEntry(
  overrides: Partial<BrowserReplayEntry> & Pick<BrowserReplayEntry, "id" | "seriesFile" | "ruleset">,
): BrowserReplayEntry {
  return {
    id: overrides.id,
    fileName: overrides.fileName ?? `${overrides.id}.tws.bin`,
    seriesFile: overrides.seriesFile,
    levelNumber: overrides.levelNumber ?? 1,
    levelName: overrides.levelName ?? "Replay Test",
    ruleset: overrides.ruleset,
    savedAtMs: overrides.savedAtMs ?? 0,
    source: overrides.source ?? "saved-run",
    gameplayHash: overrides.gameplayHash,
    result: overrides.result ?? null,
    finalScore: overrides.finalScore ?? null,
    undoUsedCount: overrides.undoUsedCount ?? null,
    bytes: overrides.bytes ?? Uint8Array.from([1, 2, 3]),
  };
}

describe("replayLibrary", () => {
  it("filters replay entries to the current family, level, and ruleset", () => {
    const family = buildCuratedCatalogView(
      [createEntry("CCLP1-MS.dac", "MS"), createEntry("CCLP1-Lynx.dac", "Lynx"), createEntry("CCLP2.dac", "MS")],
      null,
    ).officialFamilies[0]!;

    expect(
      listReplaysForCurrentLevel(
        [
          createReplayEntry({ id: "a", seriesFile: "CCLP1-MS.dac", ruleset: "MS", savedAtMs: 100 }),
          createReplayEntry({ id: "b", seriesFile: "CCLP1-MS.dac", ruleset: "MS", savedAtMs: 200 }),
          createReplayEntry({ id: "c", seriesFile: "CCLP1-Lynx.dac", ruleset: "Lynx", savedAtMs: 300 }),
          createReplayEntry({ id: "d", seriesFile: "CCLP2.dac", ruleset: "MS", savedAtMs: 400 }),
        ],
        family,
        1,
        "MS",
      ).map((entry) => entry.id),
    ).toEqual(["b", "a"]);
  });

  it("filters replay entries to the exact running series, level, and ruleset", () => {
    expect(
      listReplaysForSeriesLevel(
        [
          createReplayEntry({ id: "a", seriesFile: "CCLP2.dac", ruleset: "MS", savedAtMs: 100 }),
          createReplayEntry({ id: "b", seriesFile: "CCLXP2.dac", ruleset: "Lynx", savedAtMs: 500 }),
          createReplayEntry({ id: "c", seriesFile: "CCLP2.dac", ruleset: "MS", savedAtMs: 200 }),
          createReplayEntry({ id: "d", seriesFile: "CCLP2.dac", ruleset: "MS", levelNumber: 2, savedAtMs: 300 }),
        ],
        "CCLP2.dac",
        1,
        "MS",
      ).map((entry) => entry.id),
    ).toEqual(["c", "a"]);
  });

  it("formats replay metadata for library rows", () => {
    expect(
      describeReplayEntry(
        createReplayEntry({
          id: "saved",
          seriesFile: "CCLP1-MS.dac",
          ruleset: "MS",
          result: "completed-clean",
          finalScore: 850,
          undoUsedCount: 0,
          savedAtMs: Date.UTC(2026, 2, 18, 20, 0, 0),
        }),
      ),
    ).toMatchObject({
      resultLabel: "Clean clear",
      sourceLabel: "Saved run",
      summaryLabel: "Saved run  ·  Clean clear  ·  850 pts  ·  No undo",
    });
    expect(
      describeReplayEntry(
        createReplayEntry({
          id: "saved",
          seriesFile: "CCLP1-MS.dac",
          ruleset: "MS",
          savedAtMs: Date.UTC(2026, 2, 18, 20, 0, 0),
        }),
      ).savedAtLabel,
    ).not.toHaveLength(0);
    expect(
      describeReplayEntry(
        createReplayEntry({
          id: "imported",
          seriesFile: "CCLP1-MS.dac",
          ruleset: "MS",
          source: "imported-file",
          result: null,
          finalScore: null,
          undoUsedCount: null,
        }),
      ).sourceLabel,
    ).toBe("Imported replay");
  });

  it("keeps local runs ahead of immutable references and binds references to the current native hash", () => {
    const entries = [
      createReplayEntry({
        id: "reference-current",
        seriesFile: "sandbox",
        ruleset: "Hybrid",
        source: "reference",
        gameplayHash: "hclv-current",
        savedAtMs: 9_999,
      }),
      createReplayEntry({
        id: "reference-stale",
        seriesFile: "sandbox",
        ruleset: "Hybrid",
        source: "reference",
        gameplayHash: "hclv-old",
      }),
      createReplayEntry({
        id: "local",
        seriesFile: "sandbox",
        ruleset: "Hybrid",
        source: "saved-run",
        savedAtMs: 1,
      }),
      createReplayEntry({
        id: "local-current",
        seriesFile: "sandbox",
        ruleset: "Hybrid",
        source: "saved-run",
        gameplayHash: "hclv-current",
        savedAtMs: 2,
      }),
      createReplayEntry({
        id: "local-stale",
        seriesFile: "sandbox",
        ruleset: "Hybrid",
        source: "saved-run",
        gameplayHash: "hclv-old",
        savedAtMs: 3,
      }),
    ];

    expect(listReplaysForSeriesLevel(entries, "sandbox", 1, "Hybrid", "hclv-current").map((entry) => entry.id))
      .toEqual(["local-current", "local", "reference-current"]);
    expect(listReplaysForSeriesLevel(entries, "sandbox", 1, "Hybrid").map((entry) => entry.id))
      .toEqual(["local"]);
    expect(describeReplayEntry(entries[0]!).sourceLabel).toBe("Reference replay");
    expect(describeReplayEntry(entries[0]!).savedAtLabel).toBe("Bundled with sandbox");
  });
});
