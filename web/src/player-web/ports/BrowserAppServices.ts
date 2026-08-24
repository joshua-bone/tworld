import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";
import type { ReplayTransferPort } from "@game-runtime/ports/ReplayTransfer";
import type { BrowserProfileStore } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelectionStore } from "@player-web/ports/PlayableSelectionStore";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { PersistedImportedDatSource } from "@level-catalog/ports/ImportedDatCatalogStore";
import type { GameRequest } from "@game-core/api/types";

export interface BrowserAppServices {
  fixtureRepository: CharacterizationFixtureRepository;
  profileStore: BrowserProfileStore;
  selectionStore: PlayableSelectionStore;
  replayTransfer: ReplayTransferPort;
  engines: Record<"MS" | "Lynx", InteractiveGameEnginePort> &
    Partial<Record<Exclude<SeriesCatalogEntry["ruleset"], "MS" | "Lynx" | "None">, InteractiveGameEnginePort>>;
  importDatFile: (file: File) => Promise<SeriesCatalogEntry[]>;
  importDatBytes: (
    filename: string,
    datBytes: Uint8Array,
    source?: PersistedImportedDatSource,
  ) => Promise<SeriesCatalogEntry[]>;
  deleteImportedDatFile: (filename: string) => Promise<void>;
  listImportedCatalogEntries: () => Promise<SeriesCatalogEntry[]>;
  preloadGameRequest?: (request: GameRequest) => Promise<void>;
}
