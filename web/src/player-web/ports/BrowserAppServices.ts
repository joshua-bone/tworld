import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";
import type { BrowserProfileStore } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelectionStore } from "@player-web/ports/PlayableSelectionStore";
import type { ReplayTransferPort } from "@player-web/ports/ReplayTransfer";
import type { SeriesCatalogEntry } from "@content/api/series";

export interface BrowserAppServices {
  fixtureRepository: CharacterizationFixtureRepository;
  profileStore: BrowserProfileStore;
  selectionStore: PlayableSelectionStore;
  replayTransfer: ReplayTransferPort;
  engines: Record<Exclude<SeriesCatalogEntry["ruleset"], "None">, InteractiveGameEnginePort>;
  importDatFile: (file: File) => Promise<SeriesCatalogEntry[]>;
  deleteImportedDatFile: (filename: string) => Promise<void>;
  listImportedCatalogEntries: () => Promise<SeriesCatalogEntry[]>;
}
