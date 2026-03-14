import type { InteractiveGameFrame } from "@domain/game/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@domain/game/interactiveProjection";
import { engineStateToSnapshot } from "@domain/game/snapshot";
import type { MsInteractiveSessionState } from "@domain/game/rules/ms/engine";

export function projectMsInteractiveFrame(
  session: MsInteractiveSessionState,
  phase: InteractiveProjectionPhase,
): InteractiveGameFrame {
  return projectInteractiveFrame(
    engineStateToSnapshot(session.state.engine, phase, session.lastInput),
    session.state.engine.map.cells,
    null,
  );
}
