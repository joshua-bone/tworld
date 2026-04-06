import type { UndoCheckpoint } from "@undo-runtime/api/history";
import { digestLynxInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";

export type LynxUndoCheckpoint = UndoCheckpoint<LynxInteractiveSessionState>;

interface CaptureLynxUndoCheckpointOptions {
  lazySnapshot?: boolean;
}

export function captureLynxUndoCheckpoint(
  session: LynxInteractiveSessionState,
  timelineId = "main",
  options: CaptureLynxUndoCheckpointOptions = {},
): LynxUndoCheckpoint {
  if (!options.lazySnapshot) {
    const sessionToken = structuredClone(session);
    return {
      tick: session.state.timer.currentTime,
      ruleset: "Lynx",
      timelineId,
      sessionToken,
      stateDigest: digestLynxInteractiveSession(sessionToken),
    };
  }

  let sessionToken: LynxInteractiveSessionState | null = null;
  let stateDigest: ReturnType<typeof digestLynxInteractiveSession> | null = null;
  const checkpoint = {
    tick: session.state.timer.currentTime,
    ruleset: "Lynx",
    timelineId,
  } as LynxUndoCheckpoint;

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
          stateDigest = digestLynxInteractiveSession(checkpoint.sessionToken);
        }
        return stateDigest;
      },
    },
  });

  return checkpoint;
}

export function restoreLynxUndoCheckpoint(checkpoint: LynxUndoCheckpoint): LynxInteractiveSessionState {
  return structuredClone(checkpoint.sessionToken);
}
