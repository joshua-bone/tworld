import type { ReplaySolutionPayload } from "@domain/game/codec";
import type { GameCommand, GameRequest } from "@domain/game/types";

export interface InputTraceScenario {
  name: string;
  commandSpec: string;
  request: GameRequest;
  commands: GameCommand[];
  maxTicks: number;
}

export interface ReplayTraceScenario {
  name: string;
  request: GameRequest;
  replay: ReplaySolutionPayload & {
    bestTimeTicks: number;
    movesSpec: string;
  };
  maxTicks: number;
}
