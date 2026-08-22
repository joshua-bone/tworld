export const IMPORT_DATABASE_NAME = "tworld-browser-profile";
export const IMPORT_DATABASE_VERSION = 2;
export const PROFILE_KV_STORE_NAME = "kv";
export const IMPORT_STORE_NAME = "imports";
export const PROFILE_REPLAY_STORE_NAME = "replays";
export const MAX_DAT_BYTES = 16 * 1024 * 1024;

const PROFILE_STORE_SCHEMAS = Object.freeze([
  Object.freeze({ name: PROFILE_KV_STORE_NAME, keyPath: "key" }),
  Object.freeze({ name: IMPORT_STORE_NAME, keyPath: "filename" }),
  Object.freeze({ name: PROFILE_REPLAY_STORE_NAME, keyPath: "id" }),
]);

function datByteView(bytes) {
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : ArrayBuffer.isView(bytes)
          ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          : null;
  if (!view) throw new TypeError("DAT bytes must be an ArrayBuffer or typed-array view");
  if (view.byteLength > MAX_DAT_BYTES) {
    throw new RangeError(`DAT exceeds the ${MAX_DAT_BYTES}-byte import limit`);
  }
  return view;
}

function cloneBytes(bytes) {
  const view = datByteView(bytes);
  return view.slice().buffer;
}

function requireDatExtension(filename) {
  if (!/\.dat$/i.test(filename.trim())) {
    throw new TypeError("HybridCC player imports .dat files only");
  }
}

export function sanitizeDatFilename(value) {
  let filename = typeof value === "string" ? value.trim() : "";
  if (filename === "") filename = "Imported.dat";
  filename = filename.replaceAll(/[\\/]/g, "-").replaceAll(/\s+/g, " ").trim();
  if (filename === "") filename = "Imported.dat";
  if (!/\.dat$/i.test(filename)) filename += ".dat";
  return filename;
}

export async function datSha256(bytes, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle?.digest) {
    throw new Error("Web Crypto SHA-256 is required to store DAT imports");
  }
  const digest = await cryptoProvider.subtle.digest("SHA-256", datByteView(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function openDatabase(indexedDBFactory) {
  if (!indexedDBFactory?.open) {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDBFactory.open(IMPORT_DATABASE_NAME, IMPORT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      // HybridCC can be the first same-origin application to open this shared
      // database. Create the complete Tile World v2 schema so a later Tile
      // World open at the same version never inherits a partially initialized
      // profile.
      for (const { name, keyPath } of PROFILE_STORE_SCHEMAS) {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath });
        }
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open DAT import storage"));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult(request, message) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error(message));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionComplete(transaction, message) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error(message));
    transaction.onabort = () => reject(transaction.error ?? new Error(message));
  });
}

function normalizeSource(source) {
  if (
    source?.kind === "bitbusters-custom-pack" &&
    (source.game === "CC1" || source.game === "CC2") &&
    Number.isInteger(source.packId) &&
    source.packId > 0
  ) {
    return Object.freeze({
      kind: source.kind,
      game: source.game,
      packId: source.packId,
    });
  }
  return undefined;
}

function normalizeRecord(record) {
  if (!record || typeof record.filename !== "string" || record.filename === "") return null;
  const datBytes = cloneBytes(record.datBytes);

  const datHash =
    typeof record.datHash === "string" && /^[0-9a-f]{64}$/.test(record.datHash)
      ? record.datHash
      : undefined;
  const source = normalizeSource(record.source);
  return Object.freeze({
    filename: record.filename,
    ...(datHash ? { datHash } : {}),
    datBytes,
    ...(source ? { source } : {}),
  });
}

/**
 * Read and write the same DAT records as Tile World Online. This module is the
 * only browser-storage seam; the UI and engine adapters never use localStorage
 * and never expose native HybridCC files as import choices.
 */
export function createIndexedDbDatSource({
  indexedDBFactory = globalThis.indexedDB,
  cryptoProvider = globalThis.crypto,
} = {}) {
  let recordErrors = [];
  return Object.freeze({
    async list() {
      const database = await openDatabase(indexedDBFactory);
      try {
        const transaction = database.transaction(IMPORT_STORE_NAME, "readonly");
        const records = await requestResult(
          transaction.objectStore(IMPORT_STORE_NAME).getAll(),
          "Could not read stored DAT files",
        );
        const unique = new Map();
        const nextErrors = [];
        for (const rawRecord of records ?? []) {
          try {
            const record = normalizeRecord(rawRecord);
            if (record) {
              unique.set(record.filename, record);
            } else {
              nextErrors.push({
                filename:
                  typeof rawRecord?.filename === "string" && rawRecord.filename !== ""
                    ? rawRecord.filename
                    : "Stored DAT record",
                message: "Stored DAT record is malformed and was skipped",
              });
            }
          } catch (error) {
            const filename =
              typeof rawRecord?.filename === "string" && rawRecord.filename !== ""
                ? rawRecord.filename
                : "Stored DAT record";
            nextErrors.push({
              filename,
              message: `${filename}: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
        recordErrors = nextErrors;
        return [...unique.values()].sort((left, right) =>
          left.filename.localeCompare(right.filename),
        );
      } finally {
        database.close();
      }
    },

    async getErrors() {
      return recordErrors.map((error) => ({ ...error }));
    },

    async putFile(file) {
      if (!file || typeof file.arrayBuffer !== "function") {
        throw new TypeError("Choose a DAT file to import");
      }
      const rawName = typeof file.name === "string" ? file.name : "";
      requireDatExtension(rawName);
      if (Number.isFinite(file.size) && file.size > MAX_DAT_BYTES) {
        throw new RangeError(`DAT exceeds the ${MAX_DAT_BYTES}-byte import limit`);
      }

      const filename = sanitizeDatFilename(rawName);
      const datBytes = cloneBytes(await file.arrayBuffer());
      const datHash = await datSha256(datBytes, cryptoProvider);
      const record = Object.freeze({ filename, datHash, datBytes });

      const database = await openDatabase(indexedDBFactory);
      try {
        const transaction = database.transaction(IMPORT_STORE_NAME, "readwrite");
        transaction.objectStore(IMPORT_STORE_NAME).put(record);
        await transactionComplete(transaction, `Could not store ${filename}`);
      } finally {
        database.close();
      }
      return record;
    },
  });
}
