import { cloneBoardCells } from "@game-core/impl/board";
import type { TurnDebugPhaseName } from "@game-core/api/turnPhases";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type {
  GameDebugBoardFlag,
  GameDebugFloorState,
  GameDebugPhaseSnapshot,
  GameDebugRuntimeActor,
} from "@game-core/api/debug";
import { createRuntimeCommand } from "@game-core/api/playback";
import { mapHash } from "@game-core/impl/hash";
import { boardGamePosition, projectGamePosition } from "@game-core/impl/position";
import { isMsBlockActorId, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxRuntimeActor } from "@ruleset-lynx/impl/engine";

function directionName(dir: number): string {
  switch (dir) {
    case 1:
      return "north";
    case 2:
      return "west";
    case 4:
      return "south";
    case 8:
      return "east";
    default:
      return "none";
  }
}

function isLynxIce(tileId: number): boolean {
  return (
    tileId === MS_TILE.Ice ||
    tileId === MS_TILE.IceWall_Northwest ||
    tileId === MS_TILE.IceWall_Northeast ||
    tileId === MS_TILE.IceWall_Southwest ||
    tileId === MS_TILE.IceWall_Southeast
  );
}

function isLynxSlide(tileId: number): boolean {
  return (
    tileId === MS_TILE.Slide_North ||
    tileId === MS_TILE.Slide_West ||
    tileId === MS_TILE.Slide_South ||
    tileId === MS_TILE.Slide_East ||
    tileId === MS_TILE.Slide_Random
  );
}

function lynxFloorMovementMode(tileId: number, moving: number): string {
  if (moving <= 0) {
    return "none";
  }
  if (isLynxSlide(tileId)) {
    return "slide";
  }
  if (isLynxIce(tileId)) {
    return "ice";
  }
  return "none";
}

function buildLynxDebugFloorState(tileId: number, state: number, moving: number, dir: number): GameDebugFloorState {
  return {
    id: tileId,
    state,
    stateFlags: [],
    movementMode: lynxFloorMovementMode(tileId, moving),
    slipDir: moving > 0 && (isLynxSlide(tileId) || isLynxIce(tileId)) ? directionName(dir) : "none",
  };
}

function buildLynxDebugActor(cells: EngineMapCell[], actor: LynxRuntimeActor, index: number): GameDebugRuntimeActor {
  const cell = cells[actor.pos];
  const floorId = cell?.top.id ?? MS_TILE.Empty;
  const floorState = cell?.top.state ?? 0;

  return {
    index,
    id: actor.id,
    dir: directionName(actor.dir),
    position: boardGamePosition(actor.pos, MS_GRID_WIDTH, actor.z ?? 1),
    hidden: actor.hidden,
    state: 0,
    stateFlags: actor.dormant ? ["dormant"] : [],
    tdir: directionName(actor.intentDir || (actor.moving > 0 ? actor.dir : 0)),
    floor: buildLynxDebugFloorState(floorId, floorState, actor.moving, actor.dir),
    moving: actor.moving,
    frame: actor.frame,
  };
}

function buildLynxChipDebugActor(cells: EngineMapCell[], chipPos: number, chipDir: number, chipMoving: number): GameDebugRuntimeActor {
  const cell = cells[chipPos];
  const floorId = cell?.top.id ?? MS_TILE.Empty;
  const floorState = cell?.top.state ?? 0;

  return {
    index: 0,
    id: MS_TILE.Chip,
    dir: directionName(chipDir),
    position: boardGamePosition(chipPos, MS_GRID_WIDTH),
    hidden: false,
    state: 0,
    stateFlags: [],
    tdir: chipMoving > 0 ? directionName(chipDir) : "none",
    floor: buildLynxDebugFloorState(floorId, floorState, chipMoving, chipDir),
    moving: chipMoving,
    frame: Math.trunc(chipMoving / 2),
  };
}

function collectLynxBoardFlags(cells: EngineMapCell[]): GameDebugBoardFlag[] {
  const flags: GameDebugBoardFlag[] = [];

  for (const cell of cells) {
    if (cell.top.state !== 0) {
      flags.push({
        layer: 1,
        id: cell.top.id,
        position: projectGamePosition(cell.position),
        state: cell.top.state,
        stateFlags: [],
      });
    }
    if (cell.bottom.state !== 0) {
      flags.push({
        layer: 0,
        id: cell.bottom.id,
        position: projectGamePosition(cell.position),
        state: cell.bottom.state,
        stateFlags: [],
      });
    }
  }

  return flags;
}

export function projectLynxDebugPhaseSnapshot(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  currentInputCode: number,
  currentTick: number,
  phase: TurnDebugPhaseName,
): GameDebugPhaseSnapshot {
  const chipCell = state.map.cells[chipPos];
  const chipFloorId = chipCell?.top.id ?? MS_TILE.Empty;
  const chipFloorState = chipCell?.top.state ?? 0;

  return {
    phase,
    tick: Math.max(currentTick, 0),
    currentTime: phase === "initial" ? state.timer.currentTime : currentTick,
    replayCursor: state.replay.cursor,
    currentInputCode,
    currentInput: createRuntimeCommand(currentInputCode, state.timer.currentTime).inputName,
    lastMoveCode: state.lastMove.code,
    lastMove: state.lastMove.name,
    chipsNeeded: state.inventory.chipsNeeded,
    statusFlags: state.statusFlags,
    chipStatus: state.status === "failed" ? "dead" : state.status === "completed" ? "completed" : "okay",
    chipStatusCode: state.status === "failed" ? 1 : state.status === "completed" ? 2 : 0,
    chipWait: 0,
    controllerDir: "none",
    lastSlipDir: chipMoving > 0 && (isLynxSlide(chipFloorId) || isLynxIce(chipFloorId)) ? directionName(chipDir) : "none",
    goalPos: 0,
    completed: state.status === "completed",
    msccSlippers: 0,
    soundEffects: state.soundEffects,
    chipFloor: buildLynxDebugFloorState(chipFloorId, chipFloorState, chipMoving, chipDir),
    mapHash: mapHash(state.map.cells),
    creaturesHash: state.map.creaturesHash,
    activeCreatures: [
      buildLynxChipDebugActor(state.map.cells, chipPos, chipDir, chipMoving),
      ...actors
        .filter((actor) => !isMsBlockActorId(actor.id) && !actor.hidden)
        .map((actor, index) => buildLynxDebugActor(state.map.cells, actor, index + 1)),
    ],
    blocks: actors
      .filter((actor) => isMsBlockActorId(actor.id) && !actor.hidden)
      .map((actor, index) => buildLynxDebugActor(state.map.cells, actor, index)),
    slipList: [],
    boardFlags: collectLynxBoardFlags(state.map.cells),
    map: {
      cells: cloneBoardCells(state.map.cells).map((cell) => ({
        ...cell,
        position: projectGamePosition(cell.position),
      })),
    },
  };
}
