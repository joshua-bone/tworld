import type {
  InteractiveGameEnginePort,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { GameRequest } from "@game-core/api/types";

export async function startInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "startSession">,
  request: GameRequest,
  options?: InteractiveGameSessionStartOptions,
) {
  return engine.startSession(request, options);
}
