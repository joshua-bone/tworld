import type { InteractiveGameFrame } from "@domain/game/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@domain/game/interactiveProjection";
import type { EngineState } from "@domain/game/model";
import { engineStateToSnapshot } from "@domain/game/snapshot";
import type { LynxInteractiveSessionState } from "@domain/game/rules/lynx/engine";

interface LynxProjectedAnimationState {
  pos: number;
  frame: number;
  tileId: number;
}

interface LynxProjectedRuntimeState {
  animations: LynxProjectedAnimationState[];
  chipTeleported: boolean;
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

  return projectInteractiveFrame(
    engineStateToSnapshot(session.state, phase, session.lastInput),
    session.state.map.cells,
    {
      chip: {
        pos: session.chipPos,
        dir: session.chipDir,
        moving: session.chipMoving,
        pushing: session.chipPushing,
        hidden: runtime?.chipTeleported === true,
        failed: session.endGameResult === "failed",
        endGameAnimationTileId: session.endGameAnimationTileId,
        endGameAnimationFrame: session.endGameAnimationFrame,
      },
      actors: session.actors.map((actor) => ({
        id: actor.id,
        pos: actor.pos,
        dir: actor.dir,
        moving: actor.moving,
        frame: actor.frame,
        hidden: actor.hidden,
        animationReserved: actor.animationReserved,
      })),
      animations: runtime?.animations.map((animation) => ({ ...animation })) ?? [],
    },
  );
}
