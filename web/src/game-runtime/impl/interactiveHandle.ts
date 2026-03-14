import type { InteractiveGameSessionHandle } from "@game-runtime/ports/InteractiveGameEngine";

export interface InteractiveSessionRestoreState {
  mode: "live" | "restored-paused";
  restoredFromTick: number | null;
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
  };
}

export function createPausedRestoreState(targetTick: number): InteractiveSessionRestoreState {
  return {
    mode: "restored-paused",
    restoredFromTick: targetTick,
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
