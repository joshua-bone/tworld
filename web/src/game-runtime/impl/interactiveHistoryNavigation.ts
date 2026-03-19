import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { fromInteractiveHandle } from "@game-runtime/impl/interactiveHandle";
import { previousUndoTick } from "@undo-runtime/impl/history";
import type { UndoHistory } from "@undo-runtime/api/history";

export function previousInteractiveGameSessionTick(session: InteractiveGameSession): number | null {
  return session.history.previousTick;
}

export function previousInteractiveGameSessionTickByCount(
  session: InteractiveGameSession,
  count: number,
): number | null {
  if (count <= 0) {
    return null;
  }

  const runtime = fromInteractiveHandle<unknown, UndoHistory<unknown>>(session.handle);
  let currentTick = session.history.currentTick;
  let targetTick: number | null = null;

  for (let index = 0; index < count; index += 1) {
    const nextTick = previousUndoTick(runtime.history, currentTick);
    if (nextTick === null) {
      break;
    }
    targetTick = nextTick;
    currentTick = nextTick;
  }

  return targetTick;
}

export function previousInteractiveGameSessionCheckpointTick(session: InteractiveGameSession): number | null {
  return session.history.previousCheckpointTick;
}

export function previousInteractiveGameSessionExponentialCheckpointTick(
  session: InteractiveGameSession,
  baseAgeTicks: number,
): number | null {
  if (!session.history.enabled || baseAgeTicks <= 0) {
    return null;
  }

  const normalizedBaseAgeTicks = Math.max(1, baseAgeTicks);
  const currentAgeTicks = Math.max(0, session.history.latestTick - session.history.currentTick);
  const nextAgeTicks =
    currentAgeTicks < normalizedBaseAgeTicks
      ? normalizedBaseAgeTicks
      : normalizedBaseAgeTicks * 2 ** (Math.floor(Math.log2(currentAgeTicks / normalizedBaseAgeTicks)) + 1);
  const targetTick = Math.max(session.history.initialTick, session.history.latestTick - nextAgeTicks);
  return targetTick < session.history.currentTick ? targetTick : null;
}
