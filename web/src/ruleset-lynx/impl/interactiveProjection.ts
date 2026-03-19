import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@game-core/impl/interactiveProjection";
import type { EngineState } from "@game-core/api/model";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";

interface LynxProjectedAnimationState {
  pos: number;
  frame: number;
  tileId: number;
}

interface LynxProjectedRuntimeState {
  animations: LynxProjectedAnimationState[];
  chipTeleported: boolean;
  tileOverlays: Array<InteractiveGameFrame["tileOverlays"][number] & { ttl?: number }>;
}

function lynxProjectedRuntimeState(state: EngineState): LynxProjectedRuntimeState | null {
  const runtime = (state as EngineState & { lynxRuntimeState?: LynxProjectedRuntimeState }).lynxRuntimeState;
  return runtime ?? null;
}

export function projectLynxInteractiveFrame(
  session: LynxInteractiveSessionState,
  phase: InteractiveProjectionPhase,
): InteractiveGameFrame {
  const runtime = lynxProjectedRuntimeState(session.state);
  const chipVerticalMove = session.chipMoveKind === "air" || session.chipMoveKind === "elevator";

  return projectInteractiveFrame(
    engineStateToSnapshot(session.state, phase, session.lastInput),
    session.state.map.cells,
    {
      chip: {
        pos: session.chipPos,
        z: session.chipZ,
        dir: session.chipDir,
        moving: chipVerticalMove ? 0 : session.chipMoving,
        pushing: session.chipPushing,
        hidden: runtime?.chipTeleported === true,
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
      animations: runtime?.animations.map((animation) => ({ ...animation })) ?? [],
    },
    {
      currentZ: session.chipZ ?? 1,
      layers: session.state.map.layers,
      tileOverlays: runtime?.tileOverlays?.map(({ ttl: _ttl, ...overlay }) => overlay) ?? [],
    },
  );
}
