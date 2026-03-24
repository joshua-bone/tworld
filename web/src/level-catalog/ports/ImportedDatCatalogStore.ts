export type BitbustersCustomPackGame = "CC1" | "CC2";

export interface BitbustersCustomPackImportSource {
  kind: "bitbusters-custom-pack";
  game: BitbustersCustomPackGame;
  packId: number;
}

export type PersistedImportedDatSource = BitbustersCustomPackImportSource;

export interface PersistedImportedDatFile {
  filename: string;
  datHash?: string;
  datBytes: Uint8Array;
  source?: PersistedImportedDatSource;
}

export interface ImportedDatCatalogStore {
  listImportedDatFiles(): Promise<PersistedImportedDatFile[]>;
  saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void>;
  deleteImportedDatFile(filename: string): Promise<void>;
}
