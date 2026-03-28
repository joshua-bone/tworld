import type { LynxMoveKind } from "@ruleset-lynx/impl/verticalMovement";

export type LynxEndGameResult = "completed" | "failed";

export interface LynxEndGameState {
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
}

export interface LynxChipTurnState extends LynxEndGameState {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
}

export interface LynxHeldButtonResolution extends LynxEndGameState {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  consumedReplayInput: boolean;
  deferredChipInputCode: number;
  chipArrivedOnTrapThisTick: boolean;
}

export interface LynxPostMoveResolution extends LynxEndGameState {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  chipMoveKind: LynxMoveKind;
}

export interface LynxHeldButtonReplayState {
  replayMode: boolean;
  currentInputCode: number;
  queuedReplayInputCode: number;
  queuedChipInputCode: number;
  recordedReplayInputCode: number;
}

export interface LynxHeldButtonReplayUpdate extends LynxHeldButtonReplayState {
  consumedLastMoveCode: number | null;
}

export function applyLynxHeldButtonReplayConsumption(
  replayState: LynxHeldButtonReplayState,
  resolution: LynxHeldButtonResolution,
): LynxHeldButtonReplayUpdate {
  if (!resolution.consumedReplayInput) {
    return {
      ...replayState,
      consumedLastMoveCode: null,
    };
  }

  if (replayState.replayMode) {
    return {
      replayMode: replayState.replayMode,
      currentInputCode: 0,
      queuedReplayInputCode:
        resolution.deferredChipInputCode !== 0 ? replayState.currentInputCode : replayState.queuedReplayInputCode,
      queuedChipInputCode:
        resolution.deferredChipInputCode !== 0 ? resolution.deferredChipInputCode : replayState.queuedChipInputCode,
      recordedReplayInputCode: replayState.recordedReplayInputCode,
      consumedLastMoveCode: replayState.currentInputCode,
    };
  }

  return {
    ...replayState,
    recordedReplayInputCode: replayState.currentInputCode,
    consumedLastMoveCode: null,
  };
}
