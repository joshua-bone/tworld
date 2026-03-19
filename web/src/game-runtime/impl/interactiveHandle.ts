import type { InteractiveGameSessionHandle } from "@game-runtime/ports/InteractiveGameEngine";

export interface InteractiveSessionRestoreState {
  mode: "live" | "restored-paused" | "replaying-history";
  restoredFromTick: number | null;
  replayTargetTick: number | null;
}

export interface InteractiveSessionRuntimeState<TToken, THistory> {
  token: TToken;
  history: THistory;
  restoreState: InteractiveSessionRestoreState;
}

export function createLiveRestoreState(): InteractiveSessionRestoreState {
  return {
    mode: "live",
    restoredFromTick: null,
    replayTargetTick: null,
  };
}

export function createPausedRestoreState(targetTick: number): InteractiveSessionRestoreState {
  return {
    mode: "restored-paused",
    restoredFromTick: targetTick,
    replayTargetTick: null,
  };
}

export function createHistoricalReplayRestoreState(
  restoredFromTick: number,
  replayTargetTick: number,
): InteractiveSessionRestoreState {
  return {
    mode: "replaying-history",
    restoredFromTick,
    replayTargetTick,
  };
}

export function toInteractiveHandle<TToken, THistory>(
  runtime: InteractiveSessionRuntimeState<TToken, THistory>,
): InteractiveGameSessionHandle {
  return runtime as unknown as InteractiveGameSessionHandle;
}

export function fromInteractiveHandle<TToken, THistory>(
  handle: InteractiveGameSessionHandle,
): InteractiveSessionRuntimeState<TToken, THistory> {
  return handle as unknown as InteractiveSessionRuntimeState<TToken, THistory>;
}
