import { describe, expect, it, vi } from "vitest";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { createBrowserProfileBackup, serializeBrowserProfileBackup } from "@player-web/impl/browserProfileBackup";
import {
  buildModernLevelLink,
  discardModernUploadedFamily,
  importModernLocalDatFiles,
  importModernProfileBackup,
  prepareModernProfileBackupDownload,
} from "@player-web/impl/modern/modernDashboardTransferController";
import type { BrowserProfileSnapshot } from "@player-web/ports/BrowserProfileStore";

function createLevels(names: readonly string[]): SeriesLevel[] {
  return names.map((name, index) => ({
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
  }));
}

function createEntry(
  filebase: string,
  mapfilename: string,
  ruleset: "MS" | "Lynx",
  levelNames: readonly string[],
): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename,
    ruleset,
    levels: createLevels(levelNames),
  };
}

function createProfileSnapshot(): BrowserProfileSnapshot {
  return {
    version: 1,
    selection: { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1 },
    preferences: {
      uiMode: "modern",
      defaultRuleset: "Lynx",
      autoSaveWinningHighScoreReplays: true,
      autoDownloadReplaysOnSave: false,
    },
    importedDatFiles: [],
  };
}

describe("modernDashboardTransferController", () => {
  it("imports local DAT files into uploads and selects the imported family", async () => {
    const result = await importModernLocalDatFiles({
      catalog: [
        createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS", ["Intro"]),
        createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx", ["Intro"]),
      ],
      files: [{ name: "Imported.dat" } as File],
      importDatFile: vi.fn(async () => [
        createEntry("Imported.dat-ms.dac", "local:Imported.dat", "MS", ["Upload One", "Upload Two"]),
        createEntry("Imported.dat-lynx.dac", "local:Imported.dat", "Lynx", ["Upload One", "Upload Two"]),
      ]),
      requestedRuleset: "Lynx",
    });

    expect(result.nextActiveTab).toBe("uploads");
    expect(result.nextActiveFamilyId).toBe("local:imported");
    expect(result.nextRequestedLevelNumber).toBe(1);
    expect(result.nextCatalog?.map((entry) => entry.filebase)).toEqual([
      "CCLP1-MS.dac",
      "CCLP1-Lynx.dac",
      "Imported.dat-ms.dac",
      "Imported.dat-lynx.dac",
    ]);
    expect(result.message).toContain("Imported Imported.dat.");
  });

  it("falls back out of uploads when discarding the last local family", async () => {
    const result = await discardModernUploadedFamily({
      activeFamilyId: "local:imported",
      activeTab: "uploads",
      catalog: [
        createEntry("CCLP1-MS.dac", "./data/CCLP1.dat", "MS", ["Intro"]),
        createEntry("CCLP1-Lynx.dac", "./data/CCLP1.dat", "Lynx", ["Intro"]),
        createEntry("Imported.dat-ms.dac", "local:Imported.dat", "MS", ["Upload"]),
        createEntry("Imported.dat-lynx.dac", "local:Imported.dat", "Lynx", ["Upload"]),
      ],
      deleteImportedDatFile: vi.fn(async () => {}),
      familyId: "local:imported",
      lastSelection: { seriesFile: "Imported.dat-lynx.dac", levelNumber: 1 },
    });

    expect(result).toMatchObject({
      nextActiveFamilyId: "official:cclp1",
      nextActiveTab: "official",
      removedFamilyId: "local:imported",
      message: "Discarded local set Imported.dat.",
    });
    expect(result?.nextCatalog.map((entry) => entry.filebase)).toEqual([
      "CCLP1-MS.dac",
      "CCLP1-Lynx.dac",
    ]);
  });

  it("builds share links from the browser profile's imported DAT list", async () => {
    const href = await buildModernLevelLink({
      levelNumber: 3,
      origin: "https://example.com",
      profileStore: {
        listImportedDatFiles: vi.fn(async () => []),
      },
      ruleset: "Lynx",
      seriesFile: "CCLP1-Lynx.dac",
    });

    expect(href).toContain("level=3");
    expect(href).toContain("ruleset=Lynx");
    expect(href).toContain("set=CCLP1");
  });

  it("prepares a serialized profile backup download", async () => {
    const snapshot = createProfileSnapshot();
    const download = await prepareModernProfileBackupDownload(
      {
        exportProfileSnapshot: vi.fn(async () => snapshot),
      },
      Date.UTC(2026, 0, 2, 3, 4, 5),
    );

    expect(download.filename).toBe("tworld-profile-2026-01-02T03-04-05.000Z.json");
    expect(download.payload).toContain("\"kind\": \"tworld-browser-profile-backup\"");
    expect(download.payload).toContain("\"seriesFile\": \"CCLP1-Lynx.dac\"");
  });

  it("imports a structured profile backup into the browser profile store", async () => {
    const snapshot = createProfileSnapshot();
    const payload = serializeBrowserProfileBackup(createBrowserProfileBackup(snapshot, 123));
    const importProfileSnapshot = vi.fn(async () => {});

    const localSettings = await importModernProfileBackup(
      {
        importProfileSnapshot,
      },
      {
        text: async () => payload,
      },
    );

    expect(importProfileSnapshot).toHaveBeenCalledWith(snapshot);
    expect(localSettings).toBeDefined();
  });
});
