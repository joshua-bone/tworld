import type { InteractiveGameEnginePort, InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { InteractiveInput } from "@domain/game/command";

export async function advanceInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "advanceSession">,
  session: InteractiveGameSession,
  input: InteractiveInput,
) {
  return engine.advanceSession(session, input);
}
