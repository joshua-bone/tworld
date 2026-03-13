import type { GameDebugTrace } from "@domain/game/debug";
import type { GameCommand, GameRequest } from "@domain/game/types";
import type { GameReplayTraceSpec } from "@application/ports/GameEngine";

export interface DebugGameEnginePort {
  runInputTraceDebug(request: GameRequest, commands: GameCommand[], maxTicks: number): Promise<GameDebugTrace>;
  runReplayTraceDebug(request: GameRequest, replay: GameReplayTraceSpec, maxTicks: number): Promise<GameDebugTrace>;
}
