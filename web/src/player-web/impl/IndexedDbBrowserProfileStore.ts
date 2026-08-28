import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import {
  cloneBytes,
  mergeRecentSelections,
  parseStoredBrowserProfilePreferences,
  parseStoredImportedDatSource,
  parseStoredLevelProgressSummaries,
  parseStoredLevelSeedOverrides,
  parseStoredRecentSelections,
  parseStoredReplayEntries,
  parseStoredSelection,
} from "@player-web/impl/browserProfileCodecs";
import {
  type BrowserProfilePersistenceBackend,
  IndexedDbBrowserProfileBackend,
  LEVEL_PROGRESS_KEY,
  LEVEL_SEED_OVERRIDES_KEY,
  PREFERENCES_KEY,
  RECENT_SELECTIONS_KEY,
  SELECTION_KEY,
} from "@player-web/impl/browserProfilePersistence";
import { normalizeLegacyRandomSeed } from "@player-web/impl/levelSeedOverrides";
import { mergeLevelProgressSummaries } from "@player-web/impl/levelProgress";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import {
  createDefaultBrowserProfilePreferences,
  type BrowserLevelSeedOverride,
  type BrowserLevelProgressSummary,
  type BrowserProfilePreferences,
  type BrowserProfileSnapshot,
  type BrowserProfileStore,
  type BrowserRecentSelectionRecord,
  type BrowserReplayEntry,
  type BrowserReplaySaveRequest,
  type BrowserStoredReplayEntry,
} from "@player-web/ports/BrowserProfileStore";

export { parseStoredBrowserProfilePreferences } from "@player-web/impl/browserProfileCodecs";
export type { BrowserProfilePersistenceBackend } from "@player-web/impl/browserProfilePersistence";

const LEGACY_SELECTION_STORAGE_KEY = "tworld:web:selection";

function createReplayEntryId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `replay-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export class IndexedDbBrowserProfileStore implements BrowserProfileStore {
  constructor(private readonly backend: BrowserProfilePersistenceBackend = new IndexedDbBrowserProfileBackend()) {}

  private loadLegacySelection(): PlayableSelection | null {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(LEGACY_SELECTION_STORAGE_KEY);
      return raw ? parseStoredSelection(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private async loadParsedValue<T>(key: typeof SELECTION_KEY, parse: (value: unknown) => T, fallback: T): Promise<T>;
  private async loadParsedValue<T>(
    key:
      | typeof PREFERENCES_KEY
      | typeof RECENT_SELECTIONS_KEY
      | typeof LEVEL_PROGRESS_KEY
      | typeof LEVEL_SEED_OVERRIDES_KEY,
    parse: (value: unknown) => T,
    fallback: T,
  ): Promise<T>;
  private async loadParsedValue<T>(
    key:
      | typeof SELECTION_KEY
      | typeof PREFERENCES_KEY
      | typeof RECENT_SELECTIONS_KEY
      | typeof LEVEL_PROGRESS_KEY
      | typeof LEVEL_SEED_OVERRIDES_KEY,
    parse: (value: unknown) => T,
    fallback: T,
  ): Promise<T> {
    try {
      return parse(await this.backend.getValue(key));
    } catch {
      return fallback;
    }
  }

  private async persistBestEffort(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch {
      // Ignore persistence failures and keep in-memory state.
    }
  }

  private async loadRecentSelectionsFromStorage(): Promise<BrowserRecentSelectionRecord[]> {
    return this.loadParsedValue(RECENT_SELECTIONS_KEY, parseStoredRecentSelections, []);
  }

  private async loadLevelProgressFromStorage(): Promise<BrowserLevelProgressSummary[]> {
    return this.loadParsedValue(LEVEL_PROGRESS_KEY, parseStoredLevelProgressSummaries, []);
  }

  private async loadLevelSeedOverridesFromStorage(): Promise<BrowserLevelSeedOverride[]> {
    return this.loadParsedValue(LEVEL_SEED_OVERRIDES_KEY, parseStoredLevelSeedOverrides, []);
  }

  async loadSelection(): Promise<PlayableSelection | null> {
    const storedSelection = await this.loadParsedValue(SELECTION_KEY, parseStoredSelection, null);
    if (storedSelection) {
      return storedSelection;
    }

    const legacySelection = this.loadLegacySelection();
    if (legacySelection) {
      void this.saveSelection(legacySelection);
    }
    return legacySelection;
  }

  async saveSelection(selection: PlayableSelection): Promise<void> {
    try {
      await this.backend.putValue(SELECTION_KEY, selection);
    } catch {
      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.setItem(LEGACY_SELECTION_STORAGE_KEY, JSON.stringify(selection));
      } catch {
        // Ignore storage failures and keep in-memory state.
      }
    }
  }

  async recordRecentSelection(selection: PlayableSelection): Promise<void> {
    await this.persistBestEffort(async () => {
      const existing = await this.loadRecentSelectionsFromStorage();
      await this.backend.putValue(RECENT_SELECTIONS_KEY, mergeRecentSelections(existing, selection, Date.now()));
    });
  }

  async loadPreferences(): Promise<BrowserProfilePreferences> {
    return this.loadParsedValue(
      PREFERENCES_KEY,
      parseStoredBrowserProfilePreferences,
      createDefaultBrowserProfilePreferences(),
    );
  }

  async savePreferences(preferences: BrowserProfilePreferences): Promise<void> {
    await this.persistBestEffort(async () => {
      await this.backend.putValue(PREFERENCES_KEY, preferences);
    });
  }

  async loadRecentSelections(): Promise<BrowserRecentSelectionRecord[]> {
    return this.loadRecentSelectionsFromStorage();
  }

  async loadLevelProgressSummaries(): Promise<BrowserLevelProgressSummary[]> {
    return this.loadLevelProgressFromStorage();
  }

  async saveLevelProgressSummary(summary: BrowserLevelProgressSummary): Promise<void> {
    await this.persistBestEffort(async () => {
      const existing = await this.loadLevelProgressFromStorage();
      await this.backend.putValue(LEVEL_PROGRESS_KEY, mergeLevelProgressSummaries(existing, summary));
    });
  }

  async loadLevelSeedOverrides(): Promise<BrowserLevelSeedOverride[]> {
    return this.loadLevelSeedOverridesFromStorage();
  }

  async saveLevelSeedOverride(override: BrowserLevelSeedOverride): Promise<void> {
    await this.persistBestEffort(async () => {
      const nextOverride = {
        ...override,
        randomSeed: normalizeLegacyRandomSeed(override.randomSeed),
      } satisfies BrowserLevelSeedOverride;
      const nextOverrides = [
        nextOverride,
        ...(await this.loadLevelSeedOverridesFromStorage()).filter(
          (entry) =>
            !(
              entry.seriesFile === nextOverride.seriesFile &&
              entry.levelNumber === nextOverride.levelNumber &&
              entry.ruleset === nextOverride.ruleset
            ),
        ),
      ];
      await this.backend.putValue(LEVEL_SEED_OVERRIDES_KEY, nextOverrides);
    });
  }

  async deleteLevelSeedOverride(
    target: Pick<BrowserLevelSeedOverride, "seriesFile" | "levelNumber" | "ruleset">,
  ): Promise<void> {
    await this.persistBestEffort(async () => {
      const nextOverrides = (await this.loadLevelSeedOverridesFromStorage()).filter(
        (entry) =>
          !(
            entry.seriesFile === target.seriesFile &&
            entry.levelNumber === target.levelNumber &&
            entry.ruleset === target.ruleset
          ),
      );
      await this.backend.putValue(LEVEL_SEED_OVERRIDES_KEY, nextOverrides);
    });
  }

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    try {
      return await this.backend.listImportedDatFiles();
    } catch {
      return [];
    }
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    await this.persistBestEffort(async () => {
      await this.backend.saveImportedDatFile(entry);
    });
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    await this.backend.deleteImportedDatFile(filename);
  }

  async loadReplayEntries(): Promise<BrowserReplayEntry[]> {
    try {
      return await this.backend.listReplayEntries();
    } catch {
      return [];
    }
  }

  async saveReplayEntry(entry: BrowserReplaySaveRequest): Promise<BrowserStoredReplayEntry> {
    const storedEntry: BrowserStoredReplayEntry = {
      id: createReplayEntryId(),
      fileName: entry.fileName,
      seriesFile: entry.seriesFile,
      levelNumber: entry.levelNumber,
      levelName: entry.levelName,
      ruleset: entry.ruleset,
      replayFormat: entry.replayFormat,
      gameplayHash: entry.gameplayHash,
      savedAtMs: Date.now(),
      source: entry.source,
      result: entry.result,
      finalScore: entry.finalScore,
      undoUsedCount: entry.undoUsedCount,
      bytes: cloneBytes(entry.bytes),
    };

    try {
      await this.backend.saveReplayEntry(storedEntry);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save replay ${entry.fileName} to the browser library. ${reason}`, { cause: error });
    }

    return storedEntry;
  }

  async deleteReplayEntry(id: string): Promise<void> {
    await this.backend.deleteReplayEntry(id);
  }

  async exportProfileSnapshot(): Promise<BrowserProfileSnapshot> {
    const [
      selection,
      preferences,
      recentSelections,
      levelProgressSummaries,
      levelSeedOverrides,
      replayEntries,
      importedDatFiles,
    ] = await Promise.all([
      this.loadSelection(),
      this.loadPreferences(),
      this.loadRecentSelections(),
      this.loadLevelProgressSummaries(),
      this.loadLevelSeedOverrides(),
      this.loadReplayEntries(),
      this.listImportedDatFiles(),
    ]);

    return {
      version: 1,
      selection,
      preferences,
      recentSelections,
      levelProgressSummaries,
      levelSeedOverrides,
      replayEntries: replayEntries.flatMap((entry) => entry.source === "reference" ? [] : [{
        id: entry.id,
        fileName: entry.fileName,
        seriesFile: entry.seriesFile,
        levelNumber: entry.levelNumber,
        levelName: entry.levelName,
        ruleset: entry.ruleset,
        replayFormat: entry.replayFormat,
        gameplayHash: entry.gameplayHash,
        savedAtMs: entry.savedAtMs,
        source: entry.source,
        result: entry.result,
        finalScore: entry.finalScore,
        undoUsedCount: entry.undoUsedCount,
        bytes: [...entry.bytes],
      }]),
      importedDatFiles: importedDatFiles.map((entry) => ({
        filename: entry.filename,
        datHash: entry.datHash,
        datBytes: [...entry.datBytes],
        source: entry.source,
      })),
    };
  }

  async importProfileSnapshot(snapshot: BrowserProfileSnapshot): Promise<void> {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported browser profile snapshot version: ${String((snapshot as { version?: unknown }).version)}`);
    }

    try {
      await this.backend.putValue(SELECTION_KEY, snapshot.selection);
    } catch {
      if (snapshot.selection) {
        await this.saveSelection(snapshot.selection);
      }
    }

    await this.savePreferences(parseStoredBrowserProfilePreferences(snapshot.preferences));

    try {
      await this.backend.putValue(RECENT_SELECTIONS_KEY, parseStoredRecentSelections(snapshot.recentSelections));
      await this.backend.putValue(LEVEL_PROGRESS_KEY, parseStoredLevelProgressSummaries(snapshot.levelProgressSummaries));
      await this.backend.putValue(LEVEL_SEED_OVERRIDES_KEY, parseStoredLevelSeedOverrides(snapshot.levelSeedOverrides));
    } catch {
      for (const entry of parseStoredLevelProgressSummaries(snapshot.levelProgressSummaries)) {
        await this.saveLevelProgressSummary(entry);
      }
      for (const entry of parseStoredLevelSeedOverrides(snapshot.levelSeedOverrides)) {
        await this.saveLevelSeedOverride(entry);
      }
    }

    await this.persistBestEffort(async () => {
      await this.backend.clearImportedDatFiles();
    });
    await this.persistBestEffort(async () => {
      await this.backend.clearReplayEntries();
    });

    for (const entry of snapshot.importedDatFiles) {
      await this.saveImportedDatFile({
        filename: entry.filename,
        datHash: entry.datHash,
        datBytes: Uint8Array.from(entry.datBytes),
        source: parseStoredImportedDatSource(entry.source),
      });
    }

    for (const entry of parseStoredReplayEntries(snapshot.replayEntries)) {
      try {
        await this.backend.saveReplayEntry(entry);
      } catch {
        await this.saveReplayEntry({
          fileName: entry.fileName,
          seriesFile: entry.seriesFile,
          levelNumber: entry.levelNumber,
          levelName: entry.levelName,
          ruleset: entry.ruleset,
          replayFormat: entry.replayFormat,
          source: entry.source,
          result: entry.result,
          finalScore: entry.finalScore,
          undoUsedCount: entry.undoUsedCount,
          bytes: entry.bytes,
        });
      }
    }
  }
}
