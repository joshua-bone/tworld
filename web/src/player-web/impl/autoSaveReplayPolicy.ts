import type {
  BrowserLevelProgressSummary,
  BrowserLevelRunResult,
} from "@player-web/ports/BrowserProfileStore";

export function shouldAutoSaveWinningHighScoreReplay(args: {
  enabled: boolean;
  previousProgress: BrowserLevelProgressSummary | null;
  result: BrowserLevelRunResult;
  score: number | null;
}): boolean {
  if (!args.enabled || args.result === "failed" || args.score === null) {
    return false;
  }

  return args.previousProgress ? args.score >= args.previousProgress.bestScore : true;
}
