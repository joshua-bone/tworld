import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";
import type { GameRequest } from "@game-core/api/types";

export async function startInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "startSession">,
  request: GameRequest,
) {
  return engine.startSession(request);
}
