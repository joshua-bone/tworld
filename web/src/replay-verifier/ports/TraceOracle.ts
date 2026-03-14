import type { GameEnginePort } from "@game-runtime/ports/GameEngine";

export interface TraceOracle {
  runInputTrace: GameEnginePort["runInputTrace"];
  runReplayTrace: GameEnginePort["runReplayTrace"];
}
