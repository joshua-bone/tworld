import type {
  BrowserLevelRunResult,
  BrowserResolvedLevelProgressSummary,
} from "@player-web/ports/BrowserProfileStore";

export function shouldAutoSaveWinningHighScoreReplay(args: {
  enabled: boolean;
  previousProgress: BrowserResolvedLevelProgressSummary | null;
  result: BrowserLevelRunResult;
  score: number | null;
}): boolean {
  if (!args.enabled || args.result === "failed" || args.score === null) {
    return false;
  }

  return args.previousProgress ? args.score >= args.previousProgress.bestScore : true;
}
