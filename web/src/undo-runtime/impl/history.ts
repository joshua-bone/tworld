import type {
  RestoreUndoHistoryOptions,
  RestoreUndoHistoryResult,
  UndoCheckpoint,
  UndoHistory,
  UndoSettingsSnapshot,
  UndoTickEvent,
} from "@undo-runtime/api/history";

export const UNDO_MAIN_TIMELINE_ID = "main";

function eventSort(left: { tick: number }, right: { tick: number }): number {
  return left.tick - right.tick;
}

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

export function eventsForTimeline<TSession>(
  history: UndoHistory<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoTickEvent[] {
  return history.events
    .filter((event) => event.timelineId === timelineId)
    .sort(eventSort);
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

export function checkpointsForTimeline<TSession>(
  history: UndoHistory<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoCheckpoint<TSession>[] {
  return [history.initialCheckpoint, ...history.checkpoints]
    .filter((checkpoint) => checkpoint.timelineId === timelineId)
    .sort(eventSort);
}

export function latestUndoTick<TSession>(
  history: UndoHistory<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): number {
  const events = eventsForTimeline(history, timelineId);
  return events[events.length - 1]?.tick ?? history.initialCheckpoint.tick;
}

export function previousUndoTick<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): number | null {
  const previousEvent = eventsForTimeline(history, timelineId).filter((event) => event.tick < currentTick).at(-1);
  if (previousEvent) {
    return previousEvent.tick;
  }

  return history.initialCheckpoint.tick < currentTick ? history.initialCheckpoint.tick : null;
}

export function previousUndoCheckpointTick<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): number | null {
  return checkpointsForTimeline(history, timelineId)
    .filter((checkpoint) => checkpoint.tick < currentTick)
    .at(-1)?.tick ?? null;
}

export function truncateUndoHistoryAfterTick<TSession>(
  history: UndoHistory<TSession>,
  targetTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoHistory<TSession> {
  return {
    ...history,
    events: history.events.filter((event) => event.timelineId !== timelineId || event.tick <= targetTick),
    checkpoints: history.checkpoints.filter(
      (checkpoint) => checkpoint.timelineId !== timelineId || checkpoint.tick <= targetTick,
    ),
  };
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
  const latestTick = latestUndoTick(history, timelineId);
  if (targetTick > latestTick) {
    throw new Error(`cannot restore undo history to future tick ${targetTick}; latest recorded tick is ${latestTick}`);
  }
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
