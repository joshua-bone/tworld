import type { InteractiveInput } from "@game-core/api/command";
import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveGameFrame } from "@game-core/api/interactive";
import type { GameRequest } from "@game-core/api/types";
import type { UndoSettingsSnapshot } from "@undo-runtime/api/history";

declare const interactiveGameSessionHandleBrand: unique symbol;

export type InteractiveGameSessionHandle = {
  readonly [interactiveGameSessionHandleBrand]: "InteractiveGameSessionHandle";
};

export interface InteractiveGameSessionHistory {
  enabled: boolean;
  initialTick: number;
  currentTick: number;
  latestTick: number;
  checkpointCount?: number;
  checkpointTicks?: number[];
  recentTicks?: number[];
  previousTick: number | null;
  previousCheckpointTick: number | null;
  timelineId: string;
  timelineCount: number;
  restoreMode: "live" | "restored-paused" | "replaying-history";
  restoredFromTick: number | null;
  replayTargetTick: number | null;
}

export interface InteractiveGameGridPosition {
  x: number;
  y: number;
  z: number | null;
}

export type InteractiveGameSessionResultOutcome =
  | "failed"
  | "completed-with-undo"
  | "completed-clean";

export type InteractiveGameSessionEndCauseKind =
  | "monster"
  | "fire"
  | "water"
  | "bomb"
  | "timeout"
  | "other";

export interface InteractiveGameSessionEndCause {
  kind: InteractiveGameSessionEndCauseKind;
  message: string;
  position: InteractiveGameGridPosition | null;
  actorId: number | null;
  actorName: string | null;
  tileId: number | null;
}

export interface InteractiveGameSessionScoreSummary {
  baseScore: number;
  timeBonus: number;
  undoPenaltyApplied: boolean;
  undoPenaltyMultiplier: number;
  finalScore: number;
}

export interface InteractiveGameSessionResultSummary {
  outcome: InteractiveGameSessionResultOutcome;
  endPosition: InteractiveGameGridPosition | null;
  cause: InteractiveGameSessionEndCause | null;
  score: InteractiveGameSessionScoreSummary | null;
}

export interface InteractiveGameSessionRunState {
  undoUsedCount: number;
  replayAvailable: boolean;
  result: InteractiveGameSessionResultSummary | null;
}

export interface InteractiveGameSessionStartOptions {
  undoSettings?: Partial<UndoSettingsSnapshot>;
  msStepping?: 0 | 4;
}

export interface InteractiveGameSessionHydrationOptions {
  historyDetails?: boolean;
  replayData?: boolean;
}

export interface InteractiveGameOpaqueReplay {
  format: string;
  bytes: Uint8Array;
}

export interface InteractiveGameOpaqueReplayExport extends InteractiveGameOpaqueReplay {
  suggestedFilename: string;
  mimeType: string;
}

export type InteractiveGameReplayLaunch =
  | {
      kind: "legacy";
      replay: ReplaySolutionPayload;
    }
  | {
      kind: "opaque";
      replay: InteractiveGameOpaqueReplay;
    };

export interface InteractiveGameSessionLoadPerf {
  levelLoadMs?: number;
  prepareLevelMs?: number;
  initialProjectionMs?: number;
  initialRuntimeInitMs?: number;
  initialFrameProjectionMs?: number;
  initialHistoryProjectionMs?: number;
  initialSessionStateMs?: number;
  initialSessionPackagingMs?: number;
}

export interface InteractiveGameSession {
  request: GameRequest;
  mode: "manual" | "replay";
  hintText: string | null;
  frame: InteractiveGameFrame;
  history: InteractiveGameSessionHistory;
  run: InteractiveGameSessionRunState;
  loadPerf?: InteractiveGameSessionLoadPerf;
  recordedMoveCount?: number;
  recordedMoves?: ReplayRecordedMove[];
  handle: InteractiveGameSessionHandle;
}

export interface InteractiveGameEnginePort {
  /**
   * Identifies the engine-owned replay format accepted by
   * `startOpaqueReplaySession`. Generic hosts must not inspect its bytes.
   */
  readonly opaqueReplayFormat?: string;
  startSession(request: GameRequest, options?: InteractiveGameSessionStartOptions): Promise<InteractiveGameSession>;
  startReplaySession(
    request: GameRequest,
    replay: ReplaySolutionPayload,
    options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession>;
  startOpaqueReplaySession?(
    request: GameRequest,
    replay: InteractiveGameOpaqueReplay,
    options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession>;
  validateOpaqueReplay?(
    request: GameRequest,
    replay: InteractiveGameOpaqueReplay,
  ): Promise<void>;
  exportOpaqueReplay?(session: InteractiveGameSession): Promise<InteractiveGameOpaqueReplayExport | null>;
  advanceSession(session: InteractiveGameSession, input: InteractiveInput): Promise<InteractiveGameSession>;
  restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession>;
  resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession>;
  hydrateSession?(
    session: InteractiveGameSession,
    options: InteractiveGameSessionHydrationOptions,
  ): Promise<InteractiveGameSession>;
  disposeSession?(session: InteractiveGameSession): Promise<void>;
}
