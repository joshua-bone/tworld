import { describe, expect, it, vi } from "vitest";
import {
  IndexedDbBrowserProfileStore,
  parseStoredBrowserProfilePreferences,
} from "@player-web/impl/IndexedDbBrowserProfileStore";
import {
  FailingReplaySaveBackend,
  MemoryBrowserProfilePersistenceBackend,
} from "@player-web/impl/browserProfileStoreTestSupport";
import type { BrowserProfileSnapshot } from "@player-web/ports/BrowserProfileStore";
import { createDefaultBrowserProfilePreferences } from "@player-web/ports/BrowserProfileStore";

describe("IndexedDbBrowserProfileStore", () => {
  it("starts with no persisted seed locks by default", async () => {
    const store = new IndexedDbBrowserProfileStore(new MemoryBrowserProfilePersistenceBackend());

    expect(await store.loadLevelSeedOverrides()).toEqual([]);
  });

  it("persists selection, preferences, and imported DAT files through the profile backend", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    const store = new IndexedDbBrowserProfileStore(backend);
    const datBytes = Uint8Array.from([1, 2, 3, 4]);

    await store.saveSelection({ seriesFile: "CCLP1-MS.dac", levelNumber: 7 });
    await store.savePreferences({
      uiMode: "classic",
      defaultRuleset: "Lynx",
      autoSaveWinningHighScoreReplays: false,
      autoDownloadReplaysOnSave: true,
    });
    await store.saveLevelSeedOverride({
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 7,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    await store.recordRecentSelection({ seriesFile: "CCLP1-MS.dac", levelNumber: 7 });
    await store.saveImportedDatFile({
      filename: "Imported.dat",
      datHash: "hash:imported",
      datBytes,
      source: { kind: "bitbusters-custom-pack", game: "CC1", packId: 577 },
    });

    expect(await store.loadSelection()).toEqual({ seriesFile: "CCLP1-MS.dac", levelNumber: 7 });
    expect(await store.loadPreferences()).toEqual({
      uiMode: "classic",
      defaultRuleset: "Lynx",
      autoSaveWinningHighScoreReplays: false,
      autoDownloadReplaysOnSave: true,
    });
    expect(await store.listImportedDatFiles()).toEqual([
      {
        filename: "Imported.dat",
        datHash: "hash:imported",
        datBytes,
        source: { kind: "bitbusters-custom-pack", game: "CC1", packId: 577 },
      },
    ]);
    expect(await store.loadLevelSeedOverrides()).toEqual([
      {
        seriesFile: "CCLP1-MS.dac",
        levelNumber: 7,
        ruleset: "MS",
        randomSeed: 123456789,
      },
    ]);
    expect(await store.loadRecentSelections()).toEqual([
      {
        selection: { seriesFile: "CCLP1-MS.dac", levelNumber: 7 },
        savedAtMs: expect.any(Number),
      },
    ]);
  });

  it("deletes a persisted imported DAT file through the profile backend", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    const store = new IndexedDbBrowserProfileStore(backend);

    await store.saveImportedDatFile({ filename: "Imported.dat", datHash: "hash:imported", datBytes: Uint8Array.from([1, 2, 3]) });
    await store.deleteImportedDatFile("Imported.dat");

    expect(await store.listImportedDatFiles()).toEqual([]);
  });

  it("falls back to safe defaults for invalid persisted preference and selection data", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    backend.values.set("selection", { seriesFile: 5, levelNumber: "bad" });
    backend.values.set("preferences", { uiMode: "broken", defaultRuleset: "broken" });
    const store = new IndexedDbBrowserProfileStore(backend);

    expect(await store.loadSelection()).toBeNull();
    expect(await store.loadPreferences()).toEqual(createDefaultBrowserProfilePreferences());
    expect(
      parseStoredBrowserProfilePreferences({
        uiMode: "classic",
        defaultRuleset: "Lynx",
        autoSaveWinningHighScoreReplays: false,
        autoDownloadReplaysOnSave: true,
      }),
    ).toEqual({
      uiMode: "classic",
      defaultRuleset: "Lynx",
      autoSaveWinningHighScoreReplays: false,
      autoDownloadReplaysOnSave: true,
    });
  });

  it("exports and reimports a browser profile snapshot for later backup UI wiring", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    const store = new IndexedDbBrowserProfileStore(backend);

    await store.saveSelection({ seriesFile: "CCLP2.dac", levelNumber: 11 });
    await store.savePreferences({
      uiMode: "classic",
      defaultRuleset: "Lynx",
      autoSaveWinningHighScoreReplays: false,
      autoDownloadReplaysOnSave: true,
    });
    await store.recordRecentSelection({ seriesFile: "CCLP2.dac", levelNumber: 11 });
    await store.saveLevelProgressSummary({
      ruleset: "MS",
      gameplayHash: "gameplay-hash:11",
      lastPlayedAtMs: 1234,
      lastResult: "completed-clean",
      bestResult: "completed-clean",
      lastElapsedTicks: 120,
      bestElapsedTicks: 120,
      lastUndoUsedCount: 0,
      bestUndoUsedCount: 0,
    });
    await store.saveLevelSeedOverride({
      seriesFile: "CCLP2.dac",
      levelNumber: 11,
      ruleset: "MS",
      randomSeed: 777,
    });
    const replayEntry = await store.saveReplayEntry({
      fileName: "CCLP2-level-11.tws.bin",
      seriesFile: "CCLP2.dac",
      levelNumber: 11,
      levelName: "Replay Test",
      ruleset: "MS",
      source: "saved-run",
      result: "completed-clean",
      finalScore: 6000,
      undoUsedCount: 0,
      bytes: Uint8Array.from([4, 5, 6]),
    });
    await store.saveImportedDatFile({
      filename: "Imported.dat",
      datHash: "hash:imported",
      datBytes: Uint8Array.from([9, 8, 7]),
      source: { kind: "bitbusters-custom-pack", game: "CC1", packId: 577 },
    });

    const snapshot = await store.exportProfileSnapshot();

    expect(snapshot).toMatchObject({
      version: 1,
      selection: { seriesFile: "CCLP2.dac", levelNumber: 11 },
      preferences: {
        uiMode: "classic",
        defaultRuleset: "Lynx",
        autoSaveWinningHighScoreReplays: false,
        autoDownloadReplaysOnSave: true,
      },
      levelSeedOverrides: [
        {
          seriesFile: "CCLP2.dac",
          levelNumber: 11,
          ruleset: "MS",
          randomSeed: 777,
        },
      ],
      recentSelections: [
        {
          selection: { seriesFile: "CCLP2.dac", levelNumber: 11 },
          savedAtMs: expect.any(Number),
        },
      ],
      levelProgressSummaries: [
        {
          ruleset: "MS",
          gameplayHash: "gameplay-hash:11",
          lastPlayedAtMs: 1234,
          lastResult: "completed-clean",
          bestResult: "completed-clean",
          lastElapsedTicks: 120,
          bestElapsedTicks: 120,
          lastUndoUsedCount: 0,
          bestUndoUsedCount: 0,
        },
      ],
      replayEntries: [
        {
          id: replayEntry.id,
          fileName: "CCLP2-level-11.tws.bin",
          seriesFile: "CCLP2.dac",
          levelNumber: 11,
          levelName: "Replay Test",
          ruleset: "MS",
          savedAtMs: expect.any(Number),
          source: "saved-run",
          result: "completed-clean",
          finalScore: 6000,
          undoUsedCount: 0,
          bytes: [4, 5, 6],
        },
      ],
      importedDatFiles: [
        {
          filename: "Imported.dat",
          datHash: "hash:imported",
          datBytes: [9, 8, 7],
          source: { kind: "bitbusters-custom-pack", game: "CC1", packId: 577 },
        },
      ],
    });

    const restoredBackend = new MemoryBrowserProfilePersistenceBackend();
    const restoredStore = new IndexedDbBrowserProfileStore(restoredBackend);
    await restoredStore.importProfileSnapshot(snapshot);

    expect(await restoredStore.loadSelection()).toEqual({ seriesFile: "CCLP2.dac", levelNumber: 11 });
    expect(await restoredStore.loadPreferences()).toEqual({
      uiMode: "classic",
      defaultRuleset: "Lynx",
      autoSaveWinningHighScoreReplays: false,
      autoDownloadReplaysOnSave: true,
    });
    expect(await restoredStore.loadRecentSelections()).toEqual([
      {
        selection: { seriesFile: "CCLP2.dac", levelNumber: 11 },
        savedAtMs: expect.any(Number),
      },
    ]);
    expect(await restoredStore.loadLevelSeedOverrides()).toEqual([
      {
        seriesFile: "CCLP2.dac",
        levelNumber: 11,
        ruleset: "MS",
        randomSeed: 777,
      },
    ]);
    expect(await restoredStore.loadLevelProgressSummaries()).toEqual([
      {
        ruleset: "MS",
        gameplayHash: "gameplay-hash:11",
        lastPlayedAtMs: 1234,
        lastResult: "completed-clean",
        bestResult: "completed-clean",
        lastElapsedTicks: 120,
        bestElapsedTicks: 120,
        lastUndoUsedCount: 0,
        bestUndoUsedCount: 0,
      },
    ]);
    expect(await restoredStore.listImportedDatFiles()).toEqual([
      {
        filename: "Imported.dat",
        datHash: "hash:imported",
        datBytes: Uint8Array.from([9, 8, 7]),
        source: { kind: "bitbusters-custom-pack", game: "CC1", packId: 577 },
      },
    ]);
    expect(await restoredStore.loadReplayEntries()).toEqual([
      {
        id: replayEntry.id,
        fileName: "CCLP2-level-11.tws.bin",
        seriesFile: "CCLP2.dac",
        levelNumber: 11,
        levelName: "Replay Test",
        ruleset: "MS",
        savedAtMs: expect.any(Number),
        source: "saved-run",
        result: "completed-clean",
        finalScore: 6000,
        undoUsedCount: 0,
        bytes: Uint8Array.from([4, 5, 6]),
      },
    ]);
  });

  it("ignores invalid replay entries while importing a browser profile snapshot", async () => {
    const store = new IndexedDbBrowserProfileStore(new MemoryBrowserProfilePersistenceBackend());
    const snapshot = {
      version: 1,
      selection: null,
      preferences: createDefaultBrowserProfilePreferences(),
      importedDatFiles: [],
      replayEntries: [
        {
          id: "valid-replay",
          fileName: "valid.tws.bin",
          seriesFile: "CCLP1-MS.dac",
          levelNumber: 1,
          levelName: "One",
          ruleset: "MS",
          savedAtMs: 2000,
          source: "imported-file",
          result: "completed",
          finalScore: 500,
          undoUsedCount: 0,
          bytes: [1, 2, 3],
        },
        {
          id: "broken-ruleset",
          fileName: "broken-ruleset.tws.bin",
          seriesFile: "CCLP1-MS.dac",
          levelNumber: 2,
          levelName: "Two",
          ruleset: "Broken",
          savedAtMs: 1500,
          source: "saved-run",
          result: "completed-clean",
          finalScore: 400,
          undoUsedCount: 0,
          bytes: [4, 5],
        },
        {
          id: "broken-bytes",
          fileName: "broken-bytes.tws.bin",
          seriesFile: "CCLP1-MS.dac",
          levelNumber: 3,
          levelName: "Three",
          ruleset: "MS",
          savedAtMs: 1000,
          source: "saved-run",
          result: "completed-clean",
          finalScore: 300,
          undoUsedCount: 0,
          bytes: null,
        },
      ],
    } as unknown as BrowserProfileSnapshot;

    await store.importProfileSnapshot(snapshot);

    expect(await store.loadReplayEntries()).toEqual([
      {
        id: "valid-replay",
        fileName: "valid.tws.bin",
        seriesFile: "CCLP1-MS.dac",
        levelNumber: 1,
        levelName: "One",
        ruleset: "MS",
        savedAtMs: 2000,
        source: "imported-file",
        result: "completed-clean",
        finalScore: 500,
        undoUsedCount: 0,
        bytes: Uint8Array.from([1, 2, 3]),
      },
    ]);
  });

  it("deduplicates recents and preserves a completed best result across later failures", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    const store = new IndexedDbBrowserProfileStore(backend);
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000);
    nowSpy.mockReturnValueOnce(2000);
    nowSpy.mockReturnValueOnce(3000);

    try {
      await store.recordRecentSelection({ seriesFile: "CCLP1-MS.dac", levelNumber: 2 });
      await store.recordRecentSelection({ seriesFile: "CCLP1-MS.dac", levelNumber: 3 });
      await store.recordRecentSelection({ seriesFile: "CCLP1-MS.dac", levelNumber: 2 });
      await store.saveLevelProgressSummary({
        ruleset: "MS",
        gameplayHash: "shared-hash",
        lastPlayedAtMs: 100,
        lastResult: "completed-clean",
        bestResult: "completed-clean",
        lastElapsedTicks: 100,
        bestElapsedTicks: 100,
        lastUndoUsedCount: 0,
        bestUndoUsedCount: 0,
      });
      await store.saveLevelProgressSummary({
        ruleset: "MS",
        gameplayHash: "shared-hash",
        lastPlayedAtMs: 150,
        lastResult: "completed-with-undo",
        bestResult: "completed-with-undo",
        lastElapsedTicks: 150,
        bestElapsedTicks: 150,
        lastUndoUsedCount: 2,
        bestUndoUsedCount: 2,
      });
      await store.saveLevelProgressSummary({
        ruleset: "MS",
        gameplayHash: "shared-hash",
        lastPlayedAtMs: 200,
        lastResult: "failed",
        bestResult: "failed",
        lastElapsedTicks: 200,
        bestElapsedTicks: 200,
        lastUndoUsedCount: 0,
        bestUndoUsedCount: 0,
      });

      expect(await store.loadRecentSelections()).toEqual([
        {
          selection: { seriesFile: "CCLP1-MS.dac", levelNumber: 2 },
          savedAtMs: 3000,
        },
        {
          selection: { seriesFile: "CCLP1-MS.dac", levelNumber: 3 },
          savedAtMs: 2000,
        },
      ]);
      expect(await store.loadLevelProgressSummaries()).toEqual([
        {
          ruleset: "MS",
          gameplayHash: "shared-hash",
          lastPlayedAtMs: 200,
          lastResult: "failed",
          bestResult: "completed-clean",
          lastElapsedTicks: 200,
          bestElapsedTicks: 100,
          lastUndoUsedCount: 0,
          bestUndoUsedCount: 0,
        },
      ]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("persists replay entries with metadata and sorts newer saves first", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    const store = new IndexedDbBrowserProfileStore(backend);
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000);
    nowSpy.mockReturnValueOnce(2000);

    try {
      await store.saveReplayEntry({
        fileName: "older.tws.bin",
        seriesFile: "CCLP1-MS.dac",
        levelNumber: 1,
        levelName: "One",
        ruleset: "MS",
        source: "saved-run",
        result: "completed-with-undo",
        finalScore: 400,
        undoUsedCount: 1,
        bytes: Uint8Array.from([1]),
      });
      await store.saveReplayEntry({
        fileName: "newer.tws.bin",
        seriesFile: "CCLP1-MS.dac",
        levelNumber: 1,
        levelName: "One",
        ruleset: "MS",
        source: "imported-file",
        result: null,
        finalScore: null,
        undoUsedCount: null,
        bytes: Uint8Array.from([2, 3]),
      });

      expect(await store.loadReplayEntries()).toEqual([
        {
          id: expect.any(String),
          fileName: "newer.tws.bin",
          seriesFile: "CCLP1-MS.dac",
          levelNumber: 1,
          levelName: "One",
          ruleset: "MS",
          savedAtMs: 2000,
          source: "imported-file",
          result: null,
          finalScore: null,
          undoUsedCount: null,
          bytes: Uint8Array.from([2, 3]),
        },
        {
          id: expect.any(String),
          fileName: "older.tws.bin",
          seriesFile: "CCLP1-MS.dac",
          levelNumber: 1,
          levelName: "One",
          ruleset: "MS",
          savedAtMs: 1000,
          source: "saved-run",
          result: "completed-with-undo",
          finalScore: 400,
          undoUsedCount: 1,
          bytes: Uint8Array.from([1]),
        },
      ]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("deletes replay entries from persistent storage", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    const store = new IndexedDbBrowserProfileStore(backend);
    const entry = await store.saveReplayEntry({
      fileName: "delete-me.tws.bin",
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 1,
      levelName: "One",
      ruleset: "MS",
      source: "saved-run",
      result: "completed-clean",
      finalScore: 500,
      undoUsedCount: 0,
      bytes: Uint8Array.from([9, 9, 9]),
    });

    await store.deleteReplayEntry(entry.id);

    expect(await store.loadReplayEntries()).toEqual([]);
  });

  it("surfaces replay persistence failures instead of pretending the save succeeded", async () => {
    const store = new IndexedDbBrowserProfileStore(new FailingReplaySaveBackend());

    await expect(
      store.saveReplayEntry({
        fileName: "broken.tws.bin",
        seriesFile: "CCLP1-MS.dac",
        levelNumber: 1,
        levelName: "One",
        ruleset: "MS",
        source: "saved-run",
        result: "completed-clean",
        finalScore: 500,
        undoUsedCount: 0,
        bytes: Uint8Array.from([1, 2, 3]),
      }),
    ).rejects.toThrow("Failed to save replay broken.tws.bin to the browser library. IndexedDB write failed.");
  });

  it("replaces and deletes persisted level seed overrides", async () => {
    const backend = new MemoryBrowserProfilePersistenceBackend();
    const store = new IndexedDbBrowserProfileStore(backend);

    await store.saveLevelSeedOverride({
      seriesFile: "CCLP1-Lynx.dac",
      levelNumber: 5,
      ruleset: "Lynx",
      randomSeed: 1,
    });
    await store.saveLevelSeedOverride({
      seriesFile: "CCLP1-Lynx.dac",
      levelNumber: 5,
      ruleset: "Lynx",
      randomSeed: 2,
    });

    expect(await store.loadLevelSeedOverrides()).toEqual([
      {
        seriesFile: "CCLP1-Lynx.dac",
        levelNumber: 5,
        ruleset: "Lynx",
        randomSeed: 2,
      },
    ]);

    await store.deleteLevelSeedOverride({
      seriesFile: "CCLP1-Lynx.dac",
      levelNumber: 5,
      ruleset: "Lynx",
    });

    expect(await store.loadLevelSeedOverrides()).toEqual([]);
  });
});
