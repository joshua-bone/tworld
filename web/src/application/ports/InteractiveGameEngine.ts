import type { GameInputName } from "@domain/game/command";
import type { ReplaySolutionPayload } from "@domain/game/codec";
import type { InteractiveGameFrame } from "@domain/game/interactive";
import type { GameRequest } from "@domain/game/types";
import type { SolutionMove } from "@domain/solution-file";

declare const interactiveGameSessionHandleBrand: unique symbol;

export type InteractiveGameSessionHandle = {
  readonly [interactiveGameSessionHandleBrand]: "InteractiveGameSessionHandle";
};

export interface InteractiveGameSession {
  request: GameRequest;
  mode: "manual" | "replay";
  hintText: string | null;
  frame: InteractiveGameFrame;
  recordedMoves: SolutionMove[];
  handle: InteractiveGameSessionHandle;
}

export interface InteractiveGameEnginePort {
  startSession(request: GameRequest): Promise<InteractiveGameSession>;
  startReplaySession(request: GameRequest, replay: ReplaySolutionPayload): Promise<InteractiveGameSession>;
  advanceSession(session: InteractiveGameSession, input: GameInputName): Promise<InteractiveGameSession>;
}
