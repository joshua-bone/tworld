import type { UndoCheckpoint } from "@undo-runtime/api/history";
import { digestMsInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";

export type MsUndoCheckpoint = UndoCheckpoint<MsInteractiveSessionState>;

interface CaptureMsUndoCheckpointOptions {
  lazySnapshot?: boolean;
}

export function captureMsUndoCheckpoint(
  session: MsInteractiveSessionState,
  timelineId = "main",
  options: CaptureMsUndoCheckpointOptions = {},
): MsUndoCheckpoint {
  if (!options.lazySnapshot) {
    const sessionToken = structuredClone(session);
    return {
      tick: session.state.engine.timer.currentTime,
      ruleset: "MS",
      timelineId,
      sessionToken,
      stateDigest: digestMsInteractiveSession(sessionToken),
    };
  }

  let sessionToken: MsInteractiveSessionState | null = null;
  let stateDigest: ReturnType<typeof digestMsInteractiveSession> | null = null;
  const checkpoint = {
    tick: session.state.engine.timer.currentTime,
    ruleset: "MS",
    timelineId,
  } as MsUndoCheckpoint;

  Object.defineProperties(checkpoint, {
    sessionToken: {
      configurable: true,
      enumerable: true,
      get() {
        if (sessionToken === null) {
          sessionToken = structuredClone(session);
        }
        return sessionToken;
      },
    },
    stateDigest: {
      configurable: true,
      enumerable: true,
      get() {
        if (stateDigest === null) {
          stateDigest = digestMsInteractiveSession(checkpoint.sessionToken);
        }
        return stateDigest;
      },
    },
  });

  return checkpoint;
}

export function restoreMsUndoCheckpoint(checkpoint: MsUndoCheckpoint): MsInteractiveSessionState {
  return structuredClone(checkpoint.sessionToken);
}
