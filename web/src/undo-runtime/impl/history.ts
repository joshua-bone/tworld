import type {
  RestoreUndoHistoryOptions,
  RestoreUndoHistoryResult,
  UndoCheckpoint,
  UndoHistory,
  UndoSettingsSnapshot,
  UndoTickEvent,
} from "@undo-runtime/api/history";

export const UNDO_MAIN_TIMELINE_ID = "main";

export function createUndoSettingsSnapshot(
  overrides: Partial<UndoSettingsSnapshot> = {},
): UndoSettingsSnapshot {
  return {
    checkpointIntervalTicks: 8,
    retainUnlimitedHistory: true,
    checkpointRetentionMode: "dense-recent",
    ...overrides,
  };
}

export function createUndoHistory<TSession>(
  initialCheckpoint: UndoCheckpoint<TSession>,
  settingsSnapshot: UndoSettingsSnapshot = createUndoSettingsSnapshot(),
): UndoHistory<TSession> {
  return {
    initialCheckpoint,
    events: [],
    checkpoints: [],
    branchMetadata: {
      currentTimelineId: initialCheckpoint.timelineId,
      timelines: [
        {
          id: initialCheckpoint.timelineId,
          parentTimelineId: null,
          forkTick: null,
        },
      ],
    },
    settingsSnapshot,
  };
}

export function appendUndoTick<TSession>(
  history: UndoHistory<TSession>,
  event: UndoTickEvent,
  createCheckpoint: () => UndoCheckpoint<TSession>,
): UndoHistory<TSession> {
  const nextEvents = [...history.events, event];
  const captureCheckpoint =
    history.settingsSnapshot.checkpointIntervalTicks > 0 &&
    nextEvents.length % history.settingsSnapshot.checkpointIntervalTicks === 0;

  return {
    ...history,
    events: nextEvents,
    checkpoints: captureCheckpoint ? [...history.checkpoints, createCheckpoint()] : history.checkpoints,
  };
}

function checkpointSort(left: { tick: number }, right: { tick: number }): number {
  return left.tick - right.tick;
}

export function checkpointsForTimeline<TSession>(
  history: UndoHistory<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoCheckpoint<TSession>[] {
  return [history.initialCheckpoint, ...history.checkpoints]
    .filter((checkpoint) => checkpoint.timelineId === timelineId)
    .sort(checkpointSort);
}

export function findCheckpointAtOrBeforeTick<TSession>(
  history: UndoHistory<TSession>,
  targetTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoCheckpoint<TSession> {
  const candidates = checkpointsForTimeline(history, timelineId).filter((checkpoint) => checkpoint.tick <= targetTick);
  const checkpoint = candidates[candidates.length - 1];
  if (!checkpoint) {
    throw new Error(`no undo checkpoint found at or before tick ${targetTick}`);
  }
  return checkpoint;
}

export function restoreUndoHistoryToTick<TSession>(
  history: UndoHistory<TSession>,
  targetTick: number,
  options: RestoreUndoHistoryOptions<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): RestoreUndoHistoryResult<TSession> {
  const checkpoint = findCheckpointAtOrBeforeTick(history, targetTick, timelineId);
  const events = history.events
    .filter((event) => event.timelineId === timelineId && event.tick > checkpoint.tick && event.tick <= targetTick)
    .sort((left, right) => left.tick - right.tick);

  let session = options.restoreCheckpoint(checkpoint);
  for (const event of events) {
    session = options.advance(session, event.inputCode);
  }

  return {
    session,
    checkpointTick: checkpoint.tick,
    replayedEventCount: events.length,
  };
}
