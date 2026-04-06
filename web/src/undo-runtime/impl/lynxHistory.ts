import type { UndoHistory, UndoSettingsSnapshot, UndoTickEvent } from "@undo-runtime/api/history";
import { advanceLynxInteractiveSession, type LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import {
  appendUndoTick,
  createUndoHistory,
  createUndoSettingsSnapshot,
  forkUndoTimeline,
  restoreUndoHistoryToTick,
  UNDO_MAIN_TIMELINE_ID,
} from "@undo-runtime/impl/history";
import {
  captureLynxUndoCheckpoint,
  restoreLynxUndoCheckpoint,
} from "@undo-runtime/impl/lynxCheckpoint";

export type LynxUndoHistory = UndoHistory<LynxInteractiveSessionState>;

interface CreateLynxUndoHistoryOptions {
  lazyInitialCheckpoint?: boolean;
}

export function createLynxUndoHistory(
  session: LynxInteractiveSessionState,
  settings: number | Partial<UndoSettingsSnapshot> = 8,
  options: CreateLynxUndoHistoryOptions = {},
): LynxUndoHistory {
  const settingsSnapshot =
    typeof settings === "number"
      ? createUndoSettingsSnapshot({
          checkpointIntervalTicks: settings,
        })
      : createUndoSettingsSnapshot(settings);
  return createUndoHistory(
    captureLynxUndoCheckpoint(session, UNDO_MAIN_TIMELINE_ID, {
      lazySnapshot: options.lazyInitialCheckpoint ?? false,
    }),
    settingsSnapshot,
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

export function forkLynxUndoHistory(
  history: LynxUndoHistory,
  session: LynxInteractiveSessionState,
): LynxUndoHistory {
  return forkUndoTimeline(history, session.state.timer.currentTime, (timelineId) =>
    captureLynxUndoCheckpoint(session, timelineId),
  );
}
