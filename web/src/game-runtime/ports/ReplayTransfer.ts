export interface ReplayTransferArtifact {
  bytes: Uint8Array;
  filename: string;
  format?: string;
  mimeType?: string;
}

export interface ImportedReplayFile {
  bytes: Uint8Array;
  name: string;
}

export interface ReplayTransferPort {
  exportReplay(artifact: ReplayTransferArtifact): Promise<void>;
  importReplay(): Promise<ImportedReplayFile | null>;
}
