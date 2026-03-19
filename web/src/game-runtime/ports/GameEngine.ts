import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { GameCommand, GameRequest, GameSnapshot, GameTrace } from "@game-core/api/types";

export type GameEngineRequest = GameRequest;
export type GameEngineCommand = GameCommand;
export type GameEngineSnapshot = GameSnapshot;
export type GameEngineTrace = GameTrace;
export type GameReplayTraceSpec = ReplaySolutionPayload & {
  bestTimeTicks: number;
};

export interface GameEnginePort {
  supportsRuleset?(ruleset: GameEngineRequest["ruleset"]): boolean;
  runInputTrace(request: GameEngineRequest, commands: GameEngineCommand[], maxTicks: number): Promise<GameEngineTrace>;
  runReplayTrace(request: GameEngineRequest, replay: GameReplayTraceSpec, maxTicks: number): Promise<GameEngineTrace>;
}
