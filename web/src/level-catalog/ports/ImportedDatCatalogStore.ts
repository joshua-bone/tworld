export interface PersistedImportedDatFile {
  filename: string;
  datBytes: Uint8Array;
}

export interface ImportedDatCatalogStore {
  listImportedDatFiles(): Promise<PersistedImportedDatFile[]>;
  saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void>;
  deleteImportedDatFile(filename: string): Promise<void>;
}
