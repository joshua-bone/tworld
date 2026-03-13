import type { InteractiveGameEnginePort, InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { GameInputName } from "@domain/game/command";

export async function advanceInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "advanceSession">,
  session: InteractiveGameSession,
  input: GameInputName,
) {
  return engine.advanceSession(session, input);
}
