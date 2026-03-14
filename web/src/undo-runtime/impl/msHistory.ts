import type { UndoHistory, UndoTickEvent } from "@undo-runtime/api/history";
import { advanceMsInteractiveSession, type MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import {
  appendUndoTick,
  createUndoHistory,
  createUndoSettingsSnapshot,
  restoreUndoHistoryToTick,
  UNDO_MAIN_TIMELINE_ID,
} from "@undo-runtime/impl/history";
import {
  captureMsUndoCheckpoint,
  restoreMsUndoCheckpoint,
} from "@undo-runtime/impl/msCheckpoint";

export type MsUndoHistory = UndoHistory<MsInteractiveSessionState>;

export function createMsUndoHistory(
  session: MsInteractiveSessionState,
  checkpointIntervalTicks = 8,
): MsUndoHistory {
  return createUndoHistory(
    captureMsUndoCheckpoint(session, UNDO_MAIN_TIMELINE_ID),
    createUndoSettingsSnapshot({
      checkpointIntervalTicks,
    }),
  );
}

export function recordMsUndoTick(
  history: MsUndoHistory,
  session: MsInteractiveSessionState,
  inputCode: number,
  source: UndoTickEvent["source"] = "manual",
): MsUndoHistory {
  return appendUndoTick(
    history,
    {
      tick: session.state.engine.timer.currentTime,
      inputCode,
      inputKind: "runtime",
      source,
      timelineId: history.branchMetadata.currentTimelineId,
    },
    () => captureMsUndoCheckpoint(session, history.branchMetadata.currentTimelineId),
  );
}

export function restoreMsUndoHistoryToTick(
  history: MsUndoHistory,
  targetTick: number,
) {
  return restoreUndoHistoryToTick(history, targetTick, {
    restoreCheckpoint: restoreMsUndoCheckpoint,
    advance: advanceMsInteractiveSession,
  });
}
