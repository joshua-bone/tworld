import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import {
  buildCuratedCatalogView,
  findSetFamilyForSelection,
  listSearchableSetFamilies,
  listSetFamilyRulesets,
  resolveSearchMatchedLevelNumber,
  resolveSetFamilySelection,
  searchSetFamilies,
} from "@player-web/impl/modern/curatedCatalog";

function createLevels(levelCount: number, prefix: string): SeriesLevel[] {
  return Array.from({ length: levelCount }, (_, index) => ({
    index,
    number: index + 1,
    name: `${prefix} ${index + 1}`,
    author: "Test",
    password: "ABCD",
    timeLimitSeconds: 0,
    chipsRequired: 0,
    bestTimeTicks: 0,
    levelSize: 0,
    solutionSize: 0,
    levelHash: `${prefix}:${index + 1}`,
    gameplayHash: `${prefix}:gameplay:${index + 1}`,
    hasSolution: false,
    sgflags: 0,
    unsolvable: null,
  }));
}

function createEntry(
  filebase: string,
  mapfilename: string,
  ruleset: "MS" | "Lynx",
  levelCount = 149,
): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename,
    ruleset,
    levels: createLevels(levelCount, filebase),
  };
}

describe("buildCuratedCatalogView", () => {
  it("pairs CCLP2 and CCLXP2 into one official family with preferred launch entries", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("CCLP2.dac", "./data/CCLP2.dat", "MS"),
        createEntry("CCLP2.dat-lynx.dac", "./data/CCLP2.dat", "Lynx"),
        createEntry("CCLXP2.dac", "./data/CCLXP2.dat", "Lynx"),
        createEntry("CCLXP2.dat-ms.dac", "./data/CCLXP2.dat", "MS"),
      ],
      { seriesFile: "CCLXP2.dac", levelNumber: 12 },
    );

    expect(view.officialFamilies).toHaveLength(1);
    expect(view.officialFamilies[0]).toMatchObject({
      id: "official:cclp2-cclxp2",
      title: "CCLP2 / CCLXP2",
      sidebarSummary: "Rough early-community expansion",
      yearLabel: "2002",
      continueSelection: { seriesFile: "CCLXP2.dac", levelNumber: 12 },
    });
    expect(view.officialFamilies[0]?.launchEntries.MS?.filebase).toBe("CCLP2.dac");
    expect(view.officialFamilies[0]?.launchEntries.Lynx?.filebase).toBe("CCLXP2.dac");
    expect(resolveSetFamilySelection(view.officialFamilies[0]!, "MS", 37)).toEqual({
      seriesFile: "CCLP2.dac",
      levelNumber: 37,
    });
    expect(resolveSetFamilySelection(view.officialFamilies[0]!, "Lynx", 37)).toEqual({
      seriesFile: "CCLXP2.dac",
      levelNumber: 37,
    });
    expect(
      findSetFamilyForSelection(view, {
        seriesFile: "CCLP2.dat-lynx.dac",
        levelNumber: 8,
      }),
    ).toMatchObject({
      id: "official:cclp2-cclxp2",
    });
    expect(view.officialFamilies[0]?.links.map((link) => link.label)).toEqual([
      "CCLP2 wiki",
      "CCLXP2 wiki",
      "Fandom reception",
    ]);
  });

  it("orders official packs with CCLP1 first and the CCLP2 family last", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("CCLP5-MS.dac", "./data/CCLP5.dat", "MS"),
        createEntry("CCLP5-Lynx.dac", "./data/CCLP5.dat", "Lynx"),
        createEntry("CCLP2.dac", "./data/CCLP2.dat", "MS"),
        createEntry("CCLXP2.dac", "./data/CCLXP2.dat", "Lynx"),
        createEntry("CCLP4-MS.dac", "./data/CCLP4.dat", "MS"),
        createEntry("CCLP4-Lynx.dac", "./data/CCLP4.dat", "Lynx"),
        createEntry("CCLP3-MS.dac", "./data/CCLP3.dat", "MS"),
        createEntry("CCLP3-Lynx.dac", "./data/CCLP3.dat", "Lynx"),
        createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS"),
        createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx"),
      ],
      null,
    );

    expect(view.officialFamilies.map((family) => family.title)).toEqual([
      "CCLP1",
      "CCLP4",
      "CCLP5",
      "CCLP3",
      "CCLP2 / CCLXP2",
    ]);
    expect(view.officialFamilies.map((family) => `${family.title}:${family.yearLabel ?? ""}`)).toEqual([
      "CCLP1:2014",
      "CCLP4:2017",
      "CCLP5:2024",
      "CCLP3:2010",
      "CCLP2 / CCLXP2:2002",
    ]);
    expect(view.officialFamilies.map((family) => family.sidebarSummary)).toEqual([
      "Easy difficulty.",
      "Moderate difficulty.",
      "Hard difficulty.",
      "Higher quality than CCLP2, extremely difficult endgame.",
      "Rough early-community expansion",
    ]);
    expect(view.officialFamilies.find((family) => family.title === "CCLP3")).toMatchObject({
      description: "Higher quality than CCLP2.",
    });
  });

  it("keeps intro, local, and other sets out of the primary official list", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS"),
        createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx"),
        createEntry("intro-ms.dac", "./data/intro.dat", "MS", 9),
        createEntry("intro-lynx.dac", "./data/intro.dat", "Lynx", 9),
        createEntry("public_CCZoneTT.dac", "./data/CCZoneTT.dat", "MS", 117),
        createEntry("public_CCZoneTT-lynx.dac", "./data/CCZoneTT.dat", "Lynx", 117),
        createEntry("3DINTRO-MS.dac", "./data/3DINTRO.dat", "MS", 6),
        createEntry("3DINTRO-Lynx.dac", "./data/3DINTRO.dat", "Lynx", 6),
        createEntry("Imported (MS)", "local:Imported.dat", "MS", 9),
        createEntry("Imported (Lynx)", "local:Imported.dat", "Lynx", 9),
      ],
      null,
    );

    expect(view.officialFamilies.map((family) => family.title)).toEqual(["CCLP1"]);
    expect(view.introFamilies.map((family) => family.title)).toEqual(["3D Tile World Intro"]);
    expect(view.localFamilies.map((family) => family.title)).toEqual(["Imported"]);
    expect(view.otherFamilies.map((family) => family.title)).toEqual(["Intro", "CCZoneTT"]);
  });

  it("recognizes curated custom sets with explicit titles and descriptions", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("po100t-MS.dac", "./data/po100t.dat", "MS", 100),
        createEntry("po100t-Lynx.dac", "./data/po100t.dat", "Lynx", 100),
        createEntry("TS0-MS.dac", "./data/TS0.dat", "MS", 2),
        createEntry("TS0-Lynx.dac", "./data/TS0.dat", "Lynx", 2),
        createEntry("3DINTRO-MS.dac", "./data/3DINTRO.dat", "MS", 6),
        createEntry("3DINTRO-Lynx.dac", "./data/3DINTRO.dat", "Lynx", 6),
      ],
      null,
    );

    expect(view.introFamilies.map((family) => family.title)).toEqual([
      "3D Tile World Intro",
      "The Pit Of 100 Tiles",
      "TS0",
    ]);
    expect(listSetFamilyRulesets(view.introFamilies[0]!)).toEqual(["Lynx", "MS"]);
    expect(listSetFamilyRulesets(view.introFamilies[1]!)).toEqual(["Lynx", "MS"]);
    expect(listSetFamilyRulesets(view.introFamilies[2]!)).toEqual(["Lynx", "MS"]);
    expect(view.introFamilies[0]).toMatchObject({
      sidebarSummary: "Joshua Bone",
      description: "Introduction to 3D Tile World levels. Work in progress.",
    });
    expect(view.introFamilies[1]).toMatchObject({
      sidebarSummary: "Andrew Menzies",
      description: "The Pit Of 100 Tiles by Andrew Menzies. Custom levelset used by author's permission.",
    });
    expect(view.introFamilies[2]).toMatchObject({
      sidebarSummary: "Tyler Sontag",
      description: "TS0 by Tyler Sontag. Custom levelset used by author's permission.",
    });
  });

  it("treats imported DAT variants as one local family and preserves level numbers across rulesets", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("Imported.dat-ms.dac", "local:Imported.dat", "MS", 12),
        createEntry("Imported.dat-lynx.dac", "local:Imported.dat", "Lynx", 12),
      ],
      { seriesFile: "Imported.dat-ms.dac", levelNumber: 9 },
    );

    expect(view.localFamilies).toHaveLength(1);
    expect(listSetFamilyRulesets(view.localFamilies[0]!)).toEqual(["Lynx", "MS"]);
    expect(resolveSetFamilySelection(view.localFamilies[0]!, "MS", 9)).toEqual({
      seriesFile: "Imported.dat-ms.dac",
      levelNumber: 9,
    });
    expect(resolveSetFamilySelection(view.localFamilies[0]!, "Lynx", 9)).toEqual({
      seriesFile: "Imported.dat-lynx.dac",
      levelNumber: 9,
    });
  });

  it("strips leftover technical extensions from imported local family titles", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("VaultRunner.dac.dat-ms.dac", "local:VaultRunner.dac.dat", "MS", 12),
        createEntry("VaultRunner.dac.dat-lynx.dac", "local:VaultRunner.dac.dat", "Lynx", 12),
      ],
      null,
    );

    expect(view.localFamilies.map((family) => family.title)).toEqual(["VaultRunner"]);
  });

  it("disables a missing ruleset by leaving that side unresolved", () => {
    const view = buildCuratedCatalogView([createEntry("Solo.dat-ms.dac", "local:Solo.dat", "MS", 9)], null);

    expect(listSetFamilyRulesets(view.localFamilies[0]!)).toEqual(["MS"]);
    expect(resolveSetFamilySelection(view.localFamilies[0]!, "Lynx", 4)).toBeNull();
  });
});

describe("searchSetFamilies", () => {
  it("ranks title matches ahead of metadata and level-title matches", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("VaultRunner-MS.dac", "local:VaultRunner.dat", "MS", 2),
        {
          ...createEntry("MetadataOnly-MS.dac", "local:MetadataOnly.dat", "MS", 2),
          levels: createLevels(2, "Metadata"),
        },
        {
          ...createEntry("LevelOnly-MS.dac", "local:LevelOnly.dat", "MS", 2),
          levels: [
            { ...createLevels(1, "Unused")[0]!, name: "Vault Door" },
            { ...createLevels(1, "Unused")[0]!, index: 1, number: 2, name: "Unused 2" },
          ],
        },
      ],
      null,
    );
    const metadataOnlyFamily = view.localFamilies.find((family) => family.title === "MetadataOnly");
    if (!metadataOnlyFamily) {
      throw new Error("Expected MetadataOnly family to exist.");
    }
    metadataOnlyFamily.description = "Imported from this browser session by Vault Curator.";

    const results = searchSetFamilies(view.localFamilies, "vault");

    expect(results.map((family) => family.title)).toEqual(["VaultRunner", "MetadataOnly", "LevelOnly"]);
  });

  it("matches curated packs by author metadata and internal filebase text", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("po100t-MS.dac", "./data/po100t.dat", "MS", 100),
        createEntry("po100t-Lynx.dac", "./data/po100t.dat", "Lynx", 100),
        createEntry("TS0-MS.dac", "./data/TS0.dat", "MS", 2),
        createEntry("TS0-Lynx.dac", "./data/TS0.dat", "Lynx", 2),
      ],
      null,
    );

    expect(searchSetFamilies(view.introFamilies, "Andrew Menzies").map((family) => family.title)).toEqual([
      "The Pit Of 100 Tiles",
    ]);
    expect(searchSetFamilies(view.introFamilies, "po100t").map((family) => family.title)).toEqual([
      "The Pit Of 100 Tiles",
    ]);
  });

  it("searches across official, curated, and uploaded families but excludes hidden other sets", () => {
    const view = buildCuratedCatalogView(
      [
        createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS"),
        createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx"),
        createEntry("po100t-MS.dac", "./data/po100t.dat", "MS", 100),
        createEntry("po100t-Lynx.dac", "./data/po100t.dat", "Lynx", 100),
        createEntry("Imported.dat-ms.dac", "local:Imported.dat", "MS", 9),
        createEntry("Imported.dat-lynx.dac", "local:Imported.dat", "Lynx", 9),
        createEntry("public_CCZoneTT.dac", "./data/CCZoneTT.dat", "MS", 117),
        createEntry("public_CCZoneTT-lynx.dac", "./data/CCZoneTT.dat", "Lynx", 117),
      ],
      null,
    );

    const searchableFamilies = listSearchableSetFamilies(view);

    expect(searchableFamilies.map((family) => family.title)).toEqual([
      "CCLP1",
      "The Pit Of 100 Tiles",
      "Imported",
    ]);
    expect(searchSetFamilies(searchableFamilies, "Imported").map((family) => family.title)).toEqual(["Imported"]);
    expect(searchSetFamilies(searchableFamilies, "Pit Of 100 Tiles").map((family) => family.title)).toEqual([
      "The Pit Of 100 Tiles",
    ]);
    expect(searchSetFamilies(searchableFamilies, "CCZoneTT")).toEqual([]);
  });

  it("returns the matched level number when the family only matches on a level title", () => {
    const view = buildCuratedCatalogView(
      [
        {
          ...createEntry("Moon-MS.dac", "local:Moon.dat", "MS", 3),
          levels: [
            { ...createLevels(1, "Moon")[0]!, name: "North Hall" },
            { ...createLevels(1, "Moon")[0]!, index: 1, number: 2, name: "South Hall" },
            { ...createLevels(1, "Moon")[0]!, index: 2, number: 3, name: "Red Moon" },
          ],
        },
        {
          ...createEntry("Moon-Lynx.dac", "local:Moon.dat", "Lynx", 3),
          levels: [
            { ...createLevels(1, "Moon")[0]!, name: "North Hall" },
            { ...createLevels(1, "Moon")[0]!, index: 1, number: 2, name: "Silver Moon" },
            { ...createLevels(1, "Moon")[0]!, index: 2, number: 3, name: "West Hall" },
          ],
        },
      ],
      null,
    );

    const family = view.localFamilies[0]!;
    expect(resolveSearchMatchedLevelNumber(family, "silver moon", "Lynx")).toBe(2);
    expect(resolveSearchMatchedLevelNumber(family, "red moon", "MS")).toBe(3);
  });

  it("does not return a matched level number when title or metadata already match first", () => {
    const titleView = buildCuratedCatalogView(
      [
        {
          ...createEntry("Moon-MS.dac", "local:Moon.dat", "MS", 2),
          levels: [
            { ...createLevels(1, "Moon")[0]!, name: "Moon Door" },
            { ...createLevels(1, "Moon")[0]!, index: 1, number: 2, name: "Unused 2" },
          ],
        },
      ],
      null,
    );
    expect(resolveSearchMatchedLevelNumber(titleView.localFamilies[0]!, "moon", "MS")).toBeNull();

    const metadataView = buildCuratedCatalogView(
      [
        {
          ...createEntry("Archive-MS.dac", "local:Archive.dat", "MS", 2),
          levels: [
            { ...createLevels(1, "Archive")[0]!, name: "Vault Door" },
            { ...createLevels(1, "Archive")[0]!, index: 1, number: 2, name: "Unused 2" },
          ],
        },
      ],
      null,
    );
    metadataView.localFamilies[0]!.description = "Imported from this browser session by Vault Curator.";
    expect(resolveSearchMatchedLevelNumber(metadataView.localFamilies[0]!, "vault", "MS")).toBeNull();
  });
});
