import type { InteractiveGameEnginePort, InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { InteractiveInput } from "@game-core/api/command";

export async function advanceInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "advanceSession">,
  session: InteractiveGameSession,
  input: InteractiveInput,
) {
  return engine.advanceSession(session, input);
}
