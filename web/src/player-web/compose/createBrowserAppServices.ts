import { WorkerBackedInteractiveGameEngine } from "@game-runtime/impl/WorkerBackedInteractiveGameEngine";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { StaticCharacterizationFixtureRepository } from "@oracle-fixtures/impl/StaticCharacterizationFixtureRepository";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import { computeDatContentHash } from "@player-web/impl/importedDatIdentity";
import { IndexedDbBrowserProfileStore } from "@player-web/impl/IndexedDbBrowserProfileStore";
import { BrowserReplayTransfer } from "@player-web/impl/BrowserReplayTransfer";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

export function createBrowserAppServices(): BrowserAppServices {
  const profileStore = new IndexedDbBrowserProfileStore();
  const levelRepository = new BrowserLevelRepository(profileStore);
  const workerEngine = typeof Worker === "undefined" ? null : new WorkerBackedInteractiveGameEngine();
  const directEngines = {
    MS: new MsGameEngineAdapter(levelRepository),
    Lynx: new LynxGameEngineAdapter(levelRepository),
  } as const;
  const engines = workerEngine
    ? {
        MS: workerEngine,
        Lynx: workerEngine,
      }
    : directEngines;

  const importDatBytes = async (filename: string, datBytes: Uint8Array) => {
    const datHash = await computeDatContentHash(datBytes);
    const entries = await levelRepository.importDatBytes(filename, datBytes, datHash);
    await workerEngine?.syncImportedDatFile({
      filename,
      datHash,
      datBytes: new Uint8Array(datBytes),
    });
    return entries;
  };

  return {
    fixtureRepository: new StaticCharacterizationFixtureRepository(),
    profileStore,
    selectionStore: profileStore,
    replayTransfer: new BrowserReplayTransfer(),
    engines,
    importDatFile: async (file) => importDatBytes(file.name, new Uint8Array(await file.arrayBuffer())),
    importDatBytes,
    deleteImportedDatFile: async (filename) => {
      await levelRepository.deleteImportedDatFile(filename);
      await workerEngine?.deleteImportedDatFile(filename);
    },
    listImportedCatalogEntries: async () => levelRepository.listImportedCatalogEntries(),
  };
}
