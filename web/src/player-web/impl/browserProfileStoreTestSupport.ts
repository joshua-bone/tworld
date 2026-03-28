import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import type { BrowserProfilePersistenceBackend } from "@player-web/impl/IndexedDbBrowserProfileStore";
import type { BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";

export class MemoryBrowserProfilePersistenceBackend implements BrowserProfilePersistenceBackend {
  readonly values = new Map<string, unknown>();
  readonly importedFiles = new Map<string, PersistedImportedDatFile>();
  readonly replayEntries = new Map<string, BrowserReplayEntry>();

  async getValue(
    key: "selection" | "preferences" | "recentSelections" | "levelProgress" | "levelSeedOverrides",
  ): Promise<unknown> {
    return this.values.get(key);
  }

  async putValue(
    key: "selection" | "preferences" | "recentSelections" | "levelProgress" | "levelSeedOverrides",
    value: unknown,
  ): Promise<void> {
    this.values.set(key, value);
  }

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    return [...this.importedFiles.values()].map((entry) => ({
      filename: entry.filename,
      datHash: entry.datHash,
      datBytes: new Uint8Array(entry.datBytes),
      source: entry.source,
    }));
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    this.importedFiles.set(entry.filename, {
      filename: entry.filename,
      datHash: entry.datHash,
      datBytes: new Uint8Array(entry.datBytes),
      source: entry.source,
    });
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    this.importedFiles.delete(filename);
  }

  async clearImportedDatFiles(): Promise<void> {
    this.importedFiles.clear();
  }

  async listReplayEntries(): Promise<BrowserReplayEntry[]> {
    return [...this.replayEntries.values()]
      .map((entry) => ({
        ...entry,
        bytes: new Uint8Array(entry.bytes),
      }))
      .sort((left, right) => right.savedAtMs - left.savedAtMs);
  }

  async saveReplayEntry(entry: BrowserReplayEntry): Promise<void> {
    this.replayEntries.set(entry.id, {
      ...entry,
      bytes: new Uint8Array(entry.bytes),
    });
  }

  async deleteReplayEntry(id: string): Promise<void> {
    this.replayEntries.delete(id);
  }

  async clearReplayEntries(): Promise<void> {
    this.replayEntries.clear();
  }
}

export class FailingReplaySaveBackend extends MemoryBrowserProfilePersistenceBackend {
  override async saveReplayEntry(_entry: BrowserReplayEntry): Promise<void> {
    throw new Error("IndexedDB write failed.");
  }
}
