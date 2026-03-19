import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { StaticCharacterizationFixtureRepository } from "@oracle-fixtures/impl/StaticCharacterizationFixtureRepository";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import { IndexedDbBrowserProfileStore } from "@player-web/impl/IndexedDbBrowserProfileStore";
import { BrowserReplayTransfer } from "@player-web/impl/BrowserReplayTransfer";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

export function createBrowserAppServices(): BrowserAppServices {
  const profileStore = new IndexedDbBrowserProfileStore();
  const levelRepository = new BrowserLevelRepository(profileStore);

  return {
    fixtureRepository: new StaticCharacterizationFixtureRepository(),
    profileStore,
    selectionStore: profileStore,
    replayTransfer: new BrowserReplayTransfer(),
    engines: {
      MS: new MsGameEngineAdapter(levelRepository),
      Lynx: new LynxGameEngineAdapter(levelRepository),
    },
    importDatFile: (file) => levelRepository.importDatFile(file),
    deleteImportedDatFile: (filename) => levelRepository.deleteImportedDatFile(filename),
    listImportedCatalogEntries: async () => levelRepository.listImportedCatalogEntries(),
  };
}
