import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import {
  findSetFamilyForSelection,
  resolveSetFamilyLevel,
  resolveSetFamilyRuleset,
  type CuratedCatalogView,
  type SetFamilyRuleset,
} from "@player-web/impl/modern/curatedCatalog";
import type {
  BrowserLevelProgressSummary,
  BrowserRecentSelectionRecord,
} from "@player-web/ports/BrowserProfileStore";
import { isCompletedBrowserLevelRunResult } from "@player-web/ports/BrowserProfileStore";

export interface FamilyProgressSummary {
  completedLevels: number;
  playedLevels: number;
}

export interface RecentFamilyActivity {
  familyId: string;
  familyTitle: string;
  levelName: string | null;
  levelNumber: number;
  ruleset: SetFamilyRuleset | null;
  rulesetLabel: string | null;
  savedAtMs: number;
}

export interface LevelDisplayStatus {
  bestResultLabel: string;
  completionState: "Completed" | "Attempted" | "Unplayed";
  replayAvailabilityLabel: string;
}

export function buildLevelProgressKey(seriesFile: string, levelNumber: number): string {
  return `${seriesFile}#${String(levelNumber)}`;
}

export function buildLevelProgressIndex(
  summaries: readonly BrowserLevelProgressSummary[],
): ReadonlyMap<string, BrowserLevelProgressSummary> {
  return new Map(summaries.map((summary) => [buildLevelProgressKey(summary.seriesFile, summary.levelNumber), summary] as const));
}

export function summarizeEntryProgress(
  entry: SeriesCatalogEntry | null,
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>,
): FamilyProgressSummary {
  if (!entry) {
    return {
      completedLevels: 0,
      playedLevels: 0,
    };
  }

  let playedLevels = 0;
  let completedLevels = 0;

  for (const level of entry.levels) {
    const progress = progressByKey.get(buildLevelProgressKey(entry.filebase, level.number));
    if (!progress) {
      continue;
    }

    playedLevels += 1;
    if (isCompletedBrowserLevelRunResult(progress.bestResult)) {
      completedLevels += 1;
    }
  }

  return {
    completedLevels,
    playedLevels,
  };
}

export function describeLevelDisplayStatus(
  level: SeriesLevel,
  progress: BrowserLevelProgressSummary | null,
): LevelDisplayStatus {
  if (!progress) {
    return {
      completionState: "Unplayed",
      bestResultLabel: "No runs yet",
      replayAvailabilityLabel: level.hasSolution ? "Official replay" : "No replay",
    };
  }

  return {
    completionState: isCompletedBrowserLevelRunResult(progress.bestResult) ? "Completed" : "Attempted",
    bestResultLabel:
      progress.bestResult === "completed-clean"
        ? "Cleared clean"
        : progress.bestResult === "completed-with-undo"
          ? "Cleared with undo"
          : "Attempted",
    replayAvailabilityLabel: level.hasSolution ? "Official replay" : "No replay",
  };
}

export function buildRecentFamilyActivities(
  view: CuratedCatalogView,
  recentSelections: readonly BrowserRecentSelectionRecord[],
): RecentFamilyActivity[] {
  return recentSelections.flatMap((entry) => {
    const family = findSetFamilyForSelection(view, entry.selection);
    if (!family) {
      return [];
    }

    const ruleset = resolveSetFamilyRuleset(family, entry.selection);
    const level = ruleset ? resolveSetFamilyLevel(family, ruleset, entry.selection.levelNumber) : null;

    return [
      {
        familyId: family.id,
        familyTitle: family.title,
        levelName: level?.name ?? null,
        levelNumber: entry.selection.levelNumber,
        ruleset,
        rulesetLabel: ruleset ? family.rulesetLabels[ruleset] ?? ruleset : null,
        savedAtMs: entry.savedAtMs,
      } satisfies RecentFamilyActivity,
    ];
  });
}
