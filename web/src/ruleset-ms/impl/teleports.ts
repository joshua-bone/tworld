import type { EngineMapCell } from "@game-core/api/model";
import { advanceToCell, nextPosition } from "@game-core/impl/grid";
import { MS_FLOOR_STATE, MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

export interface MsChipTeleportProbeResult {
  canExit: boolean;
  pendingSoundEffects: number;
}

interface MsTeleportCandidateArgs {
  cells: EngineMapCell[];
  start: number;
  accept: (destination: number) => boolean;
}

function findMsTeleportCandidate({
  cells,
  start,
  accept,
}: MsTeleportCandidateArgs): number {
  let destination = start;

  for (;;) {
    destination -= 1;
    if (destination < 0) {
      destination += cells.length;
    }
    if (destination === start) {
      return start;
    }

    const tile = cells[destination]!.top;
    if (tile.id !== MS_TILE.Teleport || (tile.state & MS_FLOOR_STATE.Broken) !== 0) {
      continue;
    }

    if (accept(destination)) {
      return destination;
    }
  }
}

export function findMsCreatureTeleportDestination(args: {
  cells: EngineMapCell[];
  start: number;
  dir: number;
  occupiedOriginPos?: number;
  canExit: (destination: number) => boolean;
}): number {
  const {
    cells,
    start,
    dir,
    occupiedOriginPos = -1,
    canExit,
  } = args;
  return findMsTeleportCandidate({
    cells,
    start,
    accept: (destination) => {
      if (occupiedOriginPos >= 0 && nextPosition(destination, dir, MS_GRID_WIDTH) === occupiedOriginPos) {
        return false;
      }
      return canExit(destination);
    },
  });
}

export function findMsBlockTeleportDestination(args: {
  cells: EngineMapCell[];
  start: number;
  dir: number;
  occupiedOriginPos?: number;
  canExit: (exitPos: number) => boolean;
}): number {
  const {
    cells,
    start,
    dir,
    occupiedOriginPos = -1,
    canExit,
  } = args;
  return findMsTeleportCandidate({
    cells,
    start,
    accept: (destination) => {
      if (destination === occupiedOriginPos) {
        return false;
      }

      const exitStep = advanceToCell(cells, destination, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
      return !!exitStep && canExit(exitStep.pos);
    },
  });
}

export function resolveMsChipTeleportDestination(args: {
  cells: EngineMapCell[];
  start: number;
  initialPendingSoundEffects: number;
  probeExit: (destination: number, pendingSoundEffects: number) => MsChipTeleportProbeResult;
}): { destination: number; soundEffects: number; pendingSoundEffects: number } {
  const {
    cells,
    start,
    initialPendingSoundEffects,
    probeExit,
  } = args;
  let pendingSoundEffects = initialPendingSoundEffects;
  const destination = findMsTeleportCandidate({
    cells,
    start,
    accept: (candidate) => {
      const probe = probeExit(candidate, pendingSoundEffects);
      pendingSoundEffects = probe.pendingSoundEffects;
      return probe.canExit;
    },
  });

  return {
    destination,
    soundEffects: pendingSoundEffects & ~initialPendingSoundEffects,
    pendingSoundEffects,
  };
}
