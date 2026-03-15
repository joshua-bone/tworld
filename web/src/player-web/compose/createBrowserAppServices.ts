import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { StaticCharacterizationFixtureRepository } from "@oracle-fixtures/impl/StaticCharacterizationFixtureRepository";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import { BrowserPlayableSelectionStore } from "@player-web/impl/BrowserPlayableSelectionStore";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

export function createBrowserAppServices(): BrowserAppServices {
  const levelRepository = new BrowserLevelRepository();

  return {
    fixtureRepository: new StaticCharacterizationFixtureRepository(),
    selectionStore: new BrowserPlayableSelectionStore(),
    engines: {
      MS: new MsGameEngineAdapter(levelRepository),
      Lynx: new LynxGameEngineAdapter(levelRepository),
    },
    importDatFile: (file) => levelRepository.importDatFile(file),
  };
}
