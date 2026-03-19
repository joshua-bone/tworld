import type { SeriesLevel } from "@content/api/series";
import {
  findSetFamilyForSelection,
  resolveSetFamilyLevel,
  resolveSetFamilyRuleset,
  type CuratedCatalogView,
  type SetFamilyRuleset,
} from "@player-web/impl/modern/curatedCatalog";
import type {
  BrowserResolvedLevelProgressSummary,
  BrowserRecentSelectionRecord,
} from "@player-web/ports/BrowserProfileStore";
import { isCompletedBrowserLevelRunResult } from "@player-web/ports/BrowserProfileStore";

export { buildLevelProgressIndex, summarizeEntryProgress } from "@player-web/impl/levelProgress";

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

export function describeLevelDisplayStatus(
  level: SeriesLevel,
  progress: BrowserResolvedLevelProgressSummary | null,
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
