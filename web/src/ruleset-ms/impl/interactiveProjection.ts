import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@game-core/impl/interactiveProjection";
import type { EngineState } from "@game-core/api/model";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";

function msProjectedRuntimeState(state: EngineState): { tileOverlays?: InteractiveGameFrame["tileOverlays"] } | null {
  const runtime = state as EngineState & {
    msRuntimeState?: { tileOverlays?: InteractiveGameFrame["tileOverlays"] };
  };
  return runtime.msRuntimeState ?? null;
}

export function projectMsInteractiveFrame(
  session: MsInteractiveSessionState,
  phase: InteractiveProjectionPhase,
): InteractiveGameFrame {
  const runtime = msProjectedRuntimeState(session.state.engine);

  return projectInteractiveFrame(
    engineStateToSnapshot(session.state.engine, phase, session.lastInput),
    session.state.engine.map.cells,
    null,
    {
      currentZ: session.state.internal.chipZ ?? 1,
      layers: session.state.engine.map.layers,
      tileOverlays: runtime?.tileOverlays ?? [],
    },
  );
}
