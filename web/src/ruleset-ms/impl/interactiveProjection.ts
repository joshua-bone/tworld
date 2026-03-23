import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@game-core/impl/interactiveProjection";
import type { EngineState } from "@game-core/api/model";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import { MS_FLOOR_STATE, MS_TILE } from "@ruleset-ms/api/tiles";

type MsProjectedTileOverlay = InteractiveGameFrame["tileOverlays"][number] & { ttl?: number };

function msProjectedRuntimeState(state: EngineState): { tileOverlays?: MsProjectedTileOverlay[] } | null {
  const runtime = state as EngineState & {
    msRuntimeState?: { tileOverlays?: MsProjectedTileOverlay[] };
  };
  return runtime.msRuntimeState ?? null;
}

function applyMsTrapRenderState(frame: InteractiveGameFrame, session: MsInteractiveSessionState): void {
  const visibleLayersByZ = new Map(frame.visibleLayers.map((layer) => [layer.z, layer.cells] as const));

  for (const connection of session.state.internal.traps) {
    const z = connection.toZ ?? connection.fromZ ?? 1;
    if ((connection.fromZ ?? z) !== z || (connection.toZ ?? z) !== z) {
      continue;
    }

    const cells = visibleLayersByZ.get(z);
    if (!cells) {
      continue;
    }

    const buttonCell = cells[connection.from];
    if (!buttonCell || buttonCell.top.id === MS_TILE.Button_Brown) {
      continue;
    }

    const trapCell = cells[connection.to];
    if (!trapCell) {
      continue;
    }

    if (trapCell.top.id === MS_TILE.Beartrap) {
      trapCell.top.state |= MS_FLOOR_STATE.TrapOpen;
    } else if (trapCell.bottom.id === MS_TILE.Beartrap) {
      trapCell.bottom.state |= MS_FLOOR_STATE.TrapOpen;
    }
  }
}

export function projectMsInteractiveFrame(
  session: MsInteractiveSessionState,
  phase: InteractiveProjectionPhase,
): InteractiveGameFrame {
  const runtime = msProjectedRuntimeState(session.state.engine);

  const frame = projectInteractiveFrame(
    engineStateToSnapshot(session.state.engine, phase, session.lastInput),
    session.state.engine.map.cells,
    null,
    {
      currentZ: session.state.internal.chipZ ?? 1,
      layers: session.state.engine.map.layers,
      tileOverlays: runtime?.tileOverlays?.map(({ ttl: _ttl, ...overlay }) => overlay) ?? [],
    },
  );

  applyMsTrapRenderState(frame, session);
  return frame;
}
