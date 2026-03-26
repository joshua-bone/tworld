import type {
  ImportedDatCatalogStore,
  PersistedImportedDatFile,
  PersistedImportedDatSource,
} from "@level-catalog/ports/ImportedDatCatalogStore";

const PROFILE_DB_NAME = "tworld-browser-profile";
const PROFILE_DB_VERSION = 2;
const IMPORTS_STORE_NAME = "imports";

interface ImportedDatRecord {
  filename: string;
  datHash?: string;
  datBytes: ArrayBuffer;
  source?: PersistedImportedDatSource;
}

function cloneBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export class IndexedDbImportedDatCatalogStore implements ImportedDatCatalogStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDbApi: IDBFactory = indexedDB) {}

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) {
      return this.databasePromise;
    }

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDbApi.open(PROFILE_DB_NAME, PROFILE_DB_VERSION);
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open imported DAT IndexedDB."));
      };
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(IMPORTS_STORE_NAME)) {
          database.createObjectStore(IMPORTS_STORE_NAME, { keyPath: "filename" });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
    });

    return this.databasePromise;
  }

  private async transact<T>(
    mode: IDBTransactionMode,
    run: (
      store: IDBObjectStore,
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
    ) => void,
  ): Promise<T> {
    const database = await this.openDatabase();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(IMPORTS_STORE_NAME, mode);
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Imported DAT IndexedDB transaction failed."));
      };
      const store = transaction.objectStore(IMPORTS_STORE_NAME);
      run(store, resolve, reject);
    });
  }

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    return this.transact<PersistedImportedDatFile[]>("readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to list imported DAT files."));
      };
      request.onsuccess = () => {
        const records = (request.result as ImportedDatRecord[] | undefined) ?? [];
        resolve(records.map((record) => ({
          filename: record.filename,
          datHash: record.datHash,
          datBytes: new Uint8Array(record.datBytes),
          source: record.source,
        })));
      };
    });
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    await this.transact<void>("readwrite", (store, resolve, reject) => {
      const request = store.put({
        filename: entry.filename,
        datHash: entry.datHash,
        datBytes: cloneBytes(entry.datBytes),
        source: entry.source,
      } satisfies ImportedDatRecord);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to save imported DAT ${entry.filename}.`));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    await this.transact<void>("readwrite", (store, resolve, reject) => {
      const request = store.delete(filename);
      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to delete imported DAT ${filename}.`));
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }
}
