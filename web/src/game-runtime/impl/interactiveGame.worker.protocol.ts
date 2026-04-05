import type { InteractiveInput } from "@game-core/api/command";
import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { GameRequest } from "@game-core/api/types";
import type {
  InteractiveGameSession,
  InteractiveGameSessionHandle,
  InteractiveGameSessionHistory,
  InteractiveGameSessionRunState,
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

export interface WorkerInteractiveGameSessionArrayPatch<TValue> {
  mode: "append" | "replace";
  totalCount: number;
  values: TValue[];
}

export interface WorkerInteractiveGameSessionHistoryUpdate
  extends Omit<InteractiveGameSessionHistory, "checkpointTicks"> {
  checkpointTicks: WorkerInteractiveGameSessionArrayPatch<number>;
}

export interface WorkerInteractiveGameSessionUpdate {
  hintText: string | null;
  frame: InteractiveGameSession["frame"];
  history: WorkerInteractiveGameSessionHistoryUpdate;
  run: InteractiveGameSessionRunState;
  recordedMoves: WorkerInteractiveGameSessionArrayPatch<ReplayRecordedMove>;
}

function cloneRecordedMove(move: ReplayRecordedMove): ReplayRecordedMove {
  return {
    ...move,
  };
}

function sameRecordedMove(left: ReplayRecordedMove, right: ReplayRecordedMove): boolean {
  return (
    left.when === right.when &&
    left.dir === right.dir &&
    (left.modifierMask ?? 0) === (right.modifierMask ?? 0)
  );
}

function buildArrayPatch<TValue>(
  previous: readonly TValue[],
  next: readonly TValue[],
  sameValue: (left: TValue, right: TValue) => boolean,
  cloneValue: (value: TValue) => TValue,
): WorkerInteractiveGameSessionArrayPatch<TValue> {
  const canAppend =
    next.length >= previous.length &&
    previous.every((value, index) => sameValue(value, next[index]!));

  return canAppend
    ? {
        mode: "append",
        totalCount: next.length,
        values: next.slice(previous.length).map(cloneValue),
      }
    : {
        mode: "replace",
        totalCount: next.length,
        values: next.map(cloneValue),
      };
}

function applyArrayPatch<TValue>(
  previous: readonly TValue[],
  patch: WorkerInteractiveGameSessionArrayPatch<TValue>,
  cloneValue: (value: TValue) => TValue,
): TValue[] {
  if (patch.mode === "append" && previous.length + patch.values.length === patch.totalCount) {
    return [...previous, ...patch.values.map(cloneValue)];
  }

  return patch.values.map(cloneValue);
}

export function toWorkerInteractiveGameSessionUpdate(
  previous: InteractiveGameSession,
  next: InteractiveGameSession,
): WorkerInteractiveGameSessionUpdate {
  return {
    hintText: next.hintText,
    frame: next.frame,
    history: {
      enabled: next.history.enabled,
      initialTick: next.history.initialTick,
      currentTick: next.history.currentTick,
      latestTick: next.history.latestTick,
      checkpointTicks: buildArrayPatch(
        previous.history.checkpointTicks,
        next.history.checkpointTicks,
        (left, right) => left === right,
        (value) => value,
      ),
      recentTicks: next.history.recentTicks ? [...next.history.recentTicks] : undefined,
      previousTick: next.history.previousTick,
      previousCheckpointTick: next.history.previousCheckpointTick,
      timelineId: next.history.timelineId,
      timelineCount: next.history.timelineCount,
      restoreMode: next.history.restoreMode,
      restoredFromTick: next.history.restoredFromTick,
      replayTargetTick: next.history.replayTargetTick,
    },
    run: next.run,
    recordedMoves: buildArrayPatch(previous.recordedMoves, next.recordedMoves, sameRecordedMove, cloneRecordedMove),
  };
}

export function applyWorkerInteractiveGameSessionUpdate(
  previous: InteractiveGameSession,
  update: WorkerInteractiveGameSessionUpdate,
): InteractiveGameSession {
  return {
    ...previous,
    hintText: update.hintText,
    frame: update.frame,
    history: {
      ...update.history,
      checkpointTicks: applyArrayPatch(previous.history.checkpointTicks, update.history.checkpointTicks, (value) => value),
      recentTicks: update.history.recentTicks ? [...update.history.recentTicks] : undefined,
    },
    run: update.run,
    recordedMoves: applyArrayPatch(previous.recordedMoves, update.recordedMoves, cloneRecordedMove),
  };
}

export type InteractiveGameWorkerRequest =
  | {
      id: number;
      type: "ping";
    }
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
  sessionUpdate?: WorkerInteractiveGameSessionUpdate;
}
