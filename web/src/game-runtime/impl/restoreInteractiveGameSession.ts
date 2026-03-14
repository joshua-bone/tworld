import type { InteractiveGameEnginePort, InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

export async function restoreInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "restoreSession">,
  session: InteractiveGameSession,
  targetTick: number,
) {
  return engine.restoreSession(session, targetTick);
}
