import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { BrowserProfileStore } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelectionStore } from "@player-web/ports/PlayableSelectionStore";

export function createUrlLaunchDatBytes(): Uint8Array {
  return Uint8Array.from([
    0xac, 0xaa, 0x02, 0x00, 0x01, 0x00,
    0x11, 0x00,
    0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01,
    0x01, 0x00, 0x00,
    0x03, 0x00, 0x03, 0x01, 0x41, 0x04, 0x06, 0x04, 0xd8, 0xdb, 0xda, 0xdd,
  ]);
}

export type UrlLaunchTestServices = Pick<BrowserAppServices, "importDatBytes" | "profileStore" | "selectionStore"> & {
  __imports: PersistedImportedDatFile[];
  __savedSelections: { seriesFile: string; levelNumber: number }[];
};

export function createUrlLaunchServices(overrides?: {
  importedDatFiles?: PersistedImportedDatFile[];
}): UrlLaunchTestServices {
  const importedDatFiles = overrides?.importedDatFiles ?? [];
  const imports: PersistedImportedDatFile[] = [];
  const savedSelections: { seriesFile: string; levelNumber: number }[] = [];

  const profileStore = {
    async listImportedDatFiles() {
      return importedDatFiles;
    },
  } as BrowserProfileStore;

  const selectionStore = {
    async saveSelection(selection) {
      savedSelections.push(selection);
    },
  } as PlayableSelectionStore;

  return {
    async importDatBytes(filename, datBytes, source) {
      const importedEntry = {
        filename,
        datBytes: new Uint8Array(datBytes),
        ...(source ? { source } : {}),
      } satisfies PersistedImportedDatFile;
      imports.push(importedEntry);
      const existingIndex = importedDatFiles.findIndex((entry) => entry.filename === filename);
      if (existingIndex >= 0) {
        importedDatFiles.splice(existingIndex, 1, importedEntry);
      } else {
        importedDatFiles.push(importedEntry);
      }
      return [];
    },
    profileStore: profileStore as BrowserAppServices["profileStore"],
    selectionStore: selectionStore as BrowserAppServices["selectionStore"],
    get __imports() {
      return imports;
    },
    get __savedSelections() {
      return savedSelections;
    },
  };
}

export function createFetchResponse(bytes: Uint8Array, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as Response;
}

export function createJsonResponse(value: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => value,
  } as Response;
}
