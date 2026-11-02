import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import { IndexedDbBrowserProfileStore } from "@player-web/impl/IndexedDbBrowserProfileStore";
import type { ProfileKvKey } from "@player-web/impl/browserProfilePersistence";
import { createDefaultBrowserProfilePreferences } from "@player-web/ports/BrowserProfileStore";

/** Private dashboard playback has no durable profile backend or replay library. */
export function createPrivateReplayProfile(): IndexedDbBrowserProfileStore {
  const values = new Map<ProfileKvKey, unknown>();
  const imports = new Map<string, PersistedImportedDatFile>();
  const store = new IndexedDbBrowserProfileStore({
    getValue: async (key) => values.get(key),
    putValue: async (key, value) => { values.set(key, value); },
    listImportedDatFiles: async () => [...imports.values()],
    saveImportedDatFile: async (entry) => { imports.set(entry.filename, entry); },
    deleteImportedDatFile: async (name) => { imports.delete(name); },
    clearImportedDatFiles: async () => { imports.clear(); },
    listReplayEntries: async () => [],
    saveReplayEntry: async () => { throw new Error("Private replay viewing does not save to the browser library. Download from the owner dashboard."); },
    deleteReplayEntry: async () => {},
    clearReplayEntries: async () => {},
  });
  // Do not migrate the durable legacy selection into this isolated profile.
  store.loadSelection = async () => (values.get("selection") as Awaited<ReturnType<typeof store.loadSelection>>) ?? null;
  store.loadPreferences = async () => ({
    ...createDefaultBrowserProfilePreferences(),
    autoSaveWinningHighScoreReplays: false,
    autoDownloadReplaysOnSave: false,
  });
  return store;
}
