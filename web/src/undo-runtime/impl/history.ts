import type {
  RestoreUndoHistoryOptions,
  RestoreUndoHistoryResult,
  UndoCheckpoint,
  UndoHistory,
  UndoTimeline,
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
  const checkpointIntervalTicks = overrides.checkpointIntervalTicks ?? 8;
  return {
    enabled: true,
    checkpointIntervalTicks,
    retainUnlimitedHistory: true,
    checkpointRetentionMode: "dense-recent-exponential",
    recentCheckpointWindowTicks: checkpointIntervalTicks * 10,
    checkpointExponentialBase: 2,
    maximumRetainedHistoryTicks: null,
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
  return timelineSegments(history, timelineId)
    .flatMap((segment) =>
      history.events.filter(
        (event) =>
          event.timelineId === segment.timelineId &&
          (segment.segmentStartTick === null || event.tick > segment.segmentStartTick) &&
          (segment.segmentEndTick === null || event.tick <= segment.segmentEndTick),
      ),
    )
    .sort(eventSort);
}

export function appendUndoTick<TSession>(
  history: UndoHistory<TSession>,
  event: UndoTickEvent,
  createCheckpoint: () => UndoCheckpoint<TSession>,
): UndoHistory<TSession> {
  if (!history.settingsSnapshot.enabled) {
    return history;
  }
  const nextEvents = [...history.events, event];
  const timelineEventCount = nextEvents.filter((existingEvent) => existingEvent.timelineId === event.timelineId).length;
  const captureCheckpoint =
    history.settingsSnapshot.checkpointIntervalTicks > 0 &&
    timelineEventCount % history.settingsSnapshot.checkpointIntervalTicks === 0;

  return pruneUndoHistory({
    ...history,
    events: nextEvents,
    checkpoints: captureCheckpoint ? [...history.checkpoints, createCheckpoint()] : history.checkpoints,
  });
}

export function checkpointsForTimeline<TSession>(
  history: UndoHistory<TSession>,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoCheckpoint<TSession>[] {
  const depthByTimeline = new Map(
    timelineSegments(history, timelineId).map((segment) => [segment.timelineId, segment.depth]),
  );
  const checkpoints = timelineSegments(history, timelineId)
    .flatMap((segment) =>
      directCheckpointsForTimeline(history, segment.timelineId).filter(
        (checkpoint) =>
          (segment.segmentStartTick === null || checkpoint.tick >= segment.segmentStartTick) &&
          (segment.segmentEndTick === null || checkpoint.tick <= segment.segmentEndTick),
      ),
    )
    .sort(
      (left, right) =>
        left.tick - right.tick ||
        (depthByTimeline.get(left.timelineId) ?? 0) - (depthByTimeline.get(right.timelineId) ?? 0),
    );

  return dedupeCheckpointsByTick(checkpoints);
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
  if (!history.settingsSnapshot.enabled) {
    return history.initialCheckpoint.tick;
  }
  const recordedTicks = recordedTicksForTimeline(history, timelineId);
  return recordedTicks[recordedTicks.length - 1] ?? history.initialCheckpoint.tick;
}

export function previousUndoTick<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): number | null {
  if (!history.settingsSnapshot.enabled) {
    return null;
  }
  return recordedTicksForTimeline(history, timelineId).filter((tick) => tick < currentTick).at(-1) ?? null;
}

export function previousUndoCheckpointTick<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): number | null {
  if (!history.settingsSnapshot.enabled) {
    return null;
  }
  return checkpointsForTimeline(history, timelineId)
    .filter((checkpoint) => checkpoint.tick < currentTick)
    .at(-1)?.tick ?? null;
}

export function truncateUndoHistoryAfterTick<TSession>(
  history: UndoHistory<TSession>,
  targetTick: number,
  timelineId = history.branchMetadata.currentTimelineId,
): UndoHistory<TSession> {
  if (!history.settingsSnapshot.enabled) {
    return history;
  }
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
  if (!history.settingsSnapshot.enabled) {
    return null;
  }
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
  if (!history.settingsSnapshot.enabled) {
    return history;
  }
  const parentTimelineId = history.branchMetadata.currentTimelineId;
  const timelineId = nextTimelineId(history);
  return pruneUndoHistory({
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
  });
}

function timelineCheckpoints<TSession>(
  history: UndoHistory<TSession>,
  timelineId: UndoTimelineId,
): UndoCheckpoint<TSession>[] {
  return directCheckpointsForTimeline(history, timelineId);
}

function directCheckpointsForTimeline<TSession>(
  history: UndoHistory<TSession>,
  timelineId: UndoTimelineId,
): UndoCheckpoint<TSession>[] {
  return (timelineId === history.initialCheckpoint.timelineId
    ? [history.initialCheckpoint, ...history.checkpoints]
    : history.checkpoints)
    .filter((checkpoint) => checkpoint.timelineId === timelineId)
    .sort(eventSort);
}

function timelineById<TSession>(
  history: UndoHistory<TSession>,
  timelineId: UndoTimelineId,
): UndoTimeline {
  const timeline = history.branchMetadata.timelines.find((candidate) => candidate.id === timelineId);
  if (!timeline) {
    throw new Error(`unknown undo timeline ${timelineId}`);
  }
  return timeline;
}

function timelineLineage<TSession>(
  history: UndoHistory<TSession>,
  timelineId: UndoTimelineId,
): UndoTimeline[] {
  const lineage: UndoTimeline[] = [];
  let currentTimelineId: UndoTimelineId | null = timelineId;

  while (currentTimelineId !== null) {
    const timeline: UndoTimeline = timelineById(history, currentTimelineId);
    lineage.push(timeline);
    currentTimelineId = timeline.parentTimelineId;
  }

  return lineage.reverse();
}

interface TimelineSegment {
  timelineId: UndoTimelineId;
  segmentStartTick: number | null;
  segmentEndTick: number | null;
  depth: number;
}

function timelineSegments<TSession>(
  history: UndoHistory<TSession>,
  timelineId: UndoTimelineId,
): TimelineSegment[] {
  const lineage = timelineLineage(history, timelineId);
  return lineage.map((timeline, depth) => ({
    timelineId: timeline.id,
    segmentStartTick: timeline.forkTick,
    segmentEndTick: lineage[depth + 1]?.forkTick ?? null,
    depth,
  }));
}

function dedupeCheckpointsByTick<TSession>(
  checkpoints: UndoCheckpoint<TSession>[],
): UndoCheckpoint<TSession>[] {
  const deduped: UndoCheckpoint<TSession>[] = [];
  for (const checkpoint of checkpoints) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.tick === checkpoint.tick) {
      deduped[deduped.length - 1] = checkpoint;
      continue;
    }
    deduped.push(checkpoint);
  }
  return deduped;
}

function thinTimelineCheckpoints<TSession>(
  checkpoints: UndoCheckpoint<TSession>[],
  settings: UndoSettingsSnapshot,
): UndoCheckpoint<TSession>[] {
  if (checkpoints.length <= 2 || settings.checkpointRetentionMode !== "dense-recent-exponential") {
    return checkpoints;
  }

  const recentWindowTicks = Math.max(settings.recentCheckpointWindowTicks, settings.checkpointIntervalTicks);
  const exponentialBase = Math.max(settings.checkpointExponentialBase, 2);
  const retained: UndoCheckpoint<TSession>[] = [];
  let lastRetainedTick = Number.POSITIVE_INFINITY;
  let lastRetainedBand: number | null = null;
  const latestTick = checkpoints[checkpoints.length - 1]!.tick;

  for (let index = checkpoints.length - 1; index >= 0; index -= 1) {
    const checkpoint = checkpoints[index]!;
    const age = latestTick - checkpoint.tick;
    const keepRecent = age <= recentWindowTicks;
    const keepLatest = checkpoint.tick === latestTick;
    const band =
      age <= recentWindowTicks
        ? 0
        : Math.max(1, Math.ceil(Math.log(age / recentWindowTicks) / Math.log(exponentialBase)));
    const minimumGap =
      band === 0
        ? settings.checkpointIntervalTicks
        : settings.checkpointIntervalTicks * exponentialBase ** band;
    if (keepLatest || keepRecent || band !== lastRetainedBand || lastRetainedTick - checkpoint.tick >= minimumGap) {
      retained.push(checkpoint);
      lastRetainedTick = checkpoint.tick;
      lastRetainedBand = band;
    }
  }

  const oldestCheckpoint = checkpoints[0]!;
  if (!retained.some((checkpoint) => checkpoint.tick === oldestCheckpoint.tick)) {
    retained.push(oldestCheckpoint);
  }

  return retained.sort(eventSort);
}

function boundedTimelineFloorCheckpoint<TSession>(
  checkpoints: UndoCheckpoint<TSession>[],
  latestTick: number,
  settings: UndoSettingsSnapshot,
): UndoCheckpoint<TSession> | null {
  if (settings.retainUnlimitedHistory || settings.maximumRetainedHistoryTicks === null) {
    return null;
  }

  const cutoffTick = latestTick - settings.maximumRetainedHistoryTicks;
  return checkpoints.filter((checkpoint) => checkpoint.tick <= cutoffTick).at(-1) ?? checkpoints[0] ?? null;
}

export function pruneUndoHistory<TSession>(history: UndoHistory<TSession>): UndoHistory<TSession> {
  if (!history.settingsSnapshot.enabled) {
    return {
      ...history,
      checkpoints: [],
      events: [],
      branchMetadata: {
        currentTimelineId: history.initialCheckpoint.timelineId,
        timelines: [
          {
            id: history.initialCheckpoint.timelineId,
            parentTimelineId: null,
            forkTick: null,
          },
        ],
      },
    };
  }
  let initialCheckpoint = history.initialCheckpoint;
  const retainedTimelineCheckpoints = new Map<UndoTimelineId, UndoCheckpoint<TSession>[]>();
  const earliestRetainedTickByTimeline = new Map<UndoTimelineId, number>();

  for (const timeline of history.branchMetadata.timelines) {
    const checkpoints = timelineCheckpoints(history, timeline.id);
    if (checkpoints.length === 0) {
      continue;
    }
    const latestTick = latestUndoTick(history, timeline.id);
    const thinned = thinTimelineCheckpoints(checkpoints, history.settingsSnapshot);
    const floorCheckpoint = boundedTimelineFloorCheckpoint(checkpoints, latestTick, history.settingsSnapshot);
    const retained = floorCheckpoint
      ? [
          floorCheckpoint,
          ...thinned.filter((checkpoint) => checkpoint.tick >= floorCheckpoint.tick && checkpoint.tick !== floorCheckpoint.tick),
        ].sort(eventSort)
      : thinned;
    retainedTimelineCheckpoints.set(timeline.id, retained);
    if (floorCheckpoint) {
      earliestRetainedTickByTimeline.set(timeline.id, floorCheckpoint.tick);
    }
  }

  const nextCheckpoints: UndoCheckpoint<TSession>[] = [];
  const mainTimelineId = history.initialCheckpoint.timelineId;
  const mainRetained = retainedTimelineCheckpoints.get(mainTimelineId) ?? [history.initialCheckpoint];
  initialCheckpoint = mainRetained[0]!;
  nextCheckpoints.push(...mainRetained.slice(1));

  for (const timeline of history.branchMetadata.timelines) {
    if (timeline.id === mainTimelineId) {
      continue;
    }
    nextCheckpoints.push(...(retainedTimelineCheckpoints.get(timeline.id) ?? []));
  }

  const nextEvents =
    history.settingsSnapshot.retainUnlimitedHistory || history.settingsSnapshot.maximumRetainedHistoryTicks === null
      ? history.events
      : history.events.filter((event) => {
          const earliestRetainedTick = earliestRetainedTickByTimeline.get(event.timelineId);
          return earliestRetainedTick === undefined || event.tick > earliestRetainedTick;
        });

  return {
    ...history,
    initialCheckpoint,
    checkpoints: nextCheckpoints.sort(eventSort),
    events: nextEvents.sort(eventSort),
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
  if (!history.settingsSnapshot.enabled) {
    if (targetTick !== history.initialCheckpoint.tick) {
      throw new Error("undo history is disabled for this session");
    }
    return {
      session: options.restoreCheckpoint(history.initialCheckpoint),
      checkpointTick: history.initialCheckpoint.tick,
      replayedEventCount: 0,
    };
  }
  const latestTick = latestUndoTick(history, timelineId);
  if (targetTick > latestTick) {
    throw new Error(`cannot restore undo history to future tick ${targetTick}; latest recorded tick is ${latestTick}`);
  }
  const checkpoint = findCheckpointAtOrBeforeTick(history, targetTick, timelineId);
  const events = eventsForTimeline(history, timelineId)
    .filter((event) => event.tick > checkpoint.tick && event.tick <= targetTick)
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
