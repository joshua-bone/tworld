import type { UndoHistory, UndoTickEvent } from "@undo-runtime/api/history";
import { advanceLynxInteractiveSession, type LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import {
  appendUndoTick,
  createUndoHistory,
  createUndoSettingsSnapshot,
  restoreUndoHistoryToTick,
  UNDO_MAIN_TIMELINE_ID,
} from "@undo-runtime/impl/history";
import {
  captureLynxUndoCheckpoint,
  restoreLynxUndoCheckpoint,
} from "@undo-runtime/impl/lynxCheckpoint";

export type LynxUndoHistory = UndoHistory<LynxInteractiveSessionState>;

export function createLynxUndoHistory(
  session: LynxInteractiveSessionState,
  checkpointIntervalTicks = 8,
): LynxUndoHistory {
  return createUndoHistory(
    captureLynxUndoCheckpoint(session, UNDO_MAIN_TIMELINE_ID),
    createUndoSettingsSnapshot({
      checkpointIntervalTicks,
    }),
  );
}

export function recordLynxUndoTick(
  history: LynxUndoHistory,
  session: LynxInteractiveSessionState,
  inputCode: number,
  source: UndoTickEvent["source"] = "manual",
): LynxUndoHistory {
  return appendUndoTick(
    history,
    {
      tick: session.state.timer.currentTime,
      inputCode,
      inputKind: "runtime",
      source,
      timelineId: history.branchMetadata.currentTimelineId,
    },
    () => captureLynxUndoCheckpoint(session, history.branchMetadata.currentTimelineId),
  );
}

export function restoreLynxUndoHistoryToTick(
  history: LynxUndoHistory,
  targetTick: number,
) {
  return restoreUndoHistoryToTick(history, targetTick, {
    restoreCheckpoint: restoreLynxUndoCheckpoint,
    advance: advanceLynxInteractiveSession,
  });
}
