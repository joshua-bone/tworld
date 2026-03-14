import type { InteractiveGameSessionHistory } from "@game-runtime/ports/InteractiveGameEngine";
import type { UndoHistory } from "@undo-runtime/api/history";
import {
  checkpointsForTimeline,
  latestUndoTick,
  previousUndoCheckpointTick,
  previousUndoTick,
} from "@undo-runtime/impl/history";
import type { InteractiveSessionRestoreState } from "@game-runtime/impl/interactiveHandle";

export function projectInteractiveSessionHistory<TSession>(
  history: UndoHistory<TSession>,
  currentTick: number,
  restoreState: InteractiveSessionRestoreState,
): InteractiveGameSessionHistory {
  return {
    initialTick: history.initialCheckpoint.tick,
    currentTick,
    latestTick: latestUndoTick(history),
    checkpointTicks: checkpointsForTimeline(history).map((checkpoint) => checkpoint.tick),
    previousTick: previousUndoTick(history, currentTick),
    previousCheckpointTick: previousUndoCheckpointTick(history, currentTick),
    restoreMode: restoreState.mode,
    restoredFromTick: restoreState.restoredFromTick,
  };
}
