import type { RulesetName } from "@content/api/ruleset";
import type { ImportedDatCatalogStore } from "@level-catalog/ports/ImportedDatCatalogStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import type { PlayableSelectionStore } from "@player-web/ports/PlayableSelectionStore";

export type BrowserUiMode = "modern" | "classic";
export type BrowserPreferredRuleset = Exclude<RulesetName, "None">;
export type BrowserLevelRunResult = "failed" | "completed-with-undo" | "completed-clean";
export type BrowserReplaySource = "saved-run" | "imported-file";

export interface BrowserProfilePreferences {
  uiMode: BrowserUiMode;
  defaultRuleset: BrowserPreferredRuleset;
  autoSaveWinningHighScoreReplays: boolean;
  autoDownloadReplaysOnSave: boolean;
}

export interface BrowserRecentSelectionRecord {
  selection: PlayableSelection;
  savedAtMs: number;
}

export interface BrowserLevelProgressSummary {
  ruleset: BrowserPreferredRuleset;
  gameplayHash: string;
  lastPlayedAtMs: number;
  lastResult: BrowserLevelRunResult;
  bestResult: BrowserLevelRunResult;
  lastElapsedTicks: number;
  bestElapsedTicks: number;
  lastUndoUsedCount: number;
  bestUndoUsedCount: number;
}

export interface BrowserResolvedLevelProgressSummary {
  ruleset: BrowserPreferredRuleset;
  gameplayHash: string;
  lastPlayedAtMs: number;
  lastResult: BrowserLevelRunResult;
  bestResult: BrowserLevelRunResult;
  lastElapsedTicks: number;
  bestElapsedTicks: number;
  lastScore: number;
  bestScore: number;
  lastUndoUsedCount: number;
  bestUndoUsedCount: number;
}

export interface BrowserReplayEntry {
  id: string;
  fileName: string;
  seriesFile: string;
  levelNumber: number;
  levelName: string;
  ruleset: BrowserPreferredRuleset;
  savedAtMs: number;
  source: BrowserReplaySource;
  result: BrowserLevelRunResult | null;
  finalScore: number | null;
  undoUsedCount: number | null;
  bytes: Uint8Array;
}

export interface BrowserReplaySaveRequest {
  fileName: string;
  seriesFile: string;
  levelNumber: number;
  levelName: string;
  ruleset: BrowserPreferredRuleset;
  source: BrowserReplaySource;
  result: BrowserLevelRunResult | null;
  finalScore: number | null;
  undoUsedCount: number | null;
  bytes: Uint8Array;
}

export interface BrowserProfileStore extends PlayableSelectionStore, ImportedDatCatalogStore {
  loadPreferences(): Promise<BrowserProfilePreferences>;
  savePreferences(preferences: BrowserProfilePreferences): Promise<void>;
  recordRecentSelection(selection: PlayableSelection): Promise<void>;
  loadRecentSelections(): Promise<BrowserRecentSelectionRecord[]>;
  loadLevelProgressSummaries(): Promise<BrowserLevelProgressSummary[]>;
  saveLevelProgressSummary(summary: BrowserLevelProgressSummary): Promise<void>;
  loadReplayEntries(): Promise<BrowserReplayEntry[]>;
  saveReplayEntry(entry: BrowserReplaySaveRequest): Promise<BrowserReplayEntry>;
  deleteReplayEntry(id: string): Promise<void>;
  exportProfileSnapshot(): Promise<BrowserProfileSnapshot>;
  importProfileSnapshot(snapshot: BrowserProfileSnapshot): Promise<void>;
}

export interface BrowserProfileSnapshot {
  version: 1;
  selection: PlayableSelection | null;
  preferences: BrowserProfilePreferences;
  recentSelections?: BrowserRecentSelectionRecord[];
  levelProgressSummaries?: BrowserLevelProgressSummary[];
  replayEntries?: Array<{
    id: string;
    fileName: string;
    seriesFile: string;
    levelNumber: number;
    levelName: string;
    ruleset: BrowserPreferredRuleset;
    savedAtMs: number;
    source: BrowserReplaySource;
    result: BrowserLevelRunResult | null;
    finalScore: number | null;
    undoUsedCount: number | null;
    bytes: number[];
  }>;
  importedDatFiles: Array<{
    filename: string;
    datBytes: number[];
  }>;
}

export function createDefaultBrowserProfilePreferences(): BrowserProfilePreferences {
  return {
    uiMode: "modern",
    defaultRuleset: "MS",
    autoSaveWinningHighScoreReplays: true,
    autoDownloadReplaysOnSave: false,
  };
}

export function browserLevelRunResultRank(result: BrowserLevelRunResult): number {
  switch (result) {
    case "completed-clean":
      return 2;
    case "completed-with-undo":
      return 1;
    default:
      return 0;
  }
}

export function isCompletedBrowserLevelRunResult(result: BrowserLevelRunResult): boolean {
  return result === "completed-clean" || result === "completed-with-undo";
}
