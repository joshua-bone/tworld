import type { InteractiveGameSessionHistory } from "@game-runtime/ports/InteractiveGameEngine";
import type { UndoHistory } from "@undo-runtime/api/history";
import {
  checkpointsForTimeline,
  latestUndoTick,
  previousUndoCheckpointTick,
  previousUndoTick,
  previousUndoTicks,
} from "@undo-runtime/impl/history";
import type { InteractiveSessionRestoreState } from "@game-runtime/impl/interactiveHandle";

const INTERACTIVE_SESSION_RECENT_TICK_COUNT = 8;

export function projectInteractiveSessionHistory<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  restoreState: InteractiveSessionRestoreState,
): InteractiveGameSessionHistory {
  return {
    enabled: history.settingsSnapshot.enabled,
    initialTick: history.initialCheckpoint.tick,
    currentTick,
    latestTick: latestUndoTick(history),
    checkpointTicks: checkpointsForTimeline(history).map((checkpoint) => checkpoint.tick),
    recentTicks: previousUndoTicks(history, currentTick, INTERACTIVE_SESSION_RECENT_TICK_COUNT),
    previousTick: previousUndoTick(history, currentTick),
    previousCheckpointTick: previousUndoCheckpointTick(history, currentTick),
    timelineId: history.branchMetadata.currentTimelineId,
    timelineCount: history.branchMetadata.timelines.length,
    restoreMode: restoreState.mode,
    restoredFromTick: restoreState.restoredFromTick,
    replayTargetTick: restoreState.replayTargetTick,
  };
}
