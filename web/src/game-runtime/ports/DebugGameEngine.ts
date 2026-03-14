import type { GameDebugTrace } from "@game-core/api/debug";
import type { GameCommand, GameRequest } from "@game-core/api/types";
import type { GameReplayTraceSpec } from "@game-runtime/ports/GameEngine";

export interface DebugGameEnginePort {
  runInputTraceDebug(request: GameRequest, commands: GameCommand[], maxTicks: number): Promise<GameDebugTrace>;
  runReplayTraceDebug(request: GameRequest, replay: GameReplayTraceSpec, maxTicks: number): Promise<GameDebugTrace>;
}
