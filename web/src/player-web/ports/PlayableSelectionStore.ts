export interface PlayableSelection {
  seriesFile: string;
  levelNumber: number;
}

export interface PlayableSelectionStore {
  loadSelection(): Promise<PlayableSelection | null>;
  saveSelection(selection: PlayableSelection): Promise<void>;
}
