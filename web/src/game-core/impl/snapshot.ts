import type { EngineState } from "@game-core/api/model";
import type { GameActor, GameRuntimeCommand, GameSnapshot } from "@game-core/api/types";

function cloneActor(actor: GameActor): GameActor {
  return {
    ...actor,
    position: { ...actor.position },
  };
}

export function engineStateToSnapshot(
  state: EngineState,
  phase: string,
  input: Pick<GameRuntimeCommand, "inputCode" | "inputName">,
): GameSnapshot {
  const fallbackChip =
    state.chip === null
      ? {
          id: -1,
          layer: -1,
          dir: "none",
          position: {
            x: Math.trunc(state.view.x / 8),
            y: Math.trunc(state.view.y / 8),
            pos: Math.trunc(state.view.x / 8) + Math.trunc(state.view.y / 8) * 32,
          },
          state: 0,
          source: "view",
        }
      : null;
  return {
    phase,
    input: input.inputName,
    inputCode: input.inputCode,
    status: state.status,
    tick: state.timer.tick,
    currentTime: state.timer.currentTime,
    timeOffset: state.timer.timeOffset,
    secondsPlayed: state.timer.secondsPlayed,
    timelimit: state.timer.timeLimit,
    chipsNeeded: state.inventory.chipsNeeded,
    statusFlags: state.statusFlags,
    lastMoveCode: state.lastMove.code,
    lastMove: state.lastMove.name,
    stepping: state.replay.stepping,
    initRandomSlideDir: state.replay.initialRandomSlideDirection,
    replayCursor: state.replay.cursor,
    randomState: {
      main: { ...state.replay.randomState.main },
      lynx: { ...state.replay.randomState.lynx },
    },
    soundEffects: state.soundEffects,
    view: { ...state.view },
    inventory: {
      keys: [...state.inventory.keys],
      boots: [...state.inventory.boots],
      tools: [...state.inventory.tools],
    },
    chip: state.chip ? cloneActor(state.chip) : fallbackChip,
    creatureCount: state.map.creatureCount,
    creaturesHash: state.map.creaturesHash,
    mapHash: state.map.hash,
    creatures: state.actors.map(cloneActor),
  };
}
