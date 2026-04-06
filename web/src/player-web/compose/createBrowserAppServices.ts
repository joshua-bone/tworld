import { WorkerBackedInteractiveGameEngine } from "@game-runtime/impl/WorkerBackedInteractiveGameEngine";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { StaticCharacterizationFixtureRepository } from "@oracle-fixtures/impl/StaticCharacterizationFixtureRepository";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import { computeDatContentHash } from "@level-catalog/impl/importedDatIdentity";
import type { PersistedImportedDatSource } from "@level-catalog/ports/ImportedDatCatalogStore";
import { IndexedDbBrowserProfileStore } from "@player-web/impl/IndexedDbBrowserProfileStore";
import { BrowserReplayTransfer } from "@player-web/impl/BrowserReplayTransfer";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { GameRequest } from "@game-core/api/types";

function requestKey(request: Pick<GameRequest, "seriesFile" | "levelNumber" | "ruleset">): string {
  return `${request.seriesFile}:${request.levelNumber}:${request.ruleset}`;
}

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
  workerEngine?.warmup();
  const preloadPromises = new Map<string, Promise<void>>();

  const importDatBytes = async (filename: string, datBytes: Uint8Array, source?: PersistedImportedDatSource) => {
    const datHash = await computeDatContentHash(datBytes);
    const entries = await levelRepository.importDatBytes(filename, datBytes, datHash, true, source);
    await workerEngine?.syncImportedDatFile({
      filename,
      datHash,
      datBytes: new Uint8Array(datBytes),
    });
    return entries;
  };

  const preloadGameRequest = async (request: GameRequest): Promise<void> => {
    const key = requestKey(request);
    const cached = preloadPromises.get(key);
    if (cached) {
      await cached;
      return;
    }

    const preloadPromise = (async () => {
      const loaded = await levelRepository.loadLevel(request);
      if (!workerEngine) {
        return;
      }
      await workerEngine.preloadLevel(loaded);
    })();

    preloadPromises.set(key, preloadPromise);
    try {
      await preloadPromise;
    } finally {
      if (preloadPromises.get(key) === preloadPromise) {
        preloadPromises.delete(key);
      }
    }
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
    preloadGameRequest,
  };
}
