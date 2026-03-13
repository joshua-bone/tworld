import type { InteractiveGameEnginePort } from "@application/ports/InteractiveGameEngine";
import type { ReplaySolutionPayload } from "@domain/game/codec";
import type { GameRequest } from "@domain/game/types";

export async function startReplayInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "startReplaySession">,
  request: GameRequest,
  replay: ReplaySolutionPayload,
) {
  return engine.startReplaySession(request, replay);
}
