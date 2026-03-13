import type { InteractiveGameEnginePort } from "@application/ports/InteractiveGameEngine";
import type { GameRequest } from "@domain/game/types";

export async function startInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "startSession">,
  request: GameRequest,
) {
  return engine.startSession(request);
}
