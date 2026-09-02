import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { BrowserLevelProgressSummary } from "@player-web/ports/BrowserProfileStore";

export function shouldPersistLevelProgress(params: {
  hasResult: boolean;
  mode: "game" | "series-list";
  sessionMode: "manual" | "replay" | null;
  sessionStartedFromReplay: boolean;
}): boolean {
  return (
    params.mode === "game" &&
    params.hasResult &&
    params.sessionMode === "manual" &&
    !params.sessionStartedFromReplay
  );
}

/**
 * Identifies one terminal gameplay result without depending on observer-only
 * frames that an engine may continue publishing afterward.
 */
export function terminalSessionRecordKey(session: InteractiveGameSession): string | null {
  const result = session.run.result;
  if (!result) return null;

  return JSON.stringify({
    seriesFile: session.request.seriesFile,
    levelNumber: session.request.levelNumber,
    outcome: result.outcome,
    gameplayTime: Math.max(session.frame.snapshot.currentTime, 0),
    undoUsedCount: session.run.undoUsedCount,
    endPosition: result.endPosition,
    cause: result.cause,
  });
}

/**
 * Claims and persists one terminal manual attempt. The mutable claim is shared
 * by PlayerApp renders so observer-only frames cannot repeat the write.
 */
export function persistTerminalSessionProgress(params: {
  attemptCounts: Map<string, number>;
  gameplayHash: string | null;
  mode: "game" | "series-list";
  nowMs: number;
  recordedSession: { current: string | null };
  save: (summary: BrowserLevelProgressSummary) => void;
  session: InteractiveGameSession | null;
  sessionStartedFromReplay: boolean;
  modeFingerprint?: string | null;
  scoresDisabled?: boolean;
}): BrowserLevelProgressSummary | null {
  const session = params.session;
  if (
    !session ||
    params.gameplayHash === null ||
    !shouldPersistLevelProgress({
      hasResult: session.run.result !== null,
      mode: params.mode,
      sessionMode: session.mode,
      sessionStartedFromReplay: params.sessionStartedFromReplay,
    })
  ) {
    return null;
  }

  const result = session.run.result!;
  const recordKey = terminalSessionRecordKey(session);
  if (recordKey === null || params.recordedSession.current === recordKey) {
    return null;
  }

  params.recordedSession.current = recordKey;
  const attemptKey = `${session.request.seriesFile}:${String(session.request.levelNumber)}`;
  params.attemptCounts.set(attemptKey, (params.attemptCounts.get(attemptKey) ?? 0) + 1);

  const progressSummary: BrowserLevelProgressSummary = {
    ruleset: session.request.ruleset,
    gameplayHash: params.gameplayHash,
    modeFingerprint: params.modeFingerprint ?? undefined,
    scoresDisabled: params.scoresDisabled === true ? true : undefined,
    lastPlayedAtMs: params.nowMs,
    lastResult: result.outcome,
    bestResult: result.outcome,
    lastElapsedTicks: Math.max(session.frame.snapshot.currentTime, 0),
    bestElapsedTicks: Math.max(session.frame.snapshot.currentTime, 0),
    lastUndoUsedCount: session.run.undoUsedCount,
    bestUndoUsedCount: session.run.undoUsedCount,
  };

  params.save(progressSummary);
  return progressSummary;
}
