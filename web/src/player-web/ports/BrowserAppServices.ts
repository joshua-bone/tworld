import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";
import type { PlayableSelectionStore } from "@player-web/ports/PlayableSelectionStore";
import type { SeriesCatalogEntry } from "@content/api/series";

export interface BrowserAppServices {
  fixtureRepository: CharacterizationFixtureRepository;
  selectionStore: PlayableSelectionStore;
  engines: Record<Exclude<SeriesCatalogEntry["ruleset"], "None">, InteractiveGameEnginePort>;
}
