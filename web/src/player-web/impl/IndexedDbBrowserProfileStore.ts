import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import { normalizeLegacyRandomSeed } from "@player-web/impl/levelSeedOverrides";
import { mergeLevelProgressSummaries } from "@player-web/impl/levelProgress";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import {
  type BrowserLevelSeedOverride,
  type BrowserLevelProgressSummary,
  type BrowserReplayEntry,
  type BrowserReplaySaveRequest,
  type BrowserReplaySource,
  createDefaultBrowserProfilePreferences,
  type BrowserRecentSelectionRecord,
  type BrowserProfileSnapshot,
  type BrowserProfilePreferences,
  type BrowserProfileStore,
  type BrowserPreferredRuleset,
} from "@player-web/ports/BrowserProfileStore";

const PROFILE_DB_NAME = "tworld-browser-profile";
const PROFILE_DB_VERSION = 2;
const KV_STORE_NAME = "kv";
const IMPORTS_STORE_NAME = "imports";
const REPLAYS_STORE_NAME = "replays";
const SELECTION_KEY = "selection";
const PREFERENCES_KEY = "preferences";
const RECENT_SELECTIONS_KEY = "recentSelections";
const LEVEL_PROGRESS_KEY = "levelProgress";
const LEVEL_SEED_OVERRIDES_KEY = "levelSeedOverrides";
const LEGACY_SELECTION_STORAGE_KEY = "tworld:web:selection";
const MAX_RECENT_SELECTIONS = 6;

type ProfileKvKey =
  | typeof SELECTION_KEY
  | typeof PREFERENCES_KEY
  | typeof RECENT_SELECTIONS_KEY
  | typeof LEVEL_PROGRESS_KEY
  | typeof LEVEL_SEED_OVERRIDES_KEY;

interface BrowserProfileKvRecord {
  key: ProfileKvKey;
  value: unknown;
}

interface BrowserProfileImportRecord {
  filename: string;
  datHash?: string;
  datBytes: ArrayBuffer;
}

interface BrowserProfileReplayRecord {
  id: string;
  fileName: string;
  seriesFile: string;
  levelNumber: number;
  levelName: string;
  ruleset: BrowserPreferredRuleset;
  savedAtMs: number;
  source: BrowserReplaySource;
  result: BrowserLevelProgressSummary["bestResult"] | null;
  finalScore: number | null;
  undoUsedCount: number | null;
  bytes: ArrayBuffer;
}

export interface BrowserProfilePersistenceBackend {
  getValue(key: ProfileKvKey): Promise<unknown>;
  putValue(key: ProfileKvKey, value: unknown): Promise<void>;
  listImportedDatFiles(): Promise<PersistedImportedDatFile[]>;
  saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void>;
  deleteImportedDatFile(filename: string): Promise<void>;
  clearImportedDatFiles(): Promise<void>;
  listReplayEntries(): Promise<BrowserReplayEntry[]>;
  saveReplayEntry(entry: BrowserReplayEntry): Promise<void>;
  deleteReplayEntry(id: string): Promise<void>;
  clearReplayEntries(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStoredSelection(value: unknown): PlayableSelection | null {
  if (!isRecord(value) || typeof value.seriesFile !== "string" || !Number.isInteger(value.levelNumber)) {
    return null;
  }

  return {
    seriesFile: value.seriesFile,
    levelNumber: value.levelNumber as number,
  };
}

function compareRecentSelections(
  left: BrowserRecentSelectionRecord,
  right: BrowserRecentSelectionRecord,
): number {
  return right.savedAtMs - left.savedAtMs;
}

function parseStoredRecentSelections(value: unknown): BrowserRecentSelectionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (!isRecord(entry) || !Number.isFinite(entry.savedAtMs)) {
        return [];
      }

      const selection = parseStoredSelection(entry.selection);
      if (!selection) {
        return [];
      }

      return [
        {
          selection,
          savedAtMs: entry.savedAtMs as number,
        } satisfies BrowserRecentSelectionRecord,
      ];
    })
    .sort(compareRecentSelections);
}

function isLevelRunResult(value: unknown): value is BrowserLevelProgressSummary["bestResult"] {
  return (
    value === "failed" ||
    value === "completed" ||
    value === "completed-with-undo" ||
    value === "completed-clean"
  );
}

function normalizeLevelRunResult(
  value: BrowserLevelProgressSummary["bestResult"] | "completed",
): BrowserLevelProgressSummary["bestResult"] {
  return value === "completed" ? "completed-clean" : value;
}

function isBrowserReplaySource(value: unknown): value is BrowserReplaySource {
  return value === "saved-run" || value === "imported-file";
}

function isBrowserPreferredRuleset(value: unknown): value is BrowserPreferredRuleset {
  return value === "MS" || value === "Lynx";
}

function parseStoredReplayResult(value: unknown): BrowserLevelProgressSummary["bestResult"] | null {
  return value === null || value === undefined
    ? null
    : isLevelRunResult(value)
      ? normalizeLevelRunResult(value)
      : null;
}

function parseStoredLevelProgressSummaries(value: unknown): BrowserLevelProgressSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (
        !isRecord(entry) ||
        !isBrowserPreferredRuleset(entry.ruleset) ||
        typeof entry.gameplayHash !== "string" ||
        !Number.isFinite(entry.lastPlayedAtMs) ||
        !isLevelRunResult(entry.lastResult) ||
        !isLevelRunResult(entry.bestResult) ||
        !Number.isFinite(entry.lastElapsedTicks) ||
        !Number.isFinite(entry.bestElapsedTicks)
      ) {
        return [];
      }

      return [
        {
          ruleset: entry.ruleset,
          gameplayHash: entry.gameplayHash,
          lastPlayedAtMs: entry.lastPlayedAtMs as number,
          lastResult: normalizeLevelRunResult(entry.lastResult),
          bestResult: normalizeLevelRunResult(entry.bestResult),
          lastElapsedTicks: Number(entry.lastElapsedTicks),
          bestElapsedTicks: Number(entry.bestElapsedTicks),
          lastUndoUsedCount: Number.isInteger(entry.lastUndoUsedCount) ? Number(entry.lastUndoUsedCount) : 0,
          bestUndoUsedCount: Number.isInteger(entry.bestUndoUsedCount) ? Number(entry.bestUndoUsedCount) : 0,
        } satisfies BrowserLevelProgressSummary,
      ];
    })
    .sort((left, right) => right.lastPlayedAtMs - left.lastPlayedAtMs);
}

function parseStoredLevelSeedOverrides(value: unknown): BrowserLevelSeedOverride[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.seriesFile !== "string" ||
      !Number.isInteger(entry.levelNumber) ||
      !isBrowserPreferredRuleset(entry.ruleset) ||
      !Number.isFinite(entry.randomSeed)
    ) {
      return [];
    }

    return [
      {
        seriesFile: entry.seriesFile,
        levelNumber: Number(entry.levelNumber),
        ruleset: entry.ruleset,
        randomSeed: normalizeLegacyRandomSeed(Number(entry.randomSeed)),
      } satisfies BrowserLevelSeedOverride,
    ];
  });
}

function parseStoredReplayEntries(value: unknown): BrowserReplayEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== "string" ||
        typeof entry.fileName !== "string" ||
        typeof entry.seriesFile !== "string" ||
        !Number.isInteger(entry.levelNumber) ||
        typeof entry.levelName !== "string" ||
        !isBrowserPreferredRuleset(entry.ruleset) ||
        !Number.isFinite(entry.savedAtMs) ||
        !isBrowserReplaySource(entry.source)
      ) {
        return [];
      }

      const bytes =
        entry.bytes instanceof Uint8Array
          ? cloneBytes(entry.bytes)
          : Array.isArray(entry.bytes)
            ? Uint8Array.from(entry.bytes.flatMap((value) => (Number.isInteger(value) ? [Number(value)] : [])))
            : entry.bytes instanceof ArrayBuffer
              ? new Uint8Array(entry.bytes)
              : null;
      if (!bytes) {
        return [];
      }

      return [
        {
          id: entry.id,
          fileName: entry.fileName,
          seriesFile: entry.seriesFile,
          levelNumber: entry.levelNumber as number,
          levelName: entry.levelName,
          ruleset: entry.ruleset,
          savedAtMs: entry.savedAtMs as number,
          source: entry.source,
          result: parseStoredReplayResult(entry.result),
          finalScore: Number.isFinite(entry.finalScore) ? Number(entry.finalScore) : null,
          undoUsedCount: Number.isInteger(entry.undoUsedCount) ? Number(entry.undoUsedCount) : null,
          bytes,
        } satisfies BrowserReplayEntry,
      ];
    })
    .sort((left, right) => right.savedAtMs - left.savedAtMs);
}

export function parseStoredBrowserProfilePreferences(value: unknown): BrowserProfilePreferences {
  const defaults = createDefaultBrowserProfilePreferences();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    uiMode: value.uiMode === "classic" ? "classic" : defaults.uiMode,
    defaultRuleset: value.defaultRuleset === "Lynx" ? "Lynx" : defaults.defaultRuleset,
    autoSaveWinningHighScoreReplays:
      typeof value.autoSaveWinningHighScoreReplays === "boolean"
        ? value.autoSaveWinningHighScoreReplays
        : defaults.autoSaveWinningHighScoreReplays,
    autoDownloadReplaysOnSave:
      typeof value.autoDownloadReplaysOnSave === "boolean"
        ? value.autoDownloadReplaysOnSave
        : defaults.autoDownloadReplaysOnSave,
  };
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function createReplayEntryId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `replay-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sameSelection(left: PlayableSelection, right: PlayableSelection): boolean {
  return left.seriesFile === right.seriesFile && left.levelNumber === right.levelNumber;
}

function mergeRecentSelections(
  existing: readonly BrowserRecentSelectionRecord[],
  selection: PlayableSelection,
  savedAtMs: number,
): BrowserRecentSelectionRecord[] {
  return [
    {
      selection,
      savedAtMs,
    },
    ...existing.filter((entry) => !sameSelection(entry.selection, selection)),
  ]
    .sort(compareRecentSelections)
    .slice(0, MAX_RECENT_SELECTIONS);
}

class IndexedDbBrowserProfileBackend implements BrowserProfilePersistenceBackend {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) {
      return this.databasePromise;
    }

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const indexedDbApi =
        typeof indexedDB !== "undefined"
          ? indexedDB
          : typeof window !== "undefined" && "indexedDB" in window
            ? window.indexedDB
            : null;
      if (!indexedDbApi) {
        reject(new Error("IndexedDB is unavailable in this environment."));
        return;
      }

      const request = indexedDbApi.open(PROFILE_DB_NAME, PROFILE_DB_VERSION);
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open browser profile database."));
      };
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(KV_STORE_NAME)) {
          database.createObjectStore(KV_STORE_NAME, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(IMPORTS_STORE_NAME)) {
          database.createObjectStore(IMPORTS_STORE_NAME, { keyPath: "filename" });
        }
        if (!database.objectStoreNames.contains(REPLAYS_STORE_NAME)) {
          database.createObjectStore(REPLAYS_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
    });

    return this.databasePromise;
  }

  private async transact<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void,
  ): Promise<T> {
    const database = await this.openDatabase();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      operation(store, resolve, (error) => {
        reject(error);
      });
      transaction.onerror = () => {
        reject(transaction.error ?? new Error(`IndexedDB transaction failed for ${storeName}.`));
      };
    });
  }

  async getValue(key: ProfileKvKey): Promise<unknown> {
    return this.transact<unknown>(KV_STORE_NAME, "readonly", (store, resolve, reject) => {
      const request = store.get(key);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to read ${key} from browser profile database.`));
      };
      request.onsuccess = () => {
        const record = request.result as BrowserProfileKvRecord | undefined;
        resolve(record?.value);
      };
    });
  }

  async putValue(key: ProfileKvKey, value: unknown): Promise<void> {
    await this.transact<void>(KV_STORE_NAME, "readwrite", (store, resolve, reject) => {
      const request = store.put({ key, value } satisfies BrowserProfileKvRecord);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to write ${key} to browser profile database.`));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    return this.transact<PersistedImportedDatFile[]>(IMPORTS_STORE_NAME, "readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to list imported DAT files from browser profile database."));
      };
      request.onsuccess = () => {
        const records = (request.result as BrowserProfileImportRecord[] | undefined) ?? [];
        resolve(
          records.map((record) => ({
            filename: record.filename,
            datHash: typeof record.datHash === "string" ? record.datHash : undefined,
            datBytes: cloneBytes(new Uint8Array(record.datBytes)),
          })),
        );
      };
    });
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    const datBytes = cloneBytes(entry.datBytes);
    const datBuffer = new ArrayBuffer(datBytes.byteLength);
    new Uint8Array(datBuffer).set(datBytes);
    await this.transact<void>(IMPORTS_STORE_NAME, "readwrite", (store, resolve, reject) => {
      const request = store.put({
        filename: entry.filename,
        datHash: entry.datHash,
        datBytes: datBuffer,
      } satisfies BrowserProfileImportRecord);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to persist imported DAT file ${entry.filename}.`));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    await this.transact<void>(IMPORTS_STORE_NAME, "readwrite", (store, resolve, reject) => {
      const request = store.delete(filename);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to delete imported DAT file ${filename}.`));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async clearImportedDatFiles(): Promise<void> {
    await this.transact<void>(IMPORTS_STORE_NAME, "readwrite", (store, resolve, reject) => {
      const request = store.clear();
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to clear imported DAT files from browser profile database."));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async listReplayEntries(): Promise<BrowserReplayEntry[]> {
    return this.transact<BrowserReplayEntry[]>(REPLAYS_STORE_NAME, "readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to list replay entries from browser profile database."));
      };
      request.onsuccess = () => {
        const records = (request.result as BrowserProfileReplayRecord[] | undefined) ?? [];
        resolve(
          parseStoredReplayEntries(
            records.map((record) => ({
              ...record,
              bytes: new Uint8Array(record.bytes),
            })),
          ),
        );
      };
    });
  }

  async saveReplayEntry(entry: BrowserReplayEntry): Promise<void> {
    const bytes = cloneBytes(entry.bytes);
    const bytesBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(bytesBuffer).set(bytes);
    await this.transact<void>(REPLAYS_STORE_NAME, "readwrite", (store, resolve, reject) => {
      const request = store.put({
        id: entry.id,
        fileName: entry.fileName,
        seriesFile: entry.seriesFile,
        levelNumber: entry.levelNumber,
        levelName: entry.levelName,
        ruleset: entry.ruleset,
        savedAtMs: entry.savedAtMs,
        source: entry.source,
        result: entry.result,
        finalScore: entry.finalScore,
        undoUsedCount: entry.undoUsedCount,
        bytes: bytesBuffer,
      } satisfies BrowserProfileReplayRecord);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to persist replay ${entry.fileName}.`));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async deleteReplayEntry(id: string): Promise<void> {
    await this.transact<void>(REPLAYS_STORE_NAME, "readwrite", (store, resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to delete replay ${id}.`));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async clearReplayEntries(): Promise<void> {
    await this.transact<void>(REPLAYS_STORE_NAME, "readwrite", (store, resolve, reject) => {
      const request = store.clear();
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to clear replay entries from browser profile database."));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }
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

  async loadSelection(): Promise<PlayableSelection | null> {
    try {
      const stored = parseStoredSelection(await this.backend.getValue(SELECTION_KEY));
      if (stored) {
        return stored;
      }
    } catch {
      // Fall through to localStorage migration path.
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
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(LEGACY_SELECTION_STORAGE_KEY, JSON.stringify(selection));
        } catch {
          // Ignore storage failures and keep in-memory state.
        }
      }
    }
  }

  async recordRecentSelection(selection: PlayableSelection): Promise<void> {
    try {
      const recentSelections = parseStoredRecentSelections(await this.backend.getValue(RECENT_SELECTIONS_KEY));
      await this.backend.putValue(RECENT_SELECTIONS_KEY, mergeRecentSelections(recentSelections, selection, Date.now()));
    } catch {
      // Ignore persistence failures and keep gameplay flow uninterrupted.
    }
  }

  async loadPreferences(): Promise<BrowserProfilePreferences> {
    try {
      return parseStoredBrowserProfilePreferences(await this.backend.getValue(PREFERENCES_KEY));
    } catch {
      return createDefaultBrowserProfilePreferences();
    }
  }

  async savePreferences(preferences: BrowserProfilePreferences): Promise<void> {
    try {
      await this.backend.putValue(PREFERENCES_KEY, preferences);
    } catch {
      // Ignore preference persistence failures and keep in-memory state.
    }
  }

  async loadRecentSelections(): Promise<BrowserRecentSelectionRecord[]> {
    try {
      return parseStoredRecentSelections(await this.backend.getValue(RECENT_SELECTIONS_KEY));
    } catch {
      return [];
    }
  }

  async loadLevelProgressSummaries(): Promise<BrowserLevelProgressSummary[]> {
    try {
      return parseStoredLevelProgressSummaries(await this.backend.getValue(LEVEL_PROGRESS_KEY));
    } catch {
      return [];
    }
  }

  async saveLevelProgressSummary(summary: BrowserLevelProgressSummary): Promise<void> {
    try {
      const existing = parseStoredLevelProgressSummaries(await this.backend.getValue(LEVEL_PROGRESS_KEY));
      await this.backend.putValue(LEVEL_PROGRESS_KEY, mergeLevelProgressSummaries(existing, summary));
    } catch {
      // Ignore persistence failures and keep gameplay flow uninterrupted.
    }
  }

  async loadLevelSeedOverrides(): Promise<BrowserLevelSeedOverride[]> {
    try {
      return parseStoredLevelSeedOverrides(await this.backend.getValue(LEVEL_SEED_OVERRIDES_KEY));
    } catch {
      return [];
    }
  }

  async saveLevelSeedOverride(override: BrowserLevelSeedOverride): Promise<void> {
    try {
      const existing = parseStoredLevelSeedOverrides(await this.backend.getValue(LEVEL_SEED_OVERRIDES_KEY));
      const nextOverride = {
        ...override,
        randomSeed: normalizeLegacyRandomSeed(override.randomSeed),
      } satisfies BrowserLevelSeedOverride;
      const nextOverrides = [
        nextOverride,
        ...existing.filter(
          (entry) =>
            !(
              entry.seriesFile === nextOverride.seriesFile &&
              entry.levelNumber === nextOverride.levelNumber &&
              entry.ruleset === nextOverride.ruleset
            ),
        ),
      ];
      await this.backend.putValue(LEVEL_SEED_OVERRIDES_KEY, nextOverrides);
    } catch {
      // Ignore persistence failures and keep gameplay flow uninterrupted.
    }
  }

  async deleteLevelSeedOverride(
    target: Pick<BrowserLevelSeedOverride, "seriesFile" | "levelNumber" | "ruleset">,
  ): Promise<void> {
    try {
      const existing = parseStoredLevelSeedOverrides(await this.backend.getValue(LEVEL_SEED_OVERRIDES_KEY));
      await this.backend.putValue(
        LEVEL_SEED_OVERRIDES_KEY,
        existing.filter(
          (entry) =>
            !(
              entry.seriesFile === target.seriesFile &&
              entry.levelNumber === target.levelNumber &&
              entry.ruleset === target.ruleset
            ),
        ),
      );
    } catch {
      // Ignore persistence failures and keep gameplay flow uninterrupted.
    }
  }

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    try {
      return await this.backend.listImportedDatFiles();
    } catch {
      return [];
    }
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    try {
      await this.backend.saveImportedDatFile(entry);
    } catch {
      // Ignore persistence failures and keep the imported data in memory for this session.
    }
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

  async saveReplayEntry(entry: BrowserReplaySaveRequest): Promise<BrowserReplayEntry> {
    const storedEntry: BrowserReplayEntry = {
      id: createReplayEntryId(),
      fileName: entry.fileName,
      seriesFile: entry.seriesFile,
      levelNumber: entry.levelNumber,
      levelName: entry.levelName,
      ruleset: entry.ruleset,
      savedAtMs: Date.now(),
      source: entry.source,
      result: entry.result,
      finalScore: entry.finalScore,
      undoUsedCount: entry.undoUsedCount,
      bytes: cloneBytes(entry.bytes),
    };

    try {
      await this.backend.saveReplayEntry(storedEntry);
    } catch {
      // Ignore persistence failures and return the in-memory entry so the current UI flow can continue.
    }

    return storedEntry;
  }

  async deleteReplayEntry(id: string): Promise<void> {
    await this.backend.deleteReplayEntry(id);
  }

  async exportProfileSnapshot(): Promise<BrowserProfileSnapshot> {
    const [selection, preferences, recentSelections, levelProgressSummaries, levelSeedOverrides, replayEntries, importedDatFiles] =
      await Promise.all([
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
      replayEntries: replayEntries.map((entry) => ({
        id: entry.id,
        fileName: entry.fileName,
        seriesFile: entry.seriesFile,
        levelNumber: entry.levelNumber,
        levelName: entry.levelName,
        ruleset: entry.ruleset,
        savedAtMs: entry.savedAtMs,
        source: entry.source,
        result: entry.result,
        finalScore: entry.finalScore,
        undoUsedCount: entry.undoUsedCount,
        bytes: [...entry.bytes],
      })),
      importedDatFiles: importedDatFiles.map((entry) => ({
        filename: entry.filename,
        datHash: entry.datHash,
        datBytes: [...entry.datBytes],
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

    try {
      await this.backend.clearImportedDatFiles();
    } catch {
      // Ignore clear failures and attempt best-effort import.
    }
    try {
      await this.backend.clearReplayEntries();
    } catch {
      // Ignore clear failures and attempt best-effort import.
    }

    for (const entry of snapshot.importedDatFiles) {
      await this.saveImportedDatFile({
        filename: entry.filename,
        datHash: entry.datHash,
        datBytes: Uint8Array.from(entry.datBytes),
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
