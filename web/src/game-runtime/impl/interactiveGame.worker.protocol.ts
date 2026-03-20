import type { InteractiveInput } from "@game-core/api/command";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { GameRequest } from "@game-core/api/types";
import type {
  InteractiveGameSession,
  InteractiveGameSessionHandle,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";

export interface WorkerInteractiveGameSessionHandlePayload {
  sessionId: number;
}

export function toWorkerInteractiveGameSessionHandle(sessionId: number): InteractiveGameSessionHandle {
  return { sessionId } as unknown as InteractiveGameSessionHandle;
}

export function readWorkerInteractiveGameSessionId(handle: InteractiveGameSessionHandle): number | null {
  if (
    typeof handle === "object" &&
    handle !== null &&
    "sessionId" in handle &&
    typeof (handle as WorkerInteractiveGameSessionHandlePayload).sessionId === "number"
  ) {
    return (handle as WorkerInteractiveGameSessionHandlePayload).sessionId;
  }

  return null;
}

export type InteractiveGameWorkerRequest =
  | {
      id: number;
      type: "start-session";
      request: GameRequest;
      options?: InteractiveGameSessionStartOptions;
    }
  | {
      id: number;
      type: "start-replay-session";
      request: GameRequest;
      replay: ReplaySolutionPayload;
      options?: InteractiveGameSessionStartOptions;
    }
  | {
      id: number;
      type: "advance-session";
      sessionId: number;
      input: InteractiveInput;
    }
  | {
      id: number;
      type: "restore-session";
      sessionId: number;
      targetTick: number;
    }
  | {
      id: number;
      type: "resume-session";
      sessionId: number;
    }
  | {
      id: number;
      type: "dispose-session";
      sessionId: number;
    }
  | {
      id: number;
      type: "sync-imported-dat";
      filename: string;
      datHash: string;
      datBytes: Uint8Array;
    }
  | {
      id: number;
      type: "delete-imported-dat";
      filename: string;
    };

export interface InteractiveGameWorkerResponse {
  id: number;
  error?: string;
  session?: InteractiveGameSession;
}
