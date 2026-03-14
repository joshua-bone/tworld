import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@game-core/impl/interactiveProjection";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";

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
