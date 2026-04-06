import type { UndoHistory, UndoSettingsSnapshot, UndoTickEvent } from "@undo-runtime/api/history";
import { advanceMsInteractiveSession, type MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import {
  appendUndoTick,
  createUndoHistory,
  createUndoSettingsSnapshot,
  forkUndoTimeline,
  restoreUndoHistoryToTick,
  UNDO_MAIN_TIMELINE_ID,
} from "@undo-runtime/impl/history";
import {
  captureMsUndoCheckpoint,
  restoreMsUndoCheckpoint,
} from "@undo-runtime/impl/msCheckpoint";

export type MsUndoHistory = UndoHistory<MsInteractiveSessionState>;

interface CreateMsUndoHistoryOptions {
  lazyInitialCheckpoint?: boolean;
}

export function createMsUndoHistory(
  session: MsInteractiveSessionState,
  settings: number | Partial<UndoSettingsSnapshot> = 8,
  options: CreateMsUndoHistoryOptions = {},
): MsUndoHistory {
  const settingsSnapshot =
    typeof settings === "number"
      ? createUndoSettingsSnapshot({
          checkpointIntervalTicks: settings,
        })
      : createUndoSettingsSnapshot(settings);
  return createUndoHistory(
    captureMsUndoCheckpoint(session, UNDO_MAIN_TIMELINE_ID, {
      lazySnapshot: options.lazyInitialCheckpoint ?? false,
    }),
    settingsSnapshot,
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

export function forkMsUndoHistory(
  history: MsUndoHistory,
  session: MsInteractiveSessionState,
): MsUndoHistory {
  return forkUndoTimeline(history, session.state.engine.timer.currentTime, (timelineId) =>
    captureMsUndoCheckpoint(session, timelineId),
  );
}
