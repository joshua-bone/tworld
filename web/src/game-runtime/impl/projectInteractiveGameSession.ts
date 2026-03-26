import type {
  InteractiveGameSessionHistory,
  InteractiveGameSession,
  InteractiveGameSessionHandle,
  InteractiveGameSessionRunState,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { InteractiveGameFrame } from "@game-core/api/interactive";
import type { GameRequest } from "@game-core/api/types";
import type { ReplayRecordedMove } from "@game-core/api/codec";

interface ProjectInteractiveGameSessionParams {
  request: GameRequest;
  mode: "manual" | "replay";
  hintText: string | null;
  frame: InteractiveGameFrame;
  history: InteractiveGameSessionHistory;
  run: InteractiveGameSessionRunState;
  recordedMoves: ReplayRecordedMove[];
  handle: InteractiveGameSessionHandle;
}

export function projectInteractiveGameSession({
  request,
  mode,
  hintText,
  frame,
  history,
  run,
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
      recentTicks: [...(history.recentTicks ?? [])],
    },
    run: {
      ...run,
      result: run.result
        ? {
            ...run.result,
            endPosition: run.result.endPosition ? { ...run.result.endPosition } : null,
            cause: run.result.cause
              ? {
                  ...run.result.cause,
                  position: run.result.cause.position ? { ...run.result.cause.position } : null,
                }
              : null,
            score: run.result.score ? { ...run.result.score } : null,
          }
        : null,
    },
    recordedMoves: recordedMoves.map((move) => ({ ...move })),
    handle,
  };
}
