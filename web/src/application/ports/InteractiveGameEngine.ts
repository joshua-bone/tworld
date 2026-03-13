import type { EngineMapCell } from "@domain/game/model";
import type { GameInputName } from "@domain/game/command";
import type { ReplaySolutionPayload } from "@domain/game/codec";
import type { GameRequest, GameSnapshot } from "@domain/game/types";
import type { SolutionMove } from "@domain/solution-file";

export interface InteractiveGameFrame {
  snapshot: GameSnapshot;
  cells: EngineMapCell[];
}

export interface InteractiveGameSession {
  request: GameRequest;
  mode: "manual" | "replay";
  hintText: string | null;
  frame: InteractiveGameFrame;
  recordedMoves: SolutionMove[];
  token: unknown;
}

export interface InteractiveGameEnginePort {
  startSession(request: GameRequest): Promise<InteractiveGameSession>;
  startReplaySession(request: GameRequest, replay: ReplaySolutionPayload): Promise<InteractiveGameSession>;
  advanceSession(session: InteractiveGameSession, input: GameInputName): Promise<InteractiveGameSession>;
}
