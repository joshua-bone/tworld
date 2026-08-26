export const BROWSER_PROFILE_DATABASE_NAME = "tworld-browser-profile";
export const BROWSER_PROFILE_DATABASE_VERSION = 3;
export const BROWSER_PROFILE_DATABASE_BLOCKED_MESSAGE = [
  "Tile World could not upgrade its browser profile database because another Tile World tab is still using an older version.",
  "Close other Tile World tabs and reload this page.",
].join(" ");

export const BROWSER_PROFILE_STORE_NAMES = {
  imports: "imports",
  kv: "kv",
  replays: "replays",
} as const;

export function upgradeBrowserProfileDatabase(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(BROWSER_PROFILE_STORE_NAMES.kv)) {
    database.createObjectStore(BROWSER_PROFILE_STORE_NAMES.kv, { keyPath: "key" });
  }
  if (!database.objectStoreNames.contains(BROWSER_PROFILE_STORE_NAMES.imports)) {
    database.createObjectStore(BROWSER_PROFILE_STORE_NAMES.imports, { keyPath: "filename" });
  }
  if (!database.objectStoreNames.contains(BROWSER_PROFILE_STORE_NAMES.replays)) {
    database.createObjectStore(BROWSER_PROFILE_STORE_NAMES.replays, { keyPath: "id" });
  }
}

export function openBrowserProfileDatabase(
  indexedDbApi: IDBFactory,
  fallbackErrorMessage: string,
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDbApi.open(
      BROWSER_PROFILE_DATABASE_NAME,
      BROWSER_PROFILE_DATABASE_VERSION,
    );
    request.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      reject(request.error ?? new Error(fallbackErrorMessage));
    };
    request.onblocked = () => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(BROWSER_PROFILE_DATABASE_BLOCKED_MESSAGE));
    };
    request.onupgradeneeded = () => {
      upgradeBrowserProfileDatabase(request.result);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
      };
      resolve(database);
    };
  });
}
