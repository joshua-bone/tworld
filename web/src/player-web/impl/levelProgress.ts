import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { TICKS_PER_SECOND } from "@content/api/score";
import { buildInteractiveSessionScoreSummary } from "@game-runtime/impl/interactiveSessionRun";
import {
  browserLevelRunResultRank,
  isCompletedBrowserLevelRunResult,
  type BrowserLevelProgressSummary,
  type BrowserPreferredRuleset,
  type BrowserResolvedLevelProgressSummary,
} from "@player-web/ports/BrowserProfileStore";

export interface LevelProgressSummaryCounts {
  completedLevels: number;
  playedLevels: number;
}

export function buildLevelProgressKey(
  ruleset: BrowserPreferredRuleset,
  gameplayHash: string,
): string {
  return `${ruleset}#${gameplayHash}`;
}

export function buildStoredLevelProgressKey(
  summary: Pick<BrowserLevelProgressSummary, "ruleset" | "gameplayHash">,
): string {
  return buildLevelProgressKey(summary.ruleset, summary.gameplayHash);
}

function timedLevelLimitTicks(level: Pick<SeriesLevel, "timeLimitSeconds">): number {
  return level.timeLimitSeconds > 0 ? level.timeLimitSeconds * TICKS_PER_SECOND : 0;
}

function doesElapsedPassLevelTimeLimit(
  elapsedTicks: number,
  level: Pick<SeriesLevel, "timeLimitSeconds">,
): boolean {
  const timeLimitTicks = timedLevelLimitTicks(level);
  return timeLimitTicks === 0 || elapsedTicks <= timeLimitTicks;
}

function deriveDisplayResult(
  result: BrowserLevelProgressSummary["bestResult"],
  elapsedTicks: number,
  level: Pick<SeriesLevel, "timeLimitSeconds">,
): BrowserLevelProgressSummary["bestResult"] {
  return isCompletedBrowserLevelRunResult(result) && !doesElapsedPassLevelTimeLimit(elapsedTicks, level) ? "failed" : result;
}

function deriveDisplayScore(
  level: Pick<SeriesLevel, "number" | "timeLimitSeconds">,
  result: BrowserLevelProgressSummary["bestResult"],
  elapsedTicks: number,
  undoUsedCount: number,
): number {
  if (!isCompletedBrowserLevelRunResult(result)) {
    return 0;
  }

  return buildInteractiveSessionScoreSummary(
    level.number,
    timedLevelLimitTicks(level),
    elapsedTicks,
    undoUsedCount,
  ).finalScore;
}

function compareBestProgress(
  current: BrowserLevelProgressSummary | undefined,
  incoming: BrowserLevelProgressSummary,
): boolean {
  if (!current) {
    return true;
  }

  const currentBestRank = browserLevelRunResultRank(current.bestResult);
  const incomingBestRank = browserLevelRunResultRank(incoming.bestResult);
  if (incomingBestRank !== currentBestRank) {
    return incomingBestRank > currentBestRank;
  }

  if (incoming.bestElapsedTicks !== current.bestElapsedTicks) {
    return incoming.bestElapsedTicks < current.bestElapsedTicks;
  }

  if (incoming.bestUndoUsedCount !== current.bestUndoUsedCount) {
    return incoming.bestUndoUsedCount < current.bestUndoUsedCount;
  }

  return incoming.lastPlayedAtMs >= current.lastPlayedAtMs;
}

export function mergeLevelProgressSummaries(
  existing: readonly BrowserLevelProgressSummary[],
  incoming: BrowserLevelProgressSummary,
): BrowserLevelProgressSummary[] {
  const byKey = new Map(existing.map((summary) => [buildStoredLevelProgressKey(summary), summary] as const));
  const key = buildStoredLevelProgressKey(incoming);
  const current = byKey.get(key);
  const shouldReplaceBest = compareBestProgress(current, incoming);

  byKey.set(key, {
    ruleset: incoming.ruleset,
    gameplayHash: incoming.gameplayHash,
    lastPlayedAtMs: Math.max(current?.lastPlayedAtMs ?? 0, incoming.lastPlayedAtMs),
    lastResult: incoming.lastResult,
    bestResult: shouldReplaceBest ? incoming.bestResult : (current?.bestResult ?? incoming.bestResult),
    lastElapsedTicks: incoming.lastElapsedTicks,
    bestElapsedTicks: shouldReplaceBest ? incoming.bestElapsedTicks : (current?.bestElapsedTicks ?? incoming.bestElapsedTicks),
    lastUndoUsedCount: incoming.lastUndoUsedCount,
    bestUndoUsedCount: shouldReplaceBest
      ? incoming.bestUndoUsedCount
      : (current?.bestUndoUsedCount ?? incoming.bestUndoUsedCount),
  });

  return [...byKey.values()].sort((left, right) => right.lastPlayedAtMs - left.lastPlayedAtMs);
}

export function buildLevelProgressIndex(
  summaries: readonly BrowserLevelProgressSummary[],
): ReadonlyMap<string, BrowserLevelProgressSummary> {
  return new Map(summaries.map((summary) => [buildStoredLevelProgressKey(summary), summary] as const));
}

export function resolveLevelProgressSummary(
  level: SeriesLevel | null | undefined,
  ruleset: BrowserPreferredRuleset | null | undefined,
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>,
): BrowserResolvedLevelProgressSummary | null {
  if (!level || !ruleset) {
    return null;
  }

  const raw = progressByKey.get(buildLevelProgressKey(ruleset, level.gameplayHash));
  if (!raw) {
    return null;
  }

  const lastResult = deriveDisplayResult(raw.lastResult, raw.lastElapsedTicks, level);
  const bestResult = deriveDisplayResult(raw.bestResult, raw.bestElapsedTicks, level);

  return {
    ruleset: raw.ruleset,
    gameplayHash: raw.gameplayHash,
    lastPlayedAtMs: raw.lastPlayedAtMs,
    lastResult,
    bestResult,
    lastElapsedTicks: raw.lastElapsedTicks,
    bestElapsedTicks: raw.bestElapsedTicks,
    lastScore: deriveDisplayScore(level, lastResult, raw.lastElapsedTicks, raw.lastUndoUsedCount),
    bestScore: deriveDisplayScore(level, bestResult, raw.bestElapsedTicks, raw.bestUndoUsedCount),
    lastUndoUsedCount: raw.lastUndoUsedCount,
    bestUndoUsedCount: raw.bestUndoUsedCount,
  };
}

export function summarizeEntryProgress(
  entry: SeriesCatalogEntry | null,
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>,
): LevelProgressSummaryCounts {
  if (!entry || entry.ruleset === "None") {
    return {
      completedLevels: 0,
      playedLevels: 0,
    };
  }

  let playedLevels = 0;
  let completedLevels = 0;

  for (const level of entry.levels) {
    const progress = resolveLevelProgressSummary(level, entry.ruleset, progressByKey);
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
