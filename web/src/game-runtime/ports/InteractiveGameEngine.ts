import type { InteractiveInput } from "@game-core/api/command";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveGameFrame } from "@game-core/api/interactive";
import type { GameRequest } from "@game-core/api/types";
import type { SolutionMove } from "@content/api/solution-file";

declare const interactiveGameSessionHandleBrand: unique symbol;

export type InteractiveGameSessionHandle = {
  readonly [interactiveGameSessionHandleBrand]: "InteractiveGameSessionHandle";
};

export interface InteractiveGameSessionHistory {
  initialTick: number;
  currentTick: number;
  latestTick: number;
  checkpointTicks: number[];
  previousTick: number | null;
  previousCheckpointTick: number | null;
  restoreMode: "live" | "restored-paused";
  restoredFromTick: number | null;
}

export interface InteractiveGameSession {
  request: GameRequest;
  mode: "manual" | "replay";
  hintText: string | null;
  frame: InteractiveGameFrame;
  history: InteractiveGameSessionHistory;
  recordedMoves: SolutionMove[];
  handle: InteractiveGameSessionHandle;
}

export interface InteractiveGameEnginePort {
  startSession(request: GameRequest): Promise<InteractiveGameSession>;
  startReplaySession(request: GameRequest, replay: ReplaySolutionPayload): Promise<InteractiveGameSession>;
  advanceSession(session: InteractiveGameSession, input: InteractiveInput): Promise<InteractiveGameSession>;
  restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession>;
}
