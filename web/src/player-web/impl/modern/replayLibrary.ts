import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import type { BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";

export function listReplaysForSeriesLevel(
  entries: readonly BrowserReplayEntry[],
  seriesFile: string | null,
  levelNumber: number | null,
  ruleset: BrowserReplayEntry["ruleset"] | null,
): BrowserReplayEntry[] {
  if (!seriesFile || levelNumber === null || ruleset === null) {
    return [];
  }

  return entries
    .filter((entry) => entry.seriesFile === seriesFile && entry.levelNumber === levelNumber && entry.ruleset === ruleset)
    .sort((left, right) => right.savedAtMs - left.savedAtMs);
}

export function listReplaysForCurrentLevel(
  entries: readonly BrowserReplayEntry[],
  family: SetFamily | null,
  levelNumber: number | null,
  ruleset: BrowserReplayEntry["ruleset"] | null,
): BrowserReplayEntry[] {
  if (!family || levelNumber === null || ruleset === null) {
    return [];
  }

  const familySeriesFiles = new Set(family.entries.map((entry) => entry.filebase));
  return entries
    .filter(
      (entry) =>
        familySeriesFiles.has(entry.seriesFile) && entry.levelNumber === levelNumber && entry.ruleset === ruleset,
    )
    .sort((left, right) => right.savedAtMs - left.savedAtMs);
}

export function describeReplayEntry(entry: BrowserReplayEntry): {
  resultLabel: string;
  savedAtLabel: string;
  sourceLabel: string;
  summaryLabel: string;
} {
  const savedAtLabel = new Intl.DateTimeFormat(undefined, {
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
  const sourceLabel = entry.source === "imported-file" ? "Imported replay" : "Saved run";
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
