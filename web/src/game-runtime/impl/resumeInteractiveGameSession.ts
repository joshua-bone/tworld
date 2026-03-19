import type { InteractiveGameEnginePort, InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

export async function resumeInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "resumeSession">,
  session: InteractiveGameSession,
) {
  return engine.resumeSession(session);
}
