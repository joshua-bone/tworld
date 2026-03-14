import type {
  InteractiveGameSessionHistory,
  InteractiveGameSession,
  InteractiveGameSessionHandle,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { InteractiveGameFrame } from "@game-core/api/interactive";
import type { GameRequest } from "@game-core/api/types";
import type { SolutionMove } from "@content/api/solution-file";

interface ProjectInteractiveGameSessionParams {
  request: GameRequest;
  mode: "manual" | "replay";
  hintText: string | null;
  frame: InteractiveGameFrame;
  history: InteractiveGameSessionHistory;
  recordedMoves: SolutionMove[];
  handle: InteractiveGameSessionHandle;
}

export function projectInteractiveGameSession({
  request,
  mode,
  hintText,
  frame,
  history,
  recordedMoves,
  handle,
}: ProjectInteractiveGameSessionParams): InteractiveGameSession {
  return {
    request: { ...request },
    mode,
    hintText,
    frame,
    history: {
      ...history,
      checkpointTicks: [...history.checkpointTicks],
    },
    recordedMoves: recordedMoves.map((move) => ({ ...move })),
    handle,
  };
}
