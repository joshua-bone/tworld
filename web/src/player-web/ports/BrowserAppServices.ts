import type { CharacterizationFixtureRepository } from "@application/ports/CharacterizationFixtureRepository";
import type { InteractiveGameEnginePort } from "@application/ports/InteractiveGameEngine";
import type { PlayableSelectionStore } from "@application/ports/PlayableSelectionStore";
import type { SeriesCatalogEntry } from "@domain/series";

export interface BrowserAppServices {
  fixtureRepository: CharacterizationFixtureRepository;
  selectionStore: PlayableSelectionStore;
  engines: Record<Exclude<SeriesCatalogEntry["ruleset"], "None">, InteractiveGameEnginePort>;
}
