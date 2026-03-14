import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { GameRequest } from "@game-core/api/types";

export async function startReplayInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "startReplaySession">,
  request: GameRequest,
  replay: ReplaySolutionPayload,
) {
  return engine.startReplaySession(request, replay);
}
