import {
  previousInteractiveGameSessionExponentialCheckpointTick,
  previousInteractiveGameSessionTickByCount,
} from "@game-runtime/impl/interactiveHistoryNavigation";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

const GAME_TICKS_PER_SECOND = 20;
const MODERN_UNDO_STEP_TICK_COUNT = 4;
const MODERN_UNDO_SMOOTH_LIMIT_SECONDS = 8;
const MODERN_UNDO_SMOOTH_LIMIT_TICKS = MODERN_UNDO_SMOOTH_LIMIT_SECONDS * GAME_TICKS_PER_SECOND;
const MODERN_UNDO_CHECKPOINT_BASE_TICKS = GAME_TICKS_PER_SECOND;

export interface ModernUndoTarget {
  continueHolding: boolean;
  mode: "checkpoint" | "smooth";
  targetTick: number;
}

export function gameplayTimeRemainingTicks(session: InteractiveGameSession): number {
  return Math.max(0, session.frame.snapshot.timelimit - Math.max(session.frame.snapshot.currentTime, 0));
}

export function nextModernUndoTarget(session: InteractiveGameSession): ModernUndoTarget | null {
  if (!session.history.enabled) {
    return null;
  }

  const currentAgeTicks = Math.max(0, session.history.latestTick - session.history.currentTick);
  if (currentAgeTicks < MODERN_UNDO_SMOOTH_LIMIT_TICKS) {
    const previousStepTick = previousInteractiveGameSessionTickByCount(session, MODERN_UNDO_STEP_TICK_COUNT);
    if (previousStepTick === null) {
      return null;
    }

    const smoothLimitTick = Math.max(
      session.history.initialTick,
      session.history.latestTick - MODERN_UNDO_SMOOTH_LIMIT_TICKS,
    );
    const targetTick = Math.max(previousStepTick, smoothLimitTick);
    return {
      continueHolding: targetTick > smoothLimitTick,
      mode: "smooth",
      targetTick,
    };
  }

  const checkpointTick = previousInteractiveGameSessionExponentialCheckpointTick(
    session,
    MODERN_UNDO_CHECKPOINT_BASE_TICKS,
  );
  if (checkpointTick === null) {
    return null;
  }

  return {
    continueHolding: false,
    mode: "checkpoint",
    targetTick: checkpointTick,
  };
}
