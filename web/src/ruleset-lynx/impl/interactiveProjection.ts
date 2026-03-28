import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@game-core/impl/interactiveProjection";
import type { EngineState } from "@game-core/api/model";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import { collectLevelConnections } from "@ruleset-ms/api/level";
import { MS_TILE } from "@ruleset-ms/api/tiles";

interface LynxProjectedAnimationState {
  pos: number;
  frame: number;
  tileId: number;
}

interface LynxProjectedRuntimeState {
  visuals?: {
    animations?: LynxProjectedAnimationState[];
    tileOverlays?: Array<InteractiveGameFrame["tileOverlays"][number] & { ttl?: number }>;
  };
  chipRuntime?: {
    chipTeleported?: boolean;
  };
  portableTools?: {
    primedToolDrop?: {
      tileId: number;
      pos: number;
      z: number;
    } | null;
  };
}

function lynxProjectedRuntimeState(state: EngineState): LynxProjectedRuntimeState | null {
  const runtime = (state as EngineState & { lynxRuntimeState?: LynxProjectedRuntimeState }).lynxRuntimeState;
  return runtime ?? null;
}

function applyLynxTrapRenderState(frame: InteractiveGameFrame, session: LynxInteractiveSessionState): void {
  const visibleLayersByZ = new Map(frame.visibleLayers.map((layer) => [layer.z, layer.cells] as const));
  const heldButtonsByZ = new Map<number, Set<number>>();

  const markHeldButton = (z: number, pos: number): void => {
    let heldButtons = heldButtonsByZ.get(z);
    if (!heldButtons) {
      heldButtons = new Set<number>();
      heldButtonsByZ.set(z, heldButtons);
    }
    heldButtons.add(pos);
  };

  const trackHeldButton = (z: number, pos: number): void => {
    const cells = visibleLayersByZ.get(z);
    if (!cells || cells[pos]?.top.id !== MS_TILE.Button_Brown) {
      return;
    }

    markHeldButton(z, pos);
  };

  if (session.chipMoving <= 0) {
    trackHeldButton(session.chipZ ?? 1, session.chipPos);
  }

  for (const actor of session.actors) {
    if (actor.hidden || actor.moving > 0) {
      continue;
    }
    trackHeldButton(actor.z ?? 1, actor.pos);
  }

  for (const layer of frame.visibleLayers) {
    for (const cell of layer.cells) {
      if (cell.top.id === MS_TILE.Sandbag && cell.bottom.id === MS_TILE.Button_Brown) {
        markHeldButton(layer.z, cell.position.pos);
      }
    }
  }

  for (const connection of collectLevelConnections(session.level, "traps")) {
    const z = connection.toZ ?? connection.fromZ ?? 1;
    if ((connection.fromZ ?? z) !== z || (connection.toZ ?? z) !== z) {
      continue;
    }
    if (!heldButtonsByZ.get(z)?.has(connection.from)) {
      continue;
    }

    const trapCell = visibleLayersByZ.get(z)?.[connection.to];
    if (!trapCell) {
      continue;
    }

    if (trapCell.top.id === MS_TILE.Beartrap) {
      trapCell.top.state |= LYNX_CELL_FLAG.TrapOpen;
    } else if (trapCell.bottom.id === MS_TILE.Beartrap) {
      trapCell.bottom.state |= LYNX_CELL_FLAG.TrapOpen;
    }
  }
}

export function projectLynxInteractiveFrame(
  session: LynxInteractiveSessionState,
  phase: InteractiveProjectionPhase,
): InteractiveGameFrame {
  const runtime = lynxProjectedRuntimeState(session.state);
  const chipVerticalMove = session.chipMoveKind === "air" || session.chipMoveKind === "elevator";

  const frame = projectInteractiveFrame(
    engineStateToSnapshot(session.state, phase, session.lastInput),
    session.state.map.cells,
    {
      chip: {
        pos: session.chipPos,
        z: session.chipZ,
        dir: session.chipDir,
        moving: chipVerticalMove ? 0 : session.chipMoving,
        pushing: session.chipPushing,
        hidden: runtime?.chipRuntime?.chipTeleported === true,
        failed: session.endGameResult === "failed",
        endGameAnimationTileId: session.endGameAnimationTileId,
        endGameAnimationFrame: session.endGameAnimationFrame,
        scale: session.chipMoveKind === "air" && session.chipMoving > 0 ? 0.9 + (session.chipMoving / 8) * 0.1 : 1,
      },
      actors: session.actors.map((actor) => ({
        id: actor.id,
        pos: actor.pos,
        z: actor.z,
        dir: actor.dir,
        moving: actor.moveKind === "air" || actor.moveKind === "elevator" ? 0 : actor.moving,
        frame: actor.moveKind === "air" || actor.moveKind === "elevator" ? 0 : actor.frame,
        hidden: actor.hidden,
        animationReserved: actor.animationReserved,
        scale: actor.moveKind === "air" && actor.moving > 0 ? 0.9 + (actor.moving / 8) * 0.1 : 1,
      })),
      animations: runtime?.visuals?.animations?.map((animation) => ({ ...animation })) ?? [],
    },
    {
      currentZ: session.chipZ ?? 1,
      layers: session.state.map.layers,
      tileOverlays: [
        ...(runtime?.visuals?.tileOverlays?.map(({ ttl: _ttl, ...overlay }) => overlay) ?? []),
        ...(runtime?.portableTools?.primedToolDrop
          ? [
              {
                z: runtime.portableTools.primedToolDrop.z,
                pos: runtime.portableTools.primedToolDrop.pos,
                kind: "carried-tool" as const,
                tileId: runtime.portableTools.primedToolDrop.tileId,
              },
            ]
          : []),
      ],
    },
  );

  applyLynxTrapRenderState(frame, session);
  return frame;
}
