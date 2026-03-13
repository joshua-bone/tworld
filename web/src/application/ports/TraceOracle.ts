import type { GameEnginePort } from "@application/ports/GameEngine";

export interface TraceOracle {
  runInputTrace: GameEnginePort["runInputTrace"];
  runReplayTrace: GameEnginePort["runReplayTrace"];
}
