import type {
  InteractiveGameEnginePort,
  InteractiveGameReplayLaunch,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { GameRequest } from "@game-core/api/types";

export async function startReplayInteractiveGameSession(
  engine: Pick<InteractiveGameEnginePort, "startReplaySession" | "startOpaqueReplaySession">,
  request: GameRequest,
  launch: InteractiveGameReplayLaunch,
  options?: InteractiveGameSessionStartOptions,
) {
  if (launch.kind === "legacy") {
    return engine.startReplaySession(request, launch.replay, options);
  }

  if (!engine.startOpaqueReplaySession) {
    throw new Error(`${request.ruleset} engine does not support ${launch.replay.format} replay playback`);
  }

  return engine.startOpaqueReplaySession(request, launch.replay, options);
}
