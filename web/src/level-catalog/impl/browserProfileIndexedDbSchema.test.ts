import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  BROWSER_PROFILE_DATABASE_BLOCKED_MESSAGE,
  BROWSER_PROFILE_DATABASE_NAME,
  BROWSER_PROFILE_DATABASE_VERSION,
  BROWSER_PROFILE_STORE_NAMES,
  openBrowserProfileDatabase,
} from "@level-catalog/impl/browserProfileIndexedDbSchema";
import { IndexedDbImportedDatCatalogStore } from "@level-catalog/impl/IndexedDbImportedDatCatalogStore";
import { IndexedDbBrowserProfileBackend } from "@player-web/impl/browserProfilePersistence";
import type { BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";

const IMPORTED_DAT = {
  filename: "Imported.dat",
  datHash: "hash:imported",
  datBytes: Uint8Array.from([1, 2, 3, 4]),
} as const;

const REPLAY_ENTRY = {
  id: "replay-1",
  fileName: "CCLP1-level-1.tws.bin",
  seriesFile: "CCLP1.dac",
  levelNumber: 1,
  levelName: "Key Pyramid",
  ruleset: "Lynx",
  savedAtMs: 1234,
  source: "saved-run",
  result: "completed-clean",
  finalScore: 1000,
  undoUsedCount: 0,
  bytes: Uint8Array.from([5, 6, 7, 8]),
} satisfies BrowserReplayEntry;

function openDatabase(
  indexedDbApi: IDBFactory,
  version: number,
  upgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDbApi.open(BROWSER_PROFILE_DATABASE_NAME, version);
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open test IndexedDB."));
    };
    request.onblocked = () => {
      reject(new Error("Test IndexedDB upgrade was blocked."));
    };
    request.onupgradeneeded = () => {
      upgrade?.(request.result);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function putIncompleteV2Import(database: IDBDatabase): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(BROWSER_PROFILE_STORE_NAMES.imports, "readwrite");
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Failed to seed incomplete v2 IndexedDB."));
    };
    transaction.objectStore(BROWSER_PROFILE_STORE_NAMES.imports).put({
      filename: IMPORTED_DAT.filename,
      datHash: IMPORTED_DAT.datHash,
      datBytes: IMPORTED_DAT.datBytes.buffer.slice(0),
    });
  });
}

describe("browser profile IndexedDB schema", () => {
  it.each(["imports-first", "profile-first"] as const)(
    "creates every store when fresh import and profile callers open concurrently (%s)",
    async (openerOrder) => {
      const indexedDbApi = new FakeIDBFactory();
      const importsStore = new IndexedDbImportedDatCatalogStore(indexedDbApi);
      const profileBackend = new IndexedDbBrowserProfileBackend(indexedDbApi);

      const saveImport = () => importsStore.saveImportedDatFile(IMPORTED_DAT);
      const saveProfile = () => Promise.all([
        profileBackend.putValue("selection", { seriesFile: "CCLP1.dac", levelNumber: 1 }),
        profileBackend.saveReplayEntry(REPLAY_ENTRY),
      ]);
      const operations = openerOrder === "imports-first"
        ? [saveImport(), saveProfile()]
        : [saveProfile(), saveImport()];

      await Promise.all(operations);

      expect(await importsStore.listImportedDatFiles()).toEqual([IMPORTED_DAT]);
      expect(await profileBackend.getValue("selection")).toEqual({
        seriesFile: "CCLP1.dac",
        levelNumber: 1,
      });
      expect(await profileBackend.listReplayEntries()).toEqual([REPLAY_ENTRY]);
    },
  );

  it("upgrades an imports-only v2 database to v3 without losing imported DAT data", async () => {
    const indexedDbApi = new FakeIDBFactory();
    const incompleteDatabase = await openDatabase(indexedDbApi, 2, (database) => {
      database.createObjectStore(BROWSER_PROFILE_STORE_NAMES.imports, { keyPath: "filename" });
    });
    await putIncompleteV2Import(incompleteDatabase);
    incompleteDatabase.close();

    const importsStore = new IndexedDbImportedDatCatalogStore(indexedDbApi);
    const profileBackend = new IndexedDbBrowserProfileBackend(indexedDbApi);
    const readPreservedImport = importsStore.listImportedDatFiles();
    const writeNewProfileStores = Promise.all([
      profileBackend.putValue("selection", { seriesFile: "CCLP1.dac", levelNumber: 2 }),
      profileBackend.saveReplayEntry(REPLAY_ENTRY),
    ]);

    await expect(readPreservedImport).resolves.toEqual([IMPORTED_DAT]);
    await writeNewProfileStores;

    const upgradedDatabase = await openDatabase(indexedDbApi, BROWSER_PROFILE_DATABASE_VERSION);
    expect(upgradedDatabase.version).toBe(BROWSER_PROFILE_DATABASE_VERSION);
    expect(Array.from(upgradedDatabase.objectStoreNames)).toEqual([
      BROWSER_PROFILE_STORE_NAMES.imports,
      BROWSER_PROFILE_STORE_NAMES.kv,
      BROWSER_PROFILE_STORE_NAMES.replays,
    ]);
    upgradedDatabase.close();
    expect(await profileBackend.getValue("selection")).toEqual({
      seriesFile: "CCLP1.dac",
      levelNumber: 2,
    });
    expect(await profileBackend.listReplayEntries()).toEqual([REPLAY_ENTRY]);
  });

  it("fails promptly with recovery instructions when an older tab blocks the v3 upgrade", async () => {
    const indexedDbApi = new FakeIDBFactory();
    const olderTabDatabase = await openDatabase(indexedDbApi, 2, (database) => {
      database.createObjectStore(BROWSER_PROFILE_STORE_NAMES.imports, { keyPath: "filename" });
    });

    await expect(
      openBrowserProfileDatabase(indexedDbApi, "Failed to open test browser profile database."),
    ).rejects.toThrow(BROWSER_PROFILE_DATABASE_BLOCKED_MESSAGE);

    olderTabDatabase.close();
  });

  it("closes its connection when a later database version needs to upgrade", async () => {
    const indexedDbApi = new FakeIDBFactory();
    const currentDatabase = await openBrowserProfileDatabase(
      indexedDbApi,
      "Failed to open test browser profile database.",
    );

    const futureDatabase = await openDatabase(
      indexedDbApi,
      BROWSER_PROFILE_DATABASE_VERSION + 1,
    );

    expect(currentDatabase.version).toBe(BROWSER_PROFILE_DATABASE_VERSION);
    expect(futureDatabase.version).toBe(BROWSER_PROFILE_DATABASE_VERSION + 1);
    futureDatabase.close();
  });
});
