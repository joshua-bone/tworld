import type { InteractiveGameSessionHistory } from "@game-runtime/ports/InteractiveGameEngine";
import type { InteractiveSessionRestoreState } from "@game-runtime/impl/interactiveHandle";
import type { UndoHistory } from "@undo-runtime/api/history";
import {
  checkpointsForTimeline,
  latestUndoTick,
  previousUndoTick,
  previousUndoTicks,
} from "@undo-runtime/impl/history";

const INTERACTIVE_SESSION_RECENT_TICK_COUNT = 8;

export interface InteractiveSessionHistorySummary
  extends Omit<InteractiveGameSessionHistory, "checkpointTicks" | "restoreMode" | "restoredFromTick" | "replayTargetTick"> {}

function checkpointSummaryForTick<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
): Pick<InteractiveSessionHistorySummary, "checkpointCount" | "previousCheckpointTick"> {
  if (!history.settingsSnapshot.enabled) {
    return {
      checkpointCount: 1,
      previousCheckpointTick: null,
    };
  }

  let checkpointCount = 0;
  let previousCheckpointTick: number | null = null;
  for (const checkpoint of checkpointsForTimeline(history)) {
    checkpointCount += 1;
    if (checkpoint.tick < currentTick) {
      previousCheckpointTick = checkpoint.tick;
    }
  }

  return {
    checkpointCount,
    previousCheckpointTick,
  };
}

export function checkpointTicksForInteractiveSessionHistory<TSession>(
  history: UndoHistory<TSession>,
): number[] {
  return checkpointsForTimeline(history).map((checkpoint) => checkpoint.tick);
}

export function summarizeInteractiveSessionHistory<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
): InteractiveSessionHistorySummary {
  const checkpointSummary = checkpointSummaryForTick(history, currentTick);

  return {
    enabled: history.settingsSnapshot.enabled,
    initialTick: history.initialCheckpoint.tick,
    currentTick,
    latestTick: latestUndoTick(history),
    checkpointCount: checkpointSummary.checkpointCount,
    recentTicks: previousUndoTicks(history, currentTick, INTERACTIVE_SESSION_RECENT_TICK_COUNT),
    previousTick: previousUndoTick(history, currentTick),
    previousCheckpointTick: checkpointSummary.previousCheckpointTick,
    timelineId: history.branchMetadata.currentTimelineId,
    timelineCount: history.branchMetadata.timelines.length,
  };
}

export function advanceInteractiveSessionHistorySummary<TSession>(
  summary: InteractiveSessionHistorySummary,
  history: UndoHistory<TSession>,
  currentTick: number,
  options: {
    latestTick?: number;
  } = {},
): InteractiveSessionHistorySummary {
  const checkpointSummary = checkpointSummaryForTick(history, currentTick);

  if (!summary.enabled) {
    return {
      ...summary,
      currentTick,
      latestTick: summary.initialTick,
      checkpointCount: checkpointSummary.checkpointCount,
      recentTicks: [],
      previousTick: null,
      previousCheckpointTick: null,
      timelineId: history.branchMetadata.currentTimelineId,
      timelineCount: history.branchMetadata.timelines.length,
    };
  }

  return {
    enabled: true,
    initialTick: summary.initialTick,
    currentTick,
    latestTick: options.latestTick ?? currentTick,
    checkpointCount: checkpointSummary.checkpointCount,
    recentTicks: [summary.currentTick, ...(summary.recentTicks ?? [])].slice(0, INTERACTIVE_SESSION_RECENT_TICK_COUNT),
    previousTick: summary.currentTick,
    previousCheckpointTick: checkpointSummary.previousCheckpointTick,
    timelineId: history.branchMetadata.currentTimelineId,
    timelineCount: history.branchMetadata.timelines.length,
  };
}

export function projectInteractiveSessionHistory(
  summary: InteractiveSessionHistorySummary,
  restoreState: InteractiveSessionRestoreState,
  checkpointTicks?: number[],
): InteractiveGameSessionHistory {
  return {
    ...summary,
    checkpointTicks,
    restoreMode: restoreState.mode,
    restoredFromTick: restoreState.restoredFromTick,
    replayTargetTick: restoreState.replayTargetTick,
  };
}
