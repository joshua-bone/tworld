import { TsLynxGameEngineAdapter } from "@adapters/engine/TsLynxGameEngineAdapter";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { StaticCharacterizationFixtureRepository } from "@adapters/fixtures/StaticCharacterizationFixtureRepository";
import { BrowserLevelRepository } from "@adapters/levels/BrowserLevelRepository";
import { BrowserPlayableSelectionStore } from "@player-web/impl/BrowserPlayableSelectionStore";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

export function createBrowserAppServices(): BrowserAppServices {
  const levelRepository = new BrowserLevelRepository();

  return {
    fixtureRepository: new StaticCharacterizationFixtureRepository(),
    selectionStore: new BrowserPlayableSelectionStore(),
    engines: {
      MS: new TsMsGameEngineAdapter(levelRepository),
      Lynx: new TsLynxGameEngineAdapter(levelRepository),
    },
  };
}
