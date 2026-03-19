import type { UndoCheckpoint } from "@undo-runtime/api/history";
import { digestLynxInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";

export type LynxUndoCheckpoint = UndoCheckpoint<LynxInteractiveSessionState>;

export function captureLynxUndoCheckpoint(
  session: LynxInteractiveSessionState,
  timelineId = "main",
): LynxUndoCheckpoint {
  const sessionToken = structuredClone(session);
  return {
    tick: session.state.timer.currentTime,
    ruleset: "Lynx",
    timelineId,
    stateDigest: digestLynxInteractiveSession(sessionToken),
    sessionToken,
  };
}

export function restoreLynxUndoCheckpoint(checkpoint: LynxUndoCheckpoint): LynxInteractiveSessionState {
  return structuredClone(checkpoint.sessionToken);
}
