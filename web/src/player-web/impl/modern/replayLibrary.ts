import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import type { BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";

export function replayEntryKey(entry: BrowserReplayEntry): string {
  return `${entry.source}:${entry.id}`;
}

function replayMatchesGameplayHash(
  entry: BrowserReplayEntry,
  gameplayHash: string | null,
): boolean {
  if (entry.source === "reference") {
    return gameplayHash !== null && entry.gameplayHash === gameplayHash;
  }
  // Rows saved before gameplay-hash binding remain visible as a deliberate
  // migration policy. Every newly saved/imported row is bound and fail-closed.
  return entry.gameplayHash === undefined
    || (gameplayHash !== null && entry.gameplayHash === gameplayHash);
}

export function listReplaysForSeriesLevel(
  entries: readonly BrowserReplayEntry[],
  seriesFile: string | null,
  levelNumber: number | null,
  ruleset: BrowserReplayEntry["ruleset"] | null,
  gameplayHash: string | null = null,
): BrowserReplayEntry[] {
  if (!seriesFile || levelNumber === null || ruleset === null) {
    return [];
  }

  return entries
    .filter((entry) => (
      entry.seriesFile === seriesFile
      && entry.levelNumber === levelNumber
      && entry.ruleset === ruleset
      && replayMatchesGameplayHash(entry, gameplayHash)
    ))
    .sort(compareReplayEntries);
}

export function listReplaysForCurrentLevel(
  entries: readonly BrowserReplayEntry[],
  family: SetFamily | null,
  levelNumber: number | null,
  ruleset: BrowserReplayEntry["ruleset"] | null,
  gameplayHash: string | null = null,
): BrowserReplayEntry[] {
  if (!family || levelNumber === null || ruleset === null) {
    return [];
  }

  const familySeriesFiles = new Set(family.entries.map((entry) => entry.filebase));
  return entries
    .filter(
      (entry) =>
        familySeriesFiles.has(entry.seriesFile)
        && entry.levelNumber === levelNumber
        && entry.ruleset === ruleset
        && replayMatchesGameplayHash(entry, gameplayHash),
    )
    .sort(compareReplayEntries);
}

function compareReplayEntries(left: BrowserReplayEntry, right: BrowserReplayEntry): number {
  const leftReference = left.source === "reference" ? 1 : 0;
  const rightReference = right.source === "reference" ? 1 : 0;
  return leftReference - rightReference || right.savedAtMs - left.savedAtMs;
}

export function describeReplayEntry(entry: BrowserReplayEntry): {
  resultLabel: string;
  savedAtLabel: string;
  sourceLabel: string;
  summaryLabel: string;
} {
  const savedAtLabel = entry.source === "reference"
    ? "Bundled with sandbox"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(entry.savedAtMs);
  const resultLabel =
    entry.result === "completed-clean"
      ? "Clean clear"
      : entry.result === "completed-with-undo"
        ? "Cleared with undo"
        : entry.result === "failed"
          ? "Failed"
          : "Run state unavailable";
  const sourceLabel = entry.source === "reference"
    ? "Reference replay"
    : entry.source === "imported-file" ? "Imported replay" : "Saved run";
  const summaryParts = [sourceLabel, resultLabel];

  if (entry.finalScore !== null) {
    summaryParts.push(`${entry.finalScore} pts`);
  }
  if (entry.undoUsedCount !== null) {
    summaryParts.push(entry.undoUsedCount === 0 ? "No undo" : `${entry.undoUsedCount} undo`);
  }

  return {
    resultLabel,
    savedAtLabel,
    sourceLabel,
    summaryLabel: summaryParts.join("  ·  "),
  };
}
