import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

export function previousInteractiveGameSessionTick(session: InteractiveGameSession): number | null {
  return session.history.previousTick;
}

export function previousInteractiveGameSessionCheckpointTick(session: InteractiveGameSession): number | null {
  return session.history.previousCheckpointTick;
}
