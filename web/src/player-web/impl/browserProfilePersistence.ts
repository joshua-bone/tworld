import type {
  PersistedImportedDatFile,
  PersistedImportedDatSource,
} from "@level-catalog/ports/ImportedDatCatalogStore";
import {
  cloneBytes,
  parseStoredImportedDatSource,
  parseStoredReplayEntries,
} from "@player-web/impl/browserProfileCodecs";
import type { BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";

const PROFILE_DB_NAME = "tworld-browser-profile";
const PROFILE_DB_VERSION = 2;
const KV_STORE_NAME = "kv";
const IMPORTS_STORE_NAME = "imports";
const REPLAYS_STORE_NAME = "replays";

export const SELECTION_KEY = "selection";
export const PREFERENCES_KEY = "preferences";
export const RECENT_SELECTIONS_KEY = "recentSelections";
export const LEVEL_PROGRESS_KEY = "levelProgress";
export const LEVEL_SEED_OVERRIDES_KEY = "levelSeedOverrides";

export type ProfileKvKey =
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
  source?: PersistedImportedDatSource;
}

interface BrowserProfileReplayRecord {
  id: string;
  fileName: string;
  seriesFile: string;
  levelNumber: number;
  levelName: string;
  ruleset: BrowserReplayEntry["ruleset"];
  savedAtMs: number;
  source: BrowserReplayEntry["source"];
  result: BrowserReplayEntry["result"];
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

export class IndexedDbBrowserProfileBackend implements BrowserProfilePersistenceBackend {
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
      operation(store, resolve, reject);
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
            source: parseStoredImportedDatSource(record.source),
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
        source: entry.source,
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
