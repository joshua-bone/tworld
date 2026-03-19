import type { UndoCheckpoint } from "@undo-runtime/api/history";
import { digestMsInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";

export type MsUndoCheckpoint = UndoCheckpoint<MsInteractiveSessionState>;

export function captureMsUndoCheckpoint(
  session: MsInteractiveSessionState,
  timelineId = "main",
): MsUndoCheckpoint {
  const sessionToken = structuredClone(session);
  return {
    tick: session.state.engine.timer.currentTime,
    ruleset: "MS",
    timelineId,
    stateDigest: digestMsInteractiveSession(sessionToken),
    sessionToken,
  };
}

export function restoreMsUndoCheckpoint(checkpoint: MsUndoCheckpoint): MsInteractiveSessionState {
  return structuredClone(checkpoint.sessionToken);
}
