import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
  InteractiveGameSessionHydrationOptions,
} from "@game-runtime/ports/InteractiveGameEngine";

export async function hydrateInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "hydrateSession">,
  session: InteractiveGameSession,
  options: InteractiveGameSessionHydrationOptions,
): Promise<InteractiveGameSession> {
  if (!engine.hydrateSession) {
    return session;
  }

  return engine.hydrateSession(session, options);
}
