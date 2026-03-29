import type { MsQueueTraceEvent } from "./engineTypes";

let msQueueTraceHook: ((event: MsQueueTraceEvent) => void) | null = null;

export function setMsQueueTraceHook(hook: ((event: MsQueueTraceEvent) => void) | null): void {
  msQueueTraceHook = hook;
}

export function emitMsQueueTrace(event: MsQueueTraceEvent): void {
  msQueueTraceHook?.(event);
}
