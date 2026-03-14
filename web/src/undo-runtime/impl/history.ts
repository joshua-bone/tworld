import type {
  RestoreUndoHistoryOptions,
  RestoreUndoHistoryResult,
  UndoCheckpoint,
  UndoHistory,
  UndoSettingsSnapshot,
  UndoTimelineId,
  UndoTickEvent,
} from "@undo-runtime/api/history";

export const UNDO_MAIN_TIMELINE_ID = "main";
const UNDO_BRANCH_PREFIX = "timeline";

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

function recordedTicksForTimeline<TSession>(
  history: UndoHistory<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): number[] {
  return [...new Set([
    ...checkpointsForTimeline(history, timelineId).map((checkpoint) => checkpoint.tick),
    ...eventsForTimeline(history, timelineId).map((event) => event.tick),
  ])].sort((left, right) => left - right);
}

export function latestUndoTick<TSession>(
  history: UndoHistory<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): number {
  const recordedTicks = recordedTicksForTimeline(history, timelineId);
  return recordedTicks[recordedTicks.length - 1] ?? history.initialCheckpoint.tick;
}

export function previousUndoTick<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): number | null {
  return recordedTicksForTimeline(history, timelineId).filter((tick) => tick < currentTick).at(-1) ?? null;
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

export function nextUndoTickEvent<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoTickEvent | null {
  return eventsForTimeline(history, timelineId).find((event) => event.tick > currentTick) ?? null;
}

function nextTimelineId<TSession>(history: UndoHistory<TSession>): UndoTimelineId {
  return `${UNDO_BRANCH_PREFIX}-${history.branchMetadata.timelines.length}`;
}

export function forkUndoTimeline<TSession>(
  history: UndoHistory<TSession>,
  forkTick: number,
  createCheckpoint: (timelineId: UndoTimelineId) => UndoCheckpoint<TSession>,
): UndoHistory<TSession> {
  const parentTimelineId = history.branchMetadata.currentTimelineId;
  const timelineId = nextTimelineId(history);
  return {
    ...history,
    checkpoints: [...history.checkpoints, createCheckpoint(timelineId)],
    branchMetadata: {
      currentTimelineId: timelineId,
      timelines: [
        ...history.branchMetadata.timelines,
        {
          id: timelineId,
          parentTimelineId,
          forkTick,
        },
      ],
    },
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
