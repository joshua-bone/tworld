import type {
  InteractiveGameSession,
  InteractiveGameSessionHandle,
} from "@application/ports/InteractiveGameEngine";
import type { InteractiveGameFrame } from "@domain/game/interactive";
import type { GameRequest } from "@domain/game/types";
import type { SolutionMove } from "@domain/solution-file";

interface ProjectInteractiveGameSessionParams {
  request: GameRequest;
  mode: "manual" | "replay";
  hintText: string | null;
  frame: InteractiveGameFrame;
  recordedMoves: SolutionMove[];
  handle: InteractiveGameSessionHandle;
}

export function projectInteractiveGameSession({
  request,
  mode,
  hintText,
  frame,
  recordedMoves,
  handle,
}: ProjectInteractiveGameSessionParams): InteractiveGameSession {
  return {
    request: { ...request },
    mode,
    hintText,
    frame,
    recordedMoves: recordedMoves.map((move) => ({ ...move })),
    handle,
  };
}
