import type { EngineLevelSeed, EngineMapCell, EngineState, InventorySlots } from "@domain/game/model";
import type { GameActor, GameSnapshot } from "@domain/game/types";
import { snapshotToEngineTimer } from "@domain/game/core/timer";

function cloneActor(actor: GameActor): GameActor {
  return {
    ...actor,
    position: { ...actor.position },
  };
}

function cloneActors(actors: GameActor[]): GameActor[] {
  return actors.map(cloneActor);
}

function toInventorySlots(values: number[]): InventorySlots {
  return [
    values[0] ?? 0,
    values[1] ?? 0,
    values[2] ?? 0,
    values[3] ?? 0,
  ];
}

function cloneCells(cells: EngineMapCell[] | undefined): EngineMapCell[] {
  return (cells ?? []).map((cell) => ({
    position: { ...cell.position },
    top: { ...cell.top },
    bottom: { ...cell.bottom },
  }));
}

export function snapshotToEngineState(
  request: EngineLevelSeed["request"],
  snapshot: GameSnapshot,
  cells?: EngineMapCell[],
): EngineState {
  return {
    request: { ...request },
    status: snapshot.status,
    timer: snapshotToEngineTimer(snapshot),
    inventory: {
      keys: toInventorySlots(snapshot.inventory.keys),
      boots: toInventorySlots(snapshot.inventory.boots),
      chipsNeeded: snapshot.chipsNeeded,
    },
    replay: {
      cursor: snapshot.replayCursor,
      stepping: snapshot.stepping,
      moveCount: 0,
      bestTimeTicks: Number.POSITIVE_INFINITY,
      initialRandomSlideDirection: snapshot.initRandomSlideDir,
      randomState: {
        main: { ...snapshot.randomState.main },
        lynx: { ...snapshot.randomState.lynx },
      },
    },
    chip: snapshot.chip ? cloneActor(snapshot.chip) : null,
    actors: cloneActors(snapshot.creatures),
    map: {
      hash: snapshot.mapHash,
      creaturesHash: snapshot.creaturesHash,
      creatureCount: snapshot.creatureCount,
      cells: cloneCells(cells),
    },
    view: { ...snapshot.view },
    soundEffects: snapshot.soundEffects,
    statusFlags: snapshot.statusFlags,
    lastMove: {
      code: snapshot.lastMoveCode,
      name: snapshot.lastMove,
    },
  };
}

export function initializeEngineState(seed: EngineLevelSeed): EngineState {
  return snapshotToEngineState(seed.request, seed.initialSnapshot, seed.cells);
}
