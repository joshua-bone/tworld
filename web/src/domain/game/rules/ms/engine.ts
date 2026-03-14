import type { EngineMapCell, EngineState } from "@domain/game/model";
import type { ReplaySolutionPayload } from "@domain/game/codec";
import type {
  GameDebugPhaseSnapshot,
  GameDebugTrace,
} from "@domain/game/debug";
import { findExistingActorAtPosition, findVisibleActorAtPosition } from "@domain/game/core/actors";
import {
  addBottomTileFlags,
  addTopTileFlags,
  boardCell,
  bottomTile,
  bottomTileId,
  bottomTileIdOr,
  hasBottomTileFlags,
  hasTopTileFlags,
  cloneBoardCells,
  popBoardTile,
  pushBoardTile,
  removeBottomTileFlags,
  removeTopTileFlags,
  replaceTopTile,
  topTile,
  topTileId,
  topTileIdOr,
} from "@domain/game/core/board";
import {
  advanceToCell,
  directionName,
  nextPosition,
  normalizeCardinalDirection as normalizeDirection,
  reverseDirection as backDirection,
} from "@domain/game/core/grid";
import { TURN_DEBUG_PHASE, recordTurnDebugPhase, type TurnDebugPhaseName } from "@domain/game/core/turnPhases";
import { advanceTimer, createInitialEngineTimer } from "@domain/game/core/timer";
import { mapHash } from "@domain/game/hash";
import {
  createReplayPlan,
  createRuntimeCommand,
  plannedReplayInput,
  recordManualMove,
  resolveManualInput,
  scheduledInputForTick,
} from "@domain/game/playback";
import { engineStateToSnapshot } from "@domain/game/snapshot";
import { createGameDebugTrace, createGameTrace } from "@domain/game/trace";
import { collectMsActors, hashMsCreatures, projectMsDebugPhaseSnapshot } from "@domain/game/rules/ms/debugProjection";
import type { GameCommand, GameRequest, GameRuntimeCommand, GameTrace } from "@domain/game/types";
import type { MsConnection, MsLevel } from "@domain/game/rules/ms/level";
import type { SolutionMove } from "@domain/solution-file";
import {
  msBlockMovementMask,
  msButtonAction,
  msChipMovementMask,
  msChipEnterAction,
  msCreatureMovementMask,
  msDoorKeyIndex,
  msIceWallTurn,
  msInventoryIndex,
  msInventorySlot,
  msIsActorTile,
  msIsOverlayFloorTile,
  msPreservesUnderlyingFloor,
  msSlideDirection,
  msTileHasTag,
  msTileForcedFloorKind,
} from "@domain/game/rules/ms/catalog";
import {
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_TICKS_PER_SECOND,
  MS_SOUND,
  MS_STATUS_FLAG,
  MS_TILE,
  isMsBoots,
  isMsCreature,
  isMsFloor,
  isMsKey,
  msCreatureDir,
  msCreatureId,
  msCreatureTile,
} from "@domain/game/rules/ms/tiles";

export interface MsTrackedCreature {
  serial: number;
  id: number;
  dir: number;
  tdir: number;
  pos: number;
  hidden: boolean;
  moving: number;
  frame: number;
  cloning: boolean;
  released: boolean;
  turning: boolean;
  hasMoved: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport";
  floorMovementDir: number;
  sliding: boolean;
}

interface MsCreatureSlipEntry {
  serial: number;
  dir: number;
  slipOrder: number;
}

export interface MsTrackedBlock {
  pos: number;
  dir: number;
  hidden: boolean;
  released: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport";
  floorMovementDir: number;
  sliding: boolean;
  slideDelayPending: boolean;
  slipOrder: number;
}

export interface MsInternalState {
  chipPos: number;
  chipDir: number;
  chipTDir: number;
  currentInput: number;
  goalPos: number;
  controllerDir: number;
  chipHasMoved: boolean;
  chipReleased: boolean;
  chipWait: number;
  chipStatus: "okay" | "drowned" | "burned" | "bombed" | "outoftime" | "collided";
  completed: boolean;
  replayDeadlineFailed: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport";
  floorMovementDir: number;
  creatures: MsTrackedCreature[];
  creatureIndexBySerial: Map<number, number>;
  creatureSlipList: MsCreatureSlipEntry[];
  blocks: MsTrackedBlock[];
  traps: MsConnection[];
  cloners: MsConnection[];
  pendingCloners: number[];
  pendingSoundEffects: number;
  nextCreatureSerial: number;
  nextSlipOrder: number;
  randomMainInitial: bigint;
  randomMainValue: bigint;
  lastSlipDir: number;
}

interface MsQueueTraceEvent {
  tick: number;
  phase: "non-chip-floor";
  action: string;
  slipIndex: number;
  advance: number;
  entry: string | null;
  queue: string[];
}

interface ChipMoveOptions {
  exposeWalls?: boolean;
  allowPushing?: boolean;
  noLeaveCheck?: boolean;
  teleportPush?: boolean;
  deferButtons?: boolean;
  occupiedOriginPos?: number;
}

export interface MsGameState {
  engine: EngineState;
  internal: MsInternalState;
}

export interface MsInteractiveSessionState {
  state: MsGameState;
  lastInput: GameRuntimeCommand;
  recordedMoves: SolutionMove[];
  replayPlan: ReturnType<typeof createReplayPlan> | null;
}

const UINT31_MASK = 0x7fffffffn;
const RANDOM3_MASK = 0x3fffffffn;
const RANDOM4_MASK = 0x0fffffffn;
const RANDOM3_DIVISOR = 0x40000000n;
const RANDOM4_DIVISOR = 0x10000000n;
const MS_DEBUG_SCHEMA_VERSION = 2;
const MS_MOUSE_RANGE_MIN = -9;
const MS_MOUSE_RANGE = 19;
const CMD_MOUSE_MOVE_FIRST = (MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east) + 1;
const CMD_MOUSE_MOVE_LAST = CMD_MOUSE_MOVE_FIRST + MS_MOUSE_RANGE * MS_MOUSE_RANGE - 1;
const CMD_MOVE_NOP = CMD_MOUSE_MOVE_FIRST - MS_MOUSE_RANGE_MIN * (MS_MOUSE_RANGE + 1);
const CMD_ABS_MOUSE_MOVE_FIRST = 512;
const CMD_ABS_MOUSE_MOVE_LAST = CMD_ABS_MOUSE_MOVE_FIRST + MS_GRID_WIDTH * MS_GRID_HEIGHT - 1;

let msQueueTraceHook: ((event: MsQueueTraceEvent) => void) | null = null;

export function setMsQueueTraceHook(hook: ((event: MsQueueTraceEvent) => void) | null): void {
  msQueueTraceHook = hook;
}

function normalizeRandomSeed(seed: number | undefined): bigint {
  return BigInt((seed ?? 0) & Number(UINT31_MASK));
}

function isRelativeMouseCommand(code: number): boolean {
  return code >= CMD_MOUSE_MOVE_FIRST && code <= CMD_MOUSE_MOVE_LAST;
}

function isAbsoluteMouseCommand(code: number): boolean {
  return code >= CMD_ABS_MOUSE_MOVE_FIRST && code <= CMD_ABS_MOUSE_MOVE_LAST;
}

function makeMouseRelative(absPos: number, chipPos: number): number {
  const x = (absPos % MS_GRID_WIDTH) - (chipPos % MS_GRID_WIDTH);
  const y = Math.floor(absPos / MS_GRID_WIDTH) - Math.floor(chipPos / MS_GRID_WIDTH);
  return (y - MS_MOUSE_RANGE_MIN) * MS_MOUSE_RANGE + (x - MS_MOUSE_RANGE_MIN);
}

function makeMouseAbsolute(relPos: number, chipPos: number): number {
  const x = (relPos % MS_MOUSE_RANGE) + MS_MOUSE_RANGE_MIN;
  const y = Math.floor(relPos / MS_MOUSE_RANGE) + MS_MOUSE_RANGE_MIN;
  return chipPos + y * MS_GRID_WIDTH + x;
}

function leftDirection(dir: number): number {
  switch (dir) {
    case MS_DIRECTION.north:
      return MS_DIRECTION.west;
    case MS_DIRECTION.west:
      return MS_DIRECTION.south;
    case MS_DIRECTION.south:
      return MS_DIRECTION.east;
    case MS_DIRECTION.east:
      return MS_DIRECTION.north;
    default:
      return MS_DIRECTION.none;
  }
}

function rightDirection(dir: number): number {
  switch (dir) {
    case MS_DIRECTION.north:
      return MS_DIRECTION.east;
    case MS_DIRECTION.west:
      return MS_DIRECTION.north;
    case MS_DIRECTION.south:
      return MS_DIRECTION.west;
    case MS_DIRECTION.east:
      return MS_DIRECTION.south;
    default:
      return MS_DIRECTION.none;
  }
}

function nextRandomValue(value: bigint): bigint {
  return ((value * 1103515245n) + 12345n) & UINT31_MASK;
}

function advanceRandom(internal: MsInternalState): bigint {
  internal.randomMainValue = nextRandomValue(internal.randomMainValue);
  return internal.randomMainValue;
}

function random4(internal: MsInternalState): number {
  return Number(advanceRandom(internal) >> 29n);
}

function randomp3(internal: MsInternalState, array: number[]): void {
  const value = advanceRandom(internal);
  let index = Number(value >> 30n);
  [array[index], array[1]] = [array[1]!, array[index]!];
  index = Number((3n * (value & RANDOM3_MASK)) / RANDOM3_DIVISOR);
  [array[index], array[2]] = [array[2]!, array[index]!];
}

function randomp4(internal: MsInternalState, array: number[]): void {
  const value = advanceRandom(internal);
  let index = Number(value >> 30n);
  [array[index], array[1]] = [array[1]!, array[index]!];
  index = Number((3n * (value & RANDOM4_MASK)) / RANDOM4_DIVISOR);
  [array[index], array[2]] = [array[2]!, array[index]!];
  index = Number((value >> 28n) & 3n);
  [array[index], array[3]] = [array[3]!, array[index]!];
}

function isIceFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "ice";
}

function isSlideFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "slide";
}

function slideDirection(floor: number, internal: MsInternalState): number {
  return msSlideDirection(
    floor,
    floor === MS_TILE.Slide_Random ? 1 << random4(internal) : MS_DIRECTION.none,
  );
}

function iceWallTurn(floor: number, dir: number): number {
  return msIceWallTurn(floor, dir);
}

function floorAt(cells: EngineMapCell[], pos: number): number {
  const top = topTile(cells, pos);
  if (!msIsOverlayFloorTile(top.id)) {
    return top.id;
  }
  const bottom = bottomTile(cells, pos);
  if (!msIsOverlayFloorTile(bottom.id)) {
    return bottom.id;
  }
  return MS_TILE.Empty;
}

function floorTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
  const top = topTile(cells, pos);
  if (!msIsOverlayFloorTile(top.id)) {
    return top;
  }
  const bottom = bottomTile(cells, pos);
  if (!msIsOverlayFloorTile(bottom.id)) {
    return bottom;
  }
  return bottom;
}

function canLeaveFloor(cells: EngineMapCell[], pos: number, dir: number, released: boolean): boolean {
  const floor = cells[pos] ? bottomTileId(cells, pos) : MS_TILE.Empty;
  if (
    (floor === MS_TILE.Wall_North && dir === MS_DIRECTION.north) ||
    (floor === MS_TILE.Wall_West && dir === MS_DIRECTION.west) ||
    (floor === MS_TILE.Wall_South && dir === MS_DIRECTION.south) ||
    (floor === MS_TILE.Wall_East && dir === MS_DIRECTION.east) ||
    (floor === MS_TILE.Wall_Southeast && (dir & (MS_DIRECTION.south | MS_DIRECTION.east)) !== 0)
  ) {
    return false;
  }

  return floor !== MS_TILE.Beartrap || released;
}

function pushTile(cells: EngineMapCell[], pos: number, tile: EngineMapCell["top"]): void {
  pushBoardTile(cells, pos, tile);
}

function popTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
  return popBoardTile(cells, pos, MS_TILE.Empty);
}

function placeStaticBlock(cells: EngineMapCell[], pos: number, state: number): void {
  const cell = boardCell(cells, pos);
  if (cell.top.id !== MS_TILE.Empty) {
    pushTile(cells, pos, { id: MS_TILE.Empty, state: 0 });
  }
  cell.top = {
    id: MS_TILE.Block_Static,
    state,
  };
}

function cloneInventory(inventory: EngineState["inventory"]): EngineState["inventory"] {
  return {
    keys: [...inventory.keys] as EngineState["inventory"]["keys"],
    boots: [...inventory.boots] as EngineState["inventory"]["boots"],
    chipsNeeded: inventory.chipsNeeded,
  };
}

function createTrackedBlockState(pos: number, dir: number): MsTrackedBlock {
  return {
    pos,
    dir,
    hidden: false,
    released: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    sliding: false,
    slideDelayPending: false,
    slipOrder: -1,
  };
}

function cloneInternalState(internal: MsInternalState): MsInternalState {
  return {
    ...internal,
    creatures: internal.creatures.map((creature) => ({ ...creature })),
    creatureIndexBySerial: new Map(internal.creatureIndexBySerial),
    creatureSlipList: internal.creatureSlipList.map((entry) => ({ ...entry })),
    blocks: internal.blocks.map((block) => ({ ...block })),
    traps: internal.traps.map((connection) => ({ ...connection })),
    cloners: internal.cloners.map((connection) => ({ ...connection })),
    pendingCloners: [...internal.pendingCloners],
    pendingSoundEffects: internal.pendingSoundEffects,
    lastSlipDir: internal.lastSlipDir,
    goalPos: internal.goalPos,
  };
}


function statusName(internal: MsInternalState): EngineState["status"] {
  if (internal.completed) {
    return "completed";
  }
  if (internal.replayDeadlineFailed) {
    return "failed";
  }
  if (internal.chipStatus !== "okay") {
    return "failed";
  }
  return "playing";
}

function updateEngine(state: MsGameState, cells: EngineMapCell[], soundEffects: number, advanceTick = true): MsGameState {
  const actors = collectMsActors(cells);
  const chip = actors.find((actor) => actor.id === MS_TILE.Chip || actor.id === MS_TILE.Swimming_Chip) ?? null;
  const timer = advanceTimer(state.engine.timer, advanceTick ? 1 : 0, MS_TICKS_PER_SECOND);
  let statusFlags = state.engine.statusFlags & ~MS_STATUS_FLAG.ShowHint;
  let nextSoundEffects = soundEffects;
  if (state.internal.completed) {
    nextSoundEffects |= 1 << MS_SOUND.ChipWins;
  } else if (
    state.internal.chipStatus !== "okay" &&
    state.internal.chipStatus !== "outoftime" &&
    !state.internal.replayDeadlineFailed
  ) {
    nextSoundEffects |= 1 << MS_SOUND.ChipLoses;
  }
  if (cells[state.internal.chipPos]?.bottom.id === MS_TILE.HintButton) {
    statusFlags |= MS_STATUS_FLAG.ShowHint;
  }
  return {
    engine: {
      ...state.engine,
      status: statusName(state.internal),
      timer,
      replay: {
        ...state.engine.replay,
        randomState: {
          ...state.engine.replay.randomState,
          main: {
            initial: String(state.internal.randomMainInitial),
            value: String(state.internal.randomMainValue),
            shared: false,
          },
        },
      },
      chip,
      actors,
      map: {
        hash: mapHash(cells),
        creaturesHash: hashMsCreatures(cells),
        creatureCount: actors.length,
        cells,
      },
      view: {
        x: (state.internal.chipPos % MS_GRID_WIDTH) * 8,
        y: Math.floor(state.internal.chipPos / MS_GRID_WIDTH) * 8,
      },
      soundEffects: nextSoundEffects,
      statusFlags,
      lastMove: { ...state.engine.lastMove },
    },
    internal: cloneInternalState(state.internal),
  };
}

function initializeBrokenFloors(cells: EngineMapCell[]): void {
  for (const cell of cells) {
    const topBase = msCreatureId(cell.top.id);
    if (isMsFloor(cell.top.id) || topBase === MS_TILE.Chip || topBase === MS_TILE.Block) {
      if (
        cell.bottom.id === MS_TILE.Teleport ||
        cell.bottom.id === MS_TILE.SwitchWall_Open ||
        cell.bottom.id === MS_TILE.SwitchWall_Closed
      ) {
        cell.bottom.state |= MS_FLOOR_STATE.Broken;
      }
    }
  }
}

function updateChipTile(cells: EngineMapCell[], internal: MsInternalState): void {
  if (internal.chipStatus !== "okay") {
    return;
  }

  const chipBase = floorAt(cells, internal.chipPos) === MS_TILE.Water ? MS_TILE.Swimming_Chip : MS_TILE.Chip;
  replaceTopTile(cells, internal.chipPos, {
    id: msCreatureTile(chipBase, internal.chipDir),
    state: 0,
  });
}

function refreshFloorMovement(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): void {
  if (internal.chipStatus !== "okay" || internal.completed) {
    internal.floorMovement = "none";
    internal.floorMovementDir = MS_DIRECTION.none;
    internal.lastSlipDir = MS_DIRECTION.none;
    return;
  }

  const standingTile = bottomTile(cells, internal.chipPos);
  const floor = standingTile.id;
  if (floor === MS_TILE.Teleport) {
    internal.floorMovement = "teleport";
    internal.floorMovementDir = internal.chipDir;
    updateChipTile(cells, internal);
    return;
  }

  if (isIceFloor(floor) && inventory.boots[0] === 0) {
    internal.floorMovement = "ice";
    internal.floorMovementDir = iceWallTurn(floor, internal.chipDir);
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    return;
  }

  if (isSlideFloor(floor) && inventory.boots[1] === 0) {
    internal.floorMovement = "slide";
    internal.floorMovementDir = slideDirection(floor, internal);
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    return;
  }

  internal.floorMovement = "none";
  internal.floorMovementDir = MS_DIRECTION.none;
}

function refreshFloorMovementFromEnteredTile(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  enteredFloor: number,
  enteredFloorState: number,
): void {
  if (internal.chipStatus !== "okay" || internal.completed) {
    internal.floorMovement = "none";
    internal.floorMovementDir = MS_DIRECTION.none;
    internal.lastSlipDir = MS_DIRECTION.none;
    return;
  }

  if (enteredFloor === MS_TILE.Teleport) {
    internal.floorMovement = "teleport";
    internal.floorMovementDir = internal.chipDir;
    updateChipTile(cells, internal);
    return;
  }

  if (isIceFloor(enteredFloor) && inventory.boots[0] === 0) {
    internal.floorMovement = "ice";
    internal.floorMovementDir = iceWallTurn(enteredFloor, internal.chipDir);
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    return;
  }

  if (isSlideFloor(enteredFloor) && inventory.boots[1] === 0) {
    internal.floorMovement = "slide";
    internal.floorMovementDir = slideDirection(enteredFloor, internal);
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    return;
  }

  internal.floorMovement = "none";
  internal.floorMovementDir = MS_DIRECTION.none;
}

export function initializeMsGameState(
  request: GameRequest,
  level: MsLevel,
  replay:
    | (Pick<ReplaySolutionPayload, "randomSeed" | "stepping" | "randomSlideDirection"> & {
        moveCount?: number;
        bestTimeTicks?: number;
      })
    | null = null,
): MsGameState {
  const cells = cloneBoardCells(level.cells);
  initializeBrokenFloors(cells);

  let chipPos = 0;
  let chipDir: number = MS_DIRECTION.south;
  const creatures: MsTrackedCreature[] = [];
  const blocks: MsTrackedBlock[] = [];
  const trackedBlockPositions = new Set<number>();

  for (const pos of level.creaturePositions) {
    if (pos < 0 || pos >= cells.length) {
      continue;
    }
    const cell = cells[pos]!;
    if (cell.top.id === MS_TILE.Block_Static) {
      blocks.push(createTrackedBlockState(pos, MS_DIRECTION.none));
      trackedBlockPositions.add(pos);
      addTopTileFlags(cells, pos, MS_FLOOR_STATE.Marker);
      continue;
    }
    if (!isMsCreature(cell.top.id)) {
      continue;
    }
    if (msCreatureId(cell.top.id) === MS_TILE.Chip) {
      chipPos = pos;
      chipDir = msCreatureDir(cell.top.id);
    } else {
      const creatureId = msCreatureId(cell.top.id);
      if (creatureId === MS_TILE.Block) {
      } else if (cell.bottom.id !== MS_TILE.CloneMachine) {
        creatures.push({
          serial: creatures.length + 1,
          id: creatureId,
          dir: msCreatureDir(cell.top.id),
          tdir: MS_DIRECTION.none,
          pos,
          hidden: false,
          moving: 0,
          frame: 0,
          cloning: false,
          released: false,
          turning: false,
          hasMoved: false,
          floorMovement: "none",
          floorMovementDir: MS_DIRECTION.none,
          sliding: false,
        });
      }
    }
    addTopTileFlags(cells, pos, MS_FLOOR_STATE.Marker);
  }

  for (const cell of cells) {
    if (hasTopTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.Marker)) {
      removeTopTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.Marker);
    } else if (isMsCreature(cell.top.id) && msCreatureId(cell.top.id) === MS_TILE.Chip) {
      chipPos = cell.position.pos;
      // Native MS seeds Chip's runtime direction from the lower tile
      // when Chip starts on the top layer.
      chipDir = msCreatureDir(cell.bottom.id);
    }
  }

  const internal: MsInternalState = {
    chipPos,
    chipDir,
    chipTDir: MS_DIRECTION.none,
    currentInput: MS_DIRECTION.none,
    goalPos: -1,
    controllerDir: MS_DIRECTION.none,
    chipHasMoved: false,
    chipReleased: false,
    chipWait: 0,
    chipStatus: "okay",
    completed: false,
    replayDeadlineFailed: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    creatures,
    creatureIndexBySerial: new Map(creatures.map((creature, creatureIndex) => [creature.serial, creatureIndex])),
    creatureSlipList: [],
    blocks,
    traps: level.traps.map((connection) => ({ ...connection })),
    cloners: level.cloners.map((connection) => ({ ...connection })),
    pendingCloners: [],
    pendingSoundEffects: 0,
    nextCreatureSerial: creatures.length + 1,
    nextSlipOrder: 0,
    randomMainInitial: normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed),
    randomMainValue: normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed),
    lastSlipDir: MS_DIRECTION.none,
  };
  const normalizedRandomSeed = normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed);

  for (const connection of internal.traps) {
    if (
      connection.to === internal.chipPos ||
      cells[connection.to]?.top.id === MS_TILE.Block_Static ||
      isTrapButtonDown(cells, connection.from)
    ) {
      springTrap(cells, internal, connection.from);
    }
  }

  const engine: EngineState = {
    request: { ...request },
    status: "playing",
    timer: createInitialEngineTimer(level.timeLimitTicks),
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      chipsNeeded: level.chipsNeeded,
    },
    replay: {
      cursor: replay ? 0 : -1,
      stepping: replay?.stepping ?? 0,
      moveCount: replay?.moveCount ?? 0,
      bestTimeTicks: replay?.bestTimeTicks ?? Number.POSITIVE_INFINITY,
      initialRandomSlideDirection: directionName(replay?.randomSlideDirection ?? MS_DIRECTION.north),
      randomState: {
        main: {
          initial: String(normalizedRandomSeed),
          value: String(normalizedRandomSeed),
          shared: false,
        },
        lynx: {
          prng1: 0,
          prng2: 0,
        },
      },
    },
    chip: null,
    actors: [],
    map: {
      hash: "",
      creaturesHash: "",
      creatureCount: 0,
      cells,
    },
    view: { x: 0, y: 0 },
    soundEffects: 0,
    statusFlags: level.statusFlags | MS_STATUS_FLAG.NoAnimation,
    lastMove: { code: 0, name: "none" },
  };

  return updateEngine({ engine, internal }, cells, 0, false);
}

function canMoveChip(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
  options: ChipMoveOptions = {},
): boolean {
  const {
    exposeWalls = true,
    allowPushing = true,
    noLeaveCheck = false,
    teleportPush = false,
    deferButtons = true,
    occupiedOriginPos = -1,
  } = options;
  const chipPos = internal.chipPos;
  const x = chipPos % MS_GRID_WIDTH;
  const y = Math.floor(chipPos / MS_GRID_WIDTH);
  const nextX = x + (dir === MS_DIRECTION.west ? -1 : dir === MS_DIRECTION.east ? 1 : 0);
  const nextY = y + (dir === MS_DIRECTION.north ? -1 : dir === MS_DIRECTION.south ? 1 : 0);

  if (nextX < 0 || nextX >= MS_GRID_WIDTH || nextY < 0 || nextY >= MS_GRID_HEIGHT) {
    return false;
  }

  const to = nextY * MS_GRID_WIDTH + nextX;
  if (!noLeaveCheck && !canLeaveFloor(cells, chipPos, dir, internal.chipReleased)) {
    return false;
  }

  const floor = floorAt(cells, to);
  if ((msChipMovementMask(floor) & dir) === 0) {
    return false;
  }
  if (floor === MS_TILE.Socket && inventory.chipsNeeded > 0) {
    return false;
  }
  if (msTileHasTag(floor, "door")) {
    const doorKeyIndex = msDoorKeyIndex(floor);
    if (doorKeyIndex === null || inventory.keys[doorKeyIndex] === 0) {
      return false;
    }
  }
  if (isMsCreature(cells[to]!.top.id)) {
    const targetId = msCreatureId(cells[to]!.top.id);
    if (targetId === MS_TILE.Block) {
      return false;
    } else if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      return false;
    }
  }
  if (exposeWalls && (floor === MS_TILE.HiddenWall_Temp || floor === MS_TILE.BlueWall_Real)) {
    floorTile(cells, to).id = MS_TILE.Wall;
    return false;
  }
  if (!exposeWalls && (floor === MS_TILE.HiddenWall_Temp || floor === MS_TILE.BlueWall_Real)) {
    return false;
  }
  if (floor === MS_TILE.Block_Static) {
    if (!pushBlock(cells, internal, to, dir, teleportPush, deferButtons, occupiedOriginPos)) {
      return false;
    }
    if (!allowPushing) {
      return false;
    }
    if (cells[to]!.bottom.id === MS_TILE.CloneMachine) {
      return false;
    }
    if (teleportPush && floorAt(cells, to) === MS_TILE.Block_Static) {
      return true;
    }
    return canMoveChip(cells, internal, inventory, dir, {
      ...options,
      allowPushing: false,
    });
  } else if (cells[to]!.bottom.id === MS_TILE.CloneMachine) {
    return false;
  }

  return true;
}

function canMoveCreature(cells: EngineMapCell[], creature: MsTrackedCreature, dir: number): boolean {
  return canMoveCreatureWithOptions(cells, creature, dir, false);
}

function canMoveCreatureWithOptions(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  ignoreFireCheck: boolean,
  cloneCantBlock = false,
  internal: MsInternalState | null = null,
): boolean {
  if (!canLeaveFloor(cells, creature.pos, dir, creature.released)) {
    return false;
  }

  const x = creature.pos % MS_GRID_WIDTH;
  const y = Math.floor(creature.pos / MS_GRID_WIDTH);
  const nextX = x + (dir === MS_DIRECTION.west ? -1 : dir === MS_DIRECTION.east ? 1 : 0);
  const nextY = y + (dir === MS_DIRECTION.north ? -1 : dir === MS_DIRECTION.south ? 1 : 0);

  if (nextX < 0 || nextX >= MS_GRID_WIDTH || nextY < 0 || nextY >= MS_GRID_HEIGHT) {
    return false;
  }

  const to = nextY * MS_GRID_WIDTH + nextX;
  let floor = cells[to]!.top.id;
  if (isMsCreature(floor)) {
    const targetId = msCreatureId(floor);
    if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      floor = cells[to]!.bottom.id;
      if (isMsCreature(floor)) {
        return false;
      }
    } else {
      if (!cloneCantBlock) {
        return false;
      }
      if (floor === msCreatureTile(creature.id, creature.dir)) {
        return true;
      }
      if (!internal) {
        return false;
      }
      const blockingCreature = creatureAtPos(internal, to);
      return blockingCreature !== undefined && blockingCreature.dir === creature.dir;
    }
  }
  if ((msCreatureMovementMask(floor) & dir) === 0) {
    return false;
  }
  if (!ignoreFireCheck && floor === MS_TILE.Fire && (creature.id === MS_TILE.Bug || creature.id === MS_TILE.Walker)) {
    return false;
  }
  if (cells[to]!.bottom.id === MS_TILE.CloneMachine) {
    return false;
  }

  return true;
}

function teleportDestinationForCreature(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  start: number,
  dir: number,
  occupiedOriginPos = -1,
): number {
  let destination = start;

  for (;;) {
    destination -= 1;
    if (destination < 0) {
      destination += cells.length;
    }
    if (destination === start) {
      break;
    }

    const tile = cells[destination]!.top;
    if (tile.id !== MS_TILE.Teleport || (tile.state & MS_FLOOR_STATE.Broken) !== 0) {
      continue;
    }

    if (occupiedOriginPos >= 0 && nextPosition(destination, dir, MS_GRID_WIDTH) === occupiedOriginPos) {
      continue;
    }

    if (
      canMoveCreatureWithOptions(
        cells,
        {
          ...creature,
          pos: destination,
          dir,
        },
        dir,
        true,
      )
    ) {
      return destination;
    }
  }

  return start;
}

function canMoveBlockInto(cells: EngineMapCell[], to: number, dir: number, occupiedOriginPos = -1): boolean {
  if (to < 0 || to >= cells.length) {
    return false;
  }
  if (dir === MS_DIRECTION.east && to % MS_GRID_WIDTH === 0) {
    return false;
  }
  if (dir === MS_DIRECTION.west && to % MS_GRID_WIDTH === MS_GRID_WIDTH - 1) {
    return false;
  }
  if (to === occupiedOriginPos) {
    return false;
  }

  const targetTop = cells[to]!.top.id;
  if (isMsCreature(targetTop)) {
    const targetId = msCreatureId(targetTop);
    return targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip;
  }

  if ((msBlockMovementMask(targetTop) & dir) === 0) {
    return false;
  }
  return cells[to]!.bottom.id !== MS_TILE.CloneMachine;
}

function teleportDestinationForBlock(cells: EngineMapCell[], start: number, dir: number, occupiedOriginPos = -1): number {
  let destination = start;

  for (;;) {
    destination -= 1;
    if (destination < 0) {
      destination += cells.length;
    }
    if (destination === start) {
      break;
    }
    if (destination === occupiedOriginPos) {
      continue;
    }

    const tile = cells[destination]!.top;
    if (tile.id !== MS_TILE.Teleport || (tile.state & MS_FLOOR_STATE.Broken) !== 0) {
      continue;
    }

    const exitStep = advanceToCell(cells, destination, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
    if (exitStep && canMoveBlockInto(cells, exitStep.pos, dir, occupiedOriginPos)) {
      return destination;
    }
  }

  return start;
}

function moveBlock(
  cells: EngineMapCell[],
  internal: MsInternalState,
  pos: number,
  dir: number,
  deferButtons: boolean,
  preserveSourceTile: boolean,
  occupiedOriginPos = -1,
): boolean {
  const trackedBlock = findVisibleTrackedBlock(internal, pos) ?? upsertTrackedBlock(cells, internal, pos, dir);
  const oldWasCloneMachine = cells[pos]!.bottom.id === MS_TILE.CloneMachine;
  const keepSourceTile = preserveSourceTile || oldWasCloneMachine;
  if (!canLeaveFloor(cells, pos, dir, trackedBlock.released)) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return false;
  }
  const x = pos % MS_GRID_WIDTH;
  const y = Math.floor(pos / MS_GRID_WIDTH);
  const nextX = x + (dir === MS_DIRECTION.west ? -1 : dir === MS_DIRECTION.east ? 1 : 0);
  const nextY = y + (dir === MS_DIRECTION.north ? -1 : dir === MS_DIRECTION.south ? 1 : 0);
  if (nextX < 0 || nextX >= MS_GRID_WIDTH || nextY < 0 || nextY >= MS_GRID_HEIGHT) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return false;
  }

  const nextPos = nextY * MS_GRID_WIDTH + nextX;
  if (!canMoveBlockInto(cells, nextPos, dir, occupiedOriginPos)) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return false;
  }

  const targetTop = cells[nextPos]!.top.id;
  const targetTopState = cells[nextPos]!.top.state;
  const targetBottom = cells[nextPos]!.bottom.id;
  const targetBottomState = cells[nextPos]!.bottom.state;
  if (targetTop === MS_TILE.Water) {
    cells[nextPos]!.top.id = MS_TILE.Dirt;
    cells[nextPos]!.top.state = 0;
    if (!keepSourceTile) {
      popTile(cells, pos);
    } else if (oldWasCloneMachine) {
      cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
    }
    hideTrackedBlockAtPos(internal, pos, dir);
    internal.pendingSoundEffects |= 1 << MS_SOUND.WaterSplash;
    return true;
  }
  if (targetTop === MS_TILE.Bomb) {
    cells[nextPos]!.top.id = MS_TILE.Empty;
    cells[nextPos]!.top.state = 0;
    if (!keepSourceTile) {
      popTile(cells, pos);
    } else if (oldWasCloneMachine) {
      cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
    }
    hideTrackedBlockAtPos(internal, pos, dir);
    internal.pendingSoundEffects |= 1 << MS_SOUND.BombExplodes;
    return true;
  }

  if (targetBottom === MS_TILE.CloneMachine) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return false;
  }

  const movedTile = keepSourceTile ? { ...cells[pos]!.top } : popTile(cells, pos);
  let landingPos = nextPos;
  if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
    landingPos = teleportDestinationForBlock(cells, nextPos, dir, pos);
  }

  placeStaticBlock(cells, landingPos, movedTile.state);
  if (oldWasCloneMachine) {
    cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }

  const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  if (targetCreatureId === MS_TILE.Chip || targetCreatureId === MS_TILE.Swimming_Chip) {
    internal.chipStatus = "collided";
  }

  const block = trackedBlock;
  block.pos = landingPos;
  block.dir = dir;
  updateBlockReleaseAfterMove(cells, internal, block, pos, targetTop, landingPos);
  const previousFloorMovement = block.floorMovement;
  const previousSliding = block.sliding;
  setBlockFloorMovementAfterSuccessfulMove(
    block,
    targetCreatureId !== MS_TILE.Empty ? targetBottom : targetTop,
    targetCreatureId !== MS_TILE.Empty ? targetBottomState : targetTopState,
    internal,
    previousFloorMovement,
    previousSliding,
  );
  if (previousFloorMovement === "none" && block.floorMovement !== "none") {
    internal.controllerDir = block.floorMovementDir;
  }
  const landedButtonFloor = targetCreatureId !== MS_TILE.Empty ? targetBottom : targetTop;
  if (
    landedButtonFloor === MS_TILE.Button_Blue ||
    landedButtonFloor === MS_TILE.Button_Green ||
    landedButtonFloor === MS_TILE.Button_Red ||
    landedButtonFloor === MS_TILE.Button_Brown
  ) {
    if (deferButtons) {
      addBottomTileFlags(cells, landingPos, MS_FLOOR_STATE.ButtonDown);
      if (landedButtonFloor !== MS_TILE.Button_Green) {
        internal.pendingSoundEffects |= 1 << MS_SOUND.ButtonPushed;
      }
    } else {
      const buttonSoundEffects = resolveButtonFloorEffects(cells, internal, landingPos, landedButtonFloor);
      internal.pendingSoundEffects |= buttonSoundEffects;
    }
  }

  return true;
}

function pushBlock(
  cells: EngineMapCell[],
  internal: MsInternalState,
  pos: number,
  dir: number,
  teleportPush = false,
  deferButtons = true,
  occupiedOriginPos = -1,
): boolean {
  const trackedBlock = findVisibleTrackedBlock(internal, pos);
  if (trackedBlock && trackedBlock.floorMovement !== "none") {
    const slipDir = trackedBlock.floorMovementDir;
    if ((dir === slipDir || dir === backDirection(slipDir)) && !teleportPush) {
      return false;
    }
  }
  const moved = moveBlock(cells, internal, pos, dir, deferButtons, false, occupiedOriginPos);
  if (!moved && trackedBlock && !trackedBlock.hidden && !teleportPush) {
    const standingFloor = bottomTileIdOr(cells, pos, MS_TILE.Empty);
    if (standingFloor !== MS_TILE.Beartrap && standingFloor !== MS_TILE.CloneMachine && trackedBlock.floorMovement === "none") {
      trackedBlock.dir = dir;
    }
  }
  return moved;
}

function advanceCloneMachineBlock(cells: EngineMapCell[], internal: MsInternalState, pos: number, dir: number): boolean {
  return moveBlock(cells, internal, pos, dir, false, true);
}

function findClonerTarget(internal: MsInternalState, buttonPos: number): number | null {
  return internal.cloners.find((connection) => connection.from === buttonPos)?.to ?? null;
}

function findTrapTarget(internal: MsInternalState, buttonPos: number): number | null {
  return internal.traps.find((connection) => connection.from === buttonPos)?.to ?? null;
}

function creatureAtPos(internal: MsInternalState, pos: number): MsTrackedCreature | undefined {
  return findVisibleActorAtPosition(internal.creatures, pos);
}

function isTrapButtonDown(cells: EngineMapCell[], pos: number): boolean {
  return pos >= 0 && pos < cells.length && topTileId(cells, pos) !== MS_TILE.Button_Brown;
}

function hasTrapConnection(internal: MsInternalState, pos: number): boolean {
  return internal.traps.some((connection) => connection.to === pos);
}

function isTrapOpen(cells: EngineMapCell[], internal: MsInternalState, trapPos: number, skipButtonPos: number): boolean {
  return internal.traps.some(
    (connection) => connection.to === trapPos && connection.from !== skipButtonPos && isTrapButtonDown(cells, connection.from),
  );
}

function springTrap(cells: EngineMapCell[], internal: MsInternalState, buttonPos: number): void {
  const trapPos = findTrapTarget(internal, buttonPos);
  if (trapPos === null || trapPos < 0 || trapPos >= cells.length) {
    return;
  }

  if (trapPos === internal.chipPos) {
    internal.chipReleased = true;
  }

  const trappedBlock = findVisibleTrackedBlock(internal, trapPos);
  if (trappedBlock) {
    trappedBlock.released = true;
  } else if (cells[trapPos]?.top.id === MS_TILE.Block_Static) {
    upsertTrackedBlock(cells, internal, trapPos, MS_DIRECTION.none).released = true;
  }

  const trappedCreature = creatureAtPos(internal, trapPos);
  if (trappedCreature) {
    trappedCreature.released = true;
  }
}

function resolveButtonFloorEffects(
  cells: EngineMapCell[],
  internal: MsInternalState,
  buttonPos: number,
  floor: number,
  inMidMove: MsTrackedCreature | null = null,
): number {
  switch (msButtonAction(floor)) {
    case "turn-tanks":
      turnTanks(cells, internal, inMidMove);
      return 1 << MS_SOUND.ButtonPushed;
    case "toggle-walls":
      toggleWalls(cells);
      return 0;
    case "activate-cloner":
      activateCloner(cells, internal, buttonPos);
      return 1 << MS_SOUND.ButtonPushed;
    case "spring-trap":
      springTrap(cells, internal, buttonPos);
      return 1 << MS_SOUND.ButtonPushed;
    default:
      return 0;
  }
}

function handleDeferredButtons(cells: EngineMapCell[], internal: MsInternalState): number {
  let soundEffects = 0;

  for (const cell of cells) {
    let floor: number = MS_TILE.Empty;
    if (hasTopTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown)) {
      removeTopTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown);
      floor = cell.top.id;
    } else if (hasBottomTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown)) {
      removeBottomTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown);
      floor = cell.bottom.id;
    }

    if (floor !== MS_TILE.Empty) {
      soundEffects |= resolveButtonFloorEffects(cells, internal, cell.position.pos, floor);
    }
  }

  return soundEffects;
}

function resetButtons(cells: EngineMapCell[]): void {
  for (const cell of cells) {
    removeTopTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown);
    removeBottomTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown);
  }
}

function updateCreatureTile(cells: EngineMapCell[], creature: MsTrackedCreature): void {
  updateCreatureTileWithForce(cells, creature, false);
}

function updateCreatureTileWithForce(cells: EngineMapCell[], creature: MsTrackedCreature, force: boolean): void {
  if (!isMsCreature(cells[creature.pos]!.top.id) || msCreatureId(cells[creature.pos]!.top.id) !== creature.id) {
    if (!force) {
      return;
    }
  }

  cells[creature.pos]!.top = {
    id: msCreatureTile(creature.id, creature.turning ? rightDirection(creature.dir) : creature.dir),
    state: cells[creature.pos]!.top.state,
  };
}

function creatureIndexForSerial(internal: MsInternalState, serial: number): number {
  return internal.creatureIndexBySerial.get(serial) ?? -1;
}

function creatureForSerial(internal: MsInternalState, serial: number): MsTrackedCreature | undefined {
  const creatureIndex = creatureIndexForSerial(internal, serial);
  return creatureIndex >= 0 ? internal.creatures[creatureIndex] : undefined;
}

function findCreatureSlipIndex(internal: MsInternalState, serial: number): number {
  return internal.creatureSlipList.findIndex((entry) => entry.serial === serial);
}

function reserveNextSlipOrder(internal: MsInternalState): number {
  let maxSlipOrder = -1;
  for (const entry of internal.creatureSlipList) {
    if (entry.slipOrder > maxSlipOrder) {
      maxSlipOrder = entry.slipOrder;
    }
  }
  for (const block of internal.blocks) {
    if (block.slipOrder > maxSlipOrder) {
      maxSlipOrder = block.slipOrder;
    }
  }
  if (internal.nextSlipOrder <= maxSlipOrder) {
    internal.nextSlipOrder = maxSlipOrder + 1;
  }
  const slipOrder = internal.nextSlipOrder;
  internal.nextSlipOrder += 1;
  return slipOrder;
}

function clearCreatureFloorMovement(creature: MsTrackedCreature, internal: MsInternalState): void {
  creature.floorMovement = "none";
  creature.floorMovementDir = MS_DIRECTION.none;
  creature.sliding = false;

  const slipIndex = findCreatureSlipIndex(internal, creature.serial);
  if (slipIndex >= 0) {
    internal.creatureSlipList.splice(slipIndex, 1);
  }
}

function moveCreatureSlipEntryToEnd(internal: MsInternalState, serial: number): void {
  const slipIndex = findCreatureSlipIndex(internal, serial);
  if (slipIndex < 0) {
    return;
  }
  internal.creatureSlipList[slipIndex]!.slipOrder = reserveNextSlipOrder(internal);
}

function refreshCreatureSlidingFlag(creature: MsTrackedCreature): void {
  creature.sliding =
    creature.floorMovementDir !== MS_DIRECTION.none &&
    (creature.floorMovement === "ice" || creature.floorMovement === "slide" || creature.floorMovement === "teleport");
}

function syncCreatureFloorMovement(cells: EngineMapCell[], creature: MsTrackedCreature, internal: MsInternalState): boolean {
  if (creature.hidden) {
    clearCreatureFloorMovement(creature, internal);
    return false;
  }

  const standingTile = bottomTile(cells, creature.pos);
  const floor = standingTile.id;
  if (
    floor === MS_TILE.Teleport &&
    (standingTile.state & MS_FLOOR_STATE.Broken) !== 0 &&
    creature.floorMovement !== "none" &&
    creature.floorMovementDir !== MS_DIRECTION.none
  ) {
    const slipIndex = findCreatureSlipIndex(internal, creature.serial);
    if (slipIndex >= 0) {
      internal.creatureSlipList[slipIndex]!.dir = creature.floorMovementDir;
    }
    return false;
  }
  let movement: MsTrackedCreature["floorMovement"] = "none";
  let movementDir: number = MS_DIRECTION.none;
  if (floor === MS_TILE.Teleport && (standingTile.state & MS_FLOOR_STATE.Broken) === 0) {
    movement = "teleport";
    movementDir = creature.dir;
  } else if (isIceFloor(floor)) {
    movement = "ice";
    movementDir = iceWallTurn(floor, creature.dir);
  } else if (isSlideFloor(floor)) {
    movement = "slide";
    movementDir = slideDirection(floor, internal);
  }

  if (movement === "none" || movementDir === MS_DIRECTION.none) {
    clearCreatureFloorMovement(creature, internal);
    return false;
  }

  creature.floorMovement = movement;
  creature.floorMovementDir = movementDir;
  creature.sliding = false;

  const slipIndex = findCreatureSlipIndex(internal, creature.serial);
  if (slipIndex >= 0) {
    internal.creatureSlipList[slipIndex]!.dir = movementDir;
    return false;
  }

  internal.creatureSlipList.push({
    serial: creature.serial,
    dir: movementDir,
    slipOrder: reserveNextSlipOrder(internal),
  });
  internal.controllerDir = movementDir;
  return true;
}

function restartCreatureFloorMovementAfterBlockedAttempt(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  originalDir: number,
  internal: MsInternalState,
): void {
  if (creature.hidden) {
    clearCreatureFloorMovement(creature, internal);
    return;
  }

  const standingTile = bottomTile(cells, creature.pos);
  const floor = standingTile.id;
  if (
    floor === MS_TILE.Teleport &&
    (standingTile.state & MS_FLOOR_STATE.Broken) !== 0 &&
    creature.floorMovement !== "none" &&
    originalDir !== MS_DIRECTION.none
  ) {
    creature.floorMovement = "teleport";
    creature.floorMovementDir = originalDir;
    creature.sliding = false;

    const slipIndex = findCreatureSlipIndex(internal, creature.serial);
    if (slipIndex >= 0) {
      internal.creatureSlipList[slipIndex]!.dir = originalDir;
    } else {
      internal.creatureSlipList.push({
        serial: creature.serial,
        dir: originalDir,
        slipOrder: reserveNextSlipOrder(internal),
      });
    }
    return;
  }
  let movement: MsTrackedCreature["floorMovement"] = "none";
  let movementDir: number = MS_DIRECTION.none;
  if (floor === MS_TILE.Teleport && (standingTile.state & MS_FLOOR_STATE.Broken) === 0) {
    movement = "teleport";
    movementDir = originalDir;
  } else if (isIceFloor(floor)) {
    movement = "ice";
    movementDir = originalDir;
  } else if (isSlideFloor(floor)) {
    movement = "slide";
    movementDir = slideDirection(floor, internal);
  }

  if (movement === "none" || movementDir === MS_DIRECTION.none) {
    clearCreatureFloorMovement(creature, internal);
    return;
  }

  creature.floorMovement = movement;
  creature.floorMovementDir = movementDir;
  creature.sliding = false;

  const slipIndex = findCreatureSlipIndex(internal, creature.serial);
  if (slipIndex >= 0) {
    internal.creatureSlipList[slipIndex]!.dir = movementDir;
  } else {
    internal.creatureSlipList.push({
      serial: creature.serial,
      dir: movementDir,
      slipOrder: reserveNextSlipOrder(internal),
    });
  }
}

function findVisibleTrackedBlock(internal: MsInternalState, pos: number): MsTrackedBlock | undefined {
  return findVisibleActorAtPosition(internal.blocks, pos);
}

function hideTrackedBlockAtPos(internal: MsInternalState, pos: number, dir: number): MsTrackedBlock {
  const block =
    findVisibleTrackedBlock(internal, pos) ??
    findExistingActorAtPosition(internal.blocks, pos) ?? {
      pos,
      dir,
      hidden: false,
      released: false,
      floorMovement: "none" as const,
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
      slideDelayPending: false,
      slipOrder: -1,
    };

  if (!internal.blocks.includes(block)) {
    internal.blocks.push(block);
  }

  block.pos = pos;
  block.dir = dir;
  block.hidden = true;
  block.released = false;
  block.floorMovement = "none";
  block.floorMovementDir = MS_DIRECTION.none;
  block.sliding = false;
  block.slideDelayPending = false;
  block.slipOrder = -1;
  return block;
}

function upsertTrackedBlock(cells: EngineMapCell[], internal: MsInternalState, pos: number, dir: number): MsTrackedBlock {
  const existing = findVisibleTrackedBlock(internal, pos);
  if (existing) {
    existing.dir = dir;
    return existing;
  }

  const topId = topTileIdOr(cells, pos, MS_TILE.Empty);

  const block: MsTrackedBlock = {
    pos,
    dir: topId === MS_TILE.Block_Static ? MS_DIRECTION.none : dir,
    hidden: false,
    released: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    sliding: false,
    slideDelayPending: false,
    slipOrder: -1,
  };
  internal.blocks.push(block);
  return block;
}

function activateBlockSlipOrder(block: MsTrackedBlock, internal: MsInternalState, requeue: boolean): void {
  if (block.hidden || block.floorMovement === "none" || block.floorMovementDir === MS_DIRECTION.none) {
    block.slipOrder = -1;
    return;
  }

  if (requeue || block.slipOrder < 0) {
    block.slipOrder = reserveNextSlipOrder(internal);
  }
}

function refreshBlockFloorMovement(cells: EngineMapCell[], block: MsTrackedBlock, internal: MsInternalState): void {
  if (block.hidden) {
    block.floorMovement = "none";
    block.floorMovementDir = MS_DIRECTION.none;
    block.sliding = false;
    block.slideDelayPending = false;
    block.slipOrder = -1;
    return;
  }

  const standingTile = bottomTile(cells, block.pos);
  const floor = standingTile.id;
  if (floor === MS_TILE.Teleport && (standingTile.state & MS_FLOOR_STATE.Broken) === 0) {
    block.floorMovement = "teleport";
    block.floorMovementDir = block.dir;
    block.sliding = false;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (floor === MS_TILE.Beartrap) {
    block.floorMovement = "slide";
    block.floorMovementDir = block.dir;
    block.sliding = false;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isIceFloor(floor)) {
    block.floorMovement = "ice";
    block.floorMovementDir = iceWallTurn(floor, block.dir);
    block.sliding = false;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isSlideFloor(floor)) {
    block.floorMovement = "slide";
    block.floorMovementDir = slideDirection(floor, internal);
    block.sliding = false;
    block.slideDelayPending = true;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  block.floorMovement = "none";
  block.floorMovementDir = MS_DIRECTION.none;
  block.sliding = false;
  block.slideDelayPending = false;
  block.slipOrder = -1;
}

function restartBlockFloorMovementAfterBlockedAttempt(
  cells: EngineMapCell[],
  block: MsTrackedBlock,
  originalDir: number,
  internal: MsInternalState,
): void {
  if (block.hidden) {
    block.floorMovement = "none";
    block.floorMovementDir = MS_DIRECTION.none;
    block.sliding = false;
    block.slipOrder = -1;
    return;
  }

  const standingTile = bottomTile(cells, block.pos);
  const floor = standingTile.id;
  if (floor === MS_TILE.Teleport && (standingTile.state & MS_FLOOR_STATE.Broken) === 0) {
    block.floorMovement = "teleport";
    block.floorMovementDir = originalDir;
    block.sliding = false;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (floor === MS_TILE.Beartrap) {
    block.floorMovement = "slide";
    block.floorMovementDir = block.dir;
    block.sliding = false;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isIceFloor(floor)) {
    block.floorMovement = "ice";
    block.floorMovementDir = originalDir;
    block.sliding = false;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isSlideFloor(floor)) {
    block.floorMovement = "slide";
    block.floorMovementDir = slideDirection(floor, internal);
    block.sliding = false;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  block.floorMovement = "none";
  block.floorMovementDir = MS_DIRECTION.none;
  block.sliding = false;
  block.slideDelayPending = false;
  block.slipOrder = -1;
}

function restartBlockFloorMovementAfterRetrySuccess(
  cells: EngineMapCell[],
  block: MsTrackedBlock,
  internal: MsInternalState,
): void {
  if (block.hidden) {
    block.floorMovement = "none";
    block.floorMovementDir = MS_DIRECTION.none;
    block.sliding = false;
    block.slideDelayPending = false;
    block.slipOrder = -1;
    return;
  }

  const standingTile = bottomTile(cells, block.pos);
  const floor = standingTile.id;
  if (floor === MS_TILE.Teleport && (standingTile.state & MS_FLOOR_STATE.Broken) === 0) {
    block.floorMovement = "teleport";
    block.floorMovementDir = block.dir;
    block.sliding = true;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (floor === MS_TILE.Beartrap) {
    block.floorMovement = "slide";
    block.floorMovementDir = block.dir;
    block.sliding = true;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isIceFloor(floor)) {
    block.floorMovement = "ice";
    block.floorMovementDir = iceWallTurn(floor, block.dir);
    block.sliding = true;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isSlideFloor(floor)) {
    block.floorMovement = "slide";
    block.floorMovementDir = slideDirection(floor, internal);
    block.sliding = true;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  block.floorMovement = "none";
  block.floorMovementDir = MS_DIRECTION.none;
  block.sliding = false;
  block.slideDelayPending = false;
  block.slipOrder = -1;
}

function setBlockFloorMovementAfterSuccessfulMove(
  block: MsTrackedBlock,
  floor: number,
  floorState: number,
  internal: MsInternalState,
  previousFloorMovement: MsTrackedBlock["floorMovement"],
  previousSliding: boolean,
): void {
  const wasSlipping = previousFloorMovement !== "none";

  if (floor === MS_TILE.Teleport && (floorState & MS_FLOOR_STATE.Broken) === 0) {
    block.floorMovement = "teleport";
    block.floorMovementDir = block.dir;
    block.sliding = wasSlipping;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (floor === MS_TILE.Beartrap && wasSlipping) {
    block.floorMovement = "slide";
    block.floorMovementDir = block.dir;
    block.sliding = true;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isIceFloor(floor)) {
    block.floorMovement = "ice";
    block.floorMovementDir = iceWallTurn(floor, block.dir);
    block.sliding = wasSlipping;
    block.slideDelayPending = false;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  if (isSlideFloor(floor)) {
    block.floorMovement = "slide";
    block.floorMovementDir = slideDirection(floor, internal);
    block.sliding = wasSlipping;
    block.slideDelayPending = !wasSlipping;
    activateBlockSlipOrder(block, internal, false);
    return;
  }

  block.floorMovement = "none";
  block.floorMovementDir = MS_DIRECTION.none;
  block.sliding = false;
  block.slideDelayPending = false;
  block.slipOrder = -1;
}

function updateBlockReleaseAfterMove(
  cells: EngineMapCell[],
  internal: MsInternalState,
  block: MsTrackedBlock,
  sourcePos: number,
  targetTop: number,
  landingPos: number,
): void {
  if (targetTop === MS_TILE.Beartrap) {
    block.released = isTrapOpen(cells, internal, landingPos, sourcePos);
    return;
  }

  if (cells[landingPos]!.bottom.id === MS_TILE.Beartrap) {
    block.released = hasTrapConnection(internal, landingPos);
    return;
  }

  block.released = false;
}

function turnTanks(cells: EngineMapCell[], internal: MsInternalState, inMidMove: MsTrackedCreature | null = null): void {
  for (const creature of internal.creatures) {
    if (creature.hidden || creature.id !== MS_TILE.Tank) {
      continue;
    }
    creature.dir = backDirection(creature.dir);
    if (
      creature.floorMovement !== "none" &&
      !creature.sliding &&
      creature.frame !== MS_DIRECTION.none &&
      creature.moving === 0
    ) {
      creature.dir = backDirection(creature.frame);
    }
    if (!creature.turning) {
      creature.turning = true;
      creature.hasMoved = true;
    }
    if (creature === inMidMove) {
      continue;
    }
    if (isMsCreature(cells[creature.pos]!.top.id) && msCreatureId(cells[creature.pos]!.top.id) === MS_TILE.Tank) {
      updateCreatureTile(cells, creature);
    } else if (creature.moving !== 0) {
      if (creature.turning) {
        creature.turning = false;
        updateCreatureTileWithForce(cells, creature, true);
        creature.turning = true;
      }
      creature.dir = backDirection(creature.dir);
    }
  }
}

function toggleWalls(cells: EngineMapCell[]): void {
  for (const cell of cells) {
    if (
      (cell.top.id === MS_TILE.SwitchWall_Open || cell.top.id === MS_TILE.SwitchWall_Closed) &&
      (cell.top.state & MS_FLOOR_STATE.Broken) === 0
    ) {
      cell.top.id ^= MS_TILE.SwitchWall_Open ^ MS_TILE.SwitchWall_Closed;
    }
    if (
      (cell.bottom.id === MS_TILE.SwitchWall_Open || cell.bottom.id === MS_TILE.SwitchWall_Closed) &&
      (cell.bottom.state & MS_FLOOR_STATE.Broken) === 0
    ) {
      cell.bottom.id ^= MS_TILE.SwitchWall_Open ^ MS_TILE.SwitchWall_Closed;
    }
  }
}

function activateCloner(cells: EngineMapCell[], internal: MsInternalState, buttonPos: number): void {
  const sourcePos = findClonerTarget(internal, buttonPos);
  if (sourcePos === null) {
    return;
  }

  const sourceCell = cells[sourcePos]!;
  if (!isMsCreature(sourceCell.top.id)) {
    return;
  }

  const sourceId = msCreatureId(sourceCell.top.id);
  if (sourceId === MS_TILE.Chip) {
    return;
  }

  const sourceDir = msCreatureDir(sourceCell.top.id);
  if (sourceId === MS_TILE.Block) {
    const sourceIsCloneMachine = sourceCell.bottom.id === MS_TILE.CloneMachine;
    if (sourceIsCloneMachine && (sourceCell.bottom.state & MS_FLOOR_STATE.Cloning) !== 0) {
      return;
    }
    if (sourceDir !== MS_DIRECTION.none) {
      if (sourceIsCloneMachine) {
        advanceCloneMachineBlock(cells, internal, sourcePos, sourceDir);
      } else {
        moveBlock(cells, internal, sourcePos, sourceDir, false, false);
      }
    }
    return;
  }

  if (sourceCell.bottom.id !== MS_TILE.CloneMachine || (sourceCell.bottom.state & MS_FLOOR_STATE.Cloning) !== 0) {
    return;
  }

  if (
    !canMoveCreatureWithOptions(
      cells,
      {
        serial: -1,
        id: sourceId,
        dir: sourceDir,
        tdir: MS_DIRECTION.none,
        pos: sourcePos,
        hidden: false,
        moving: 0,
        frame: 0,
        cloning: false,
        released: false,
        turning: false,
        hasMoved: false,
        floorMovement: "none",
        floorMovementDir: MS_DIRECTION.none,
        sliding: false,
      },
      sourceDir,
      false,
      true,
      internal,
    )
  ) {
    return;
  }

  addBottomTileFlags(cells, sourcePos, MS_FLOOR_STATE.Cloning);
  internal.creatures.push({
    serial: internal.nextCreatureSerial,
    id: sourceId,
    dir: sourceDir,
    tdir: MS_DIRECTION.none,
    pos: sourcePos,
    hidden: false,
    moving: 0,
    frame: 0,
    cloning: true,
    released: false,
    turning: false,
    hasMoved: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    sliding: false,
  });
  internal.creatureIndexBySerial.set(internal.nextCreatureSerial, internal.creatures.length - 1);
  internal.nextCreatureSerial += 1;
}

function resolveCreatureFloorEffects(cells: EngineMapCell[], creature: MsTrackedCreature, internal: MsInternalState): number {
  const floor = bottomTileId(cells, creature.pos);
  return resolveButtonFloorEffects(cells, internal, creature.pos, floor, creature);
}

function resolveChipFloorEffects(cells: EngineMapCell[], internal: MsInternalState): number {
  const floor = bottomTileId(cells, internal.chipPos);
  return resolveButtonFloorEffects(cells, internal, internal.chipPos, floor);
}

function moveCreatureOnce(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  internal: MsInternalState,
): number {
  const oldPos = creature.pos;
  const oldTopCreatureId = msCreatureId(cells[oldPos]!.top.id);
  const oldWasCloneMachine = cells[oldPos]!.bottom.id === MS_TILE.CloneMachine;
  let nextPos = nextPosition(oldPos, dir, MS_GRID_WIDTH);
  const targetTop = cells[nextPos]!.top.id;
  const targetTopState = cells[nextPos]!.top.state;
  const targetBottom = cells[nextPos]!.bottom.id;
  const targetBottomState = cells[nextPos]!.bottom.state;
  const standingFloorWasTop = !isMsCreature(targetTop);
  const preserveHasMoved =
    creature.id === MS_TILE.Tank &&
    creature.turning &&
    creature.hasMoved &&
    creature.floorMovement !== "none" &&
    creature.floorMovementDir !== MS_DIRECTION.none;
  let soundEffects = 0;

  creature.released = false;
  if (!preserveHasMoved) {
    creature.hasMoved = false;
  }
  pushTile(cells, nextPos, { id: MS_TILE.Empty, state: 0 });
  cells[nextPos]!.top = {
    id: msCreatureTile(creature.id, dir),
    state: 0,
  };

  creature.pos = nextPos;
  creature.dir = dir;
  if (creature.turning) {
    updateCreatureTile(cells, creature);
  }
  const standingFloor = standingFloorWasTop ? targetTop : targetBottom;
  const standingFloorState = standingFloorWasTop ? targetTopState : targetBottomState;

  switch (standingFloor) {
    case MS_TILE.Water:
      if (oldTopCreatureId !== MS_TILE.Glider) {
        cells[nextPos]!.top = { id: targetTop, state: targetTopState };
        cells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
        if (!oldWasCloneMachine) {
          popTile(cells, oldPos);
        } else {
          cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }
        creature.pos = oldPos;
        creature.hidden = true;
        clearCreatureFloorMovement(creature, internal);
        return soundEffects;
      }
      break;
    case MS_TILE.Fire:
      if (oldTopCreatureId !== MS_TILE.Fireball) {
        cells[nextPos]!.top = { id: targetTop, state: targetTopState };
        cells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
        if (!oldWasCloneMachine) {
          popTile(cells, oldPos);
        } else {
          cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }
        creature.pos = oldPos;
        creature.hidden = true;
        clearCreatureFloorMovement(creature, internal);
        return soundEffects;
      }
      break;
    case MS_TILE.Bomb:
      cells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
      cells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      if (!oldWasCloneMachine) {
        popTile(cells, oldPos);
      } else {
        cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
      }
      creature.pos = oldPos;
      creature.hidden = true;
      clearCreatureFloorMovement(creature, internal);
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      return soundEffects;
    case MS_TILE.Teleport:
      if ((standingFloorState & MS_FLOOR_STATE.Broken) === 0) {
        const teleportedPos = teleportDestinationForCreature(cells, creature, nextPos, dir, oldPos);
        if (teleportedPos !== nextPos) {
          cells[nextPos]!.top = { id: targetTop, state: targetTopState };
          cells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
          pushTile(cells, teleportedPos, { id: MS_TILE.Empty, state: 0 });
          cells[teleportedPos]!.top = {
            id: msCreatureTile(creature.id, dir),
            state: 0,
          };
          creature.pos = teleportedPos;
          nextPos = teleportedPos;
          if (creature.turning) {
            updateCreatureTile(cells, creature);
          }
        }
      }
      break;
    default:
      break;
  }

  if (!oldWasCloneMachine) {
    popTile(cells, oldPos);
  }
  const savedPos = creature.pos;
  creature.pos = oldPos;
  if (standingFloor === MS_TILE.Button_Red) {
    creature.moving = 1;
  }
  soundEffects |= resolveButtonFloorEffects(cells, internal, nextPos, standingFloor, creature);
  creature.moving = 0;
  creature.pos = savedPos;
  if (standingFloor === MS_TILE.Beartrap) {
    creature.released = isTrapOpen(cells, internal, nextPos, oldPos);
  } else if (cells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    creature.released = hasTrapConnection(internal, nextPos);
  }
  if (isMsCreature(cells[nextPos]!.bottom.id)) {
    const targetId = msCreatureId(cells[nextPos]!.bottom.id);
    if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      internal.chipStatus = "collided";
    }
  }
  if (oldWasCloneMachine) {
    cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }
  syncCreatureFloorMovement(cells, creature, internal);
  return soundEffects;
}

function chooseCreatureDirection(cells: EngineMapCell[], creature: MsTrackedCreature, internal: MsInternalState, currentTime: number, stepping: number): number {
  creature.tdir = MS_DIRECTION.none;
  if ((currentTime & 2) !== 0) {
    return MS_DIRECTION.none;
  }
  if (
    creature.turning &&
    creature.id === MS_TILE.Tank &&
    creature.floorMovement !== "none" &&
    creature.floorMovementDir !== MS_DIRECTION.none
  ) {
    return MS_DIRECTION.none;
  }
  if (creature.turning) {
    creature.turning = false;
    creature.hasMoved = false;
    updateCreatureTile(cells, creature);
  }
  if (creature.hasMoved) {
    internal.controllerDir = MS_DIRECTION.none;
    return MS_DIRECTION.none;
  }
  if (creature.floorMovement !== "none" && creature.floorMovementDir !== MS_DIRECTION.none) {
    return MS_DIRECTION.none;
  }

  if (creature.id === MS_TILE.Teeth || creature.id === MS_TILE.Blob) {
    if (((currentTime + stepping) & 4) !== 0) {
      return MS_DIRECTION.none;
    }
  }

  const floor = floorAt(cells, creature.pos);
  let choices: number[] = [];
  let preferredDir = creature.dir;
  if (floor === MS_TILE.CloneMachine || floor === MS_TILE.Beartrap) {
    switch (creature.id) {
      case MS_TILE.Tank:
      case MS_TILE.Ball:
      case MS_TILE.Glider:
      case MS_TILE.Fireball:
      case MS_TILE.Walker:
        choices = [creature.dir];
        break;
      case MS_TILE.Blob:
        choices = [creature.dir, leftDirection(creature.dir), backDirection(creature.dir), rightDirection(creature.dir)];
        randomp4(internal, choices);
        break;
      case MS_TILE.Bug:
      case MS_TILE.Paramecium:
      case MS_TILE.Teeth:
        creature.tdir = internal.controllerDir;
        return internal.controllerDir;
      default:
        return MS_DIRECTION.none;
    }
  } else {
    switch (creature.id) {
      case MS_TILE.Tank:
        choices = [creature.dir];
        break;
      case MS_TILE.Ball:
        choices = [creature.dir, backDirection(creature.dir)];
        break;
      case MS_TILE.Glider:
        choices = [creature.dir, leftDirection(creature.dir), rightDirection(creature.dir), backDirection(creature.dir)];
        break;
      case MS_TILE.Fireball:
        choices = [creature.dir, rightDirection(creature.dir), leftDirection(creature.dir), backDirection(creature.dir)];
        break;
      case MS_TILE.Walker: {
        const randomized = [leftDirection(creature.dir), backDirection(creature.dir), rightDirection(creature.dir)];
        randomp3(internal, randomized);
        choices = [creature.dir, ...randomized];
        break;
      }
      case MS_TILE.Blob:
        choices = [creature.dir, leftDirection(creature.dir), backDirection(creature.dir), rightDirection(creature.dir)];
        randomp4(internal, choices);
        break;
      case MS_TILE.Bug:
        choices = [leftDirection(creature.dir), creature.dir, rightDirection(creature.dir), backDirection(creature.dir)];
        break;
      case MS_TILE.Paramecium:
        choices = [rightDirection(creature.dir), creature.dir, leftDirection(creature.dir), backDirection(creature.dir)];
        break;
      case MS_TILE.Teeth: {
        let deltaY = Math.floor(internal.chipPos / MS_GRID_WIDTH) - Math.floor(creature.pos / MS_GRID_WIDTH);
        let deltaX = (internal.chipPos % MS_GRID_WIDTH) - (creature.pos % MS_GRID_WIDTH);
        const vertical = deltaY < 0 ? MS_DIRECTION.north : deltaY > 0 ? MS_DIRECTION.south : MS_DIRECTION.none;
        if (deltaY < 0) {
          deltaY = -deltaY;
        }
        const horizontal = deltaX < 0 ? MS_DIRECTION.west : deltaX > 0 ? MS_DIRECTION.east : MS_DIRECTION.none;
        if (deltaX < 0) {
          deltaX = -deltaX;
        }
        choices = deltaX > deltaY ? [horizontal, vertical] : [vertical, horizontal];
        preferredDir = choices[0] ?? creature.dir;
        if (choices[0] !== MS_DIRECTION.none) {
          choices.push(choices[0]!);
        }
        break;
      }
      default:
        return MS_DIRECTION.none;
    }
  }

  if (creature.id === MS_TILE.Tank) {
    creature.tdir = creature.dir;
  }

  for (const dir of choices) {
    creature.tdir = dir;
    internal.controllerDir = dir;
    if (dir !== MS_DIRECTION.none && canMoveCreature(cells, creature, dir)) {
      return dir;
    }
  }

  if (
    creature.id !== MS_TILE.Tank &&
    floor !== MS_TILE.Beartrap &&
    floor !== MS_TILE.CloneMachine &&
    preferredDir !== MS_DIRECTION.none &&
    creature.dir !== preferredDir
  ) {
    creature.dir = preferredDir;
    updateCreatureTile(cells, creature);
  }

  creature.tdir = preferredDir;
  if (creature.id === MS_TILE.Tank) {
    if (creature.released || floor !== MS_TILE.Beartrap) {
      creature.hasMoved = true;
    }
    creature.tdir = MS_DIRECTION.none;
    return MS_DIRECTION.none;
  }

  return preferredDir;
}

function resolvePendingCloners(cells: EngineMapCell[], internal: MsInternalState): void {
  internal.pendingCloners = [];
}

function createClones(internal: MsInternalState): void {
  for (const creature of internal.creatures) {
    creature.cloning = false;
  }
}

function runCreatureFloorMovements(cells: EngineMapCell[], internal: MsInternalState, currentTime: number): number {
  type ActiveNonChipSlip =
    | { kind: "creature"; serial: number; dir: number; slipOrder: number }
    | { kind: "block"; blockIndex: number; slipOrder: number };

  const compareActiveNonChipSlips = (left: ActiveNonChipSlip, right: ActiveNonChipSlip): number => {
    if (left.slipOrder === right.slipOrder) {
      if (left.kind === "creature" && right.kind === "creature") {
        return left.serial - right.serial;
      }
      if (left.kind === "block" && right.kind === "block") {
        return left.blockIndex - right.blockIndex;
      }
      return left.kind === "creature" ? -1 : 1;
    }
    return left.slipOrder - right.slipOrder;
  };

  const listActiveNonChipSlips = (): ActiveNonChipSlip[] =>
    [
      ...internal.creatureSlipList
        .filter((entry) => {
          const creature = creatureForSerial(internal, entry.serial);
          return (
            creature &&
            !creature.hidden &&
            !creature.cloning &&
            creature.floorMovement !== "none" &&
            creature.floorMovementDir !== MS_DIRECTION.none
          );
        })
        .map((entry) => ({
          kind: "creature" as const,
          serial: entry.serial,
          dir: entry.dir,
          slipOrder: entry.slipOrder,
        })),
      ...internal.blocks
        .map((block, blockIndex) => ({ block, blockIndex }))
        .filter(({ block }) => !block.hidden && block.floorMovement !== "none" && block.floorMovementDir !== MS_DIRECTION.none)
        .map(({ blockIndex }) => ({
          kind: "block" as const,
          blockIndex,
          slipOrder: internal.blocks[blockIndex]!.slipOrder,
        })),
    ].sort(compareActiveNonChipSlips);

  const queue = listActiveNonChipSlips();

  const entryLabel = (entry: ActiveNonChipSlip | undefined): string | null => {
    if (!entry) {
      return null;
    }
    if (entry.kind === "creature") {
      const creature = creatureForSerial(internal, entry.serial);
      return `creature:${entry.serial}:${creature?.pos ?? -1}`;
    }
    const block = internal.blocks[entry.blockIndex];
    return `block:${entry.blockIndex}:${block?.pos ?? -1}`;
  };

  const queueLabels = (): string[] => queue.map((entry) => entryLabel(entry) ?? "unknown");

  const traceQueue = (action: string, slipIndex: number, advance: number, entry?: ActiveNonChipSlip): void => {
    msQueueTraceHook?.({
      tick: currentTime,
      phase: "non-chip-floor",
      action,
      slipIndex,
      advance,
      entry: entryLabel(entry),
      queue: queueLabels(),
    });
  };

  const isQueueEntryActive = (entry: ActiveNonChipSlip): boolean => {
    if (entry.kind === "creature") {
      const creature = creatureForSerial(internal, entry.serial);
      return Boolean(
        creature &&
          !creature.hidden &&
          !creature.cloning &&
          creature.floorMovement !== "none" &&
          creature.floorMovementDir !== MS_DIRECTION.none,
      );
    }

    const block = internal.blocks[entry.blockIndex];
    return Boolean(block && !block.hidden && block.floorMovement !== "none" && block.floorMovementDir !== MS_DIRECTION.none);
  };

  const syncQueueBackToState = (): void => {
    internal.creatureSlipList = [];
    for (const block of internal.blocks) {
      block.slipOrder = -1;
    }

    for (const entry of queue) {
      if (!isQueueEntryActive(entry)) {
        continue;
      }

      if (entry.kind === "creature") {
        const creature = creatureForSerial(internal, entry.serial);
        if (!creature) {
          continue;
        }
        internal.creatureSlipList.push({
          serial: creature.serial,
          dir: entry.dir,
          slipOrder: entry.slipOrder,
        });
      } else {
        const block = internal.blocks[entry.blockIndex];
        if (!block) {
          continue;
        }
        block.slipOrder = entry.slipOrder;
      }
    }
  };

  const updateQueueEntry = (entry: ActiveNonChipSlip): void => {
    if (entry.kind === "creature") {
      const creature = creatureForSerial(internal, entry.serial);
      entry.dir = creature?.floorMovementDir ?? MS_DIRECTION.none;
    }
  };

  const removeQueueEntry = (index: number): void => {
    queue.splice(index, 1);
  };

  const queueContainsEntry = (entry: ActiveNonChipSlip): boolean =>
    queue.some((candidate) => {
      if (candidate.kind !== entry.kind) {
        return false;
      }
      if (candidate.kind === "creature" && entry.kind === "creature") {
        return candidate.serial === entry.serial;
      }
      if (candidate.kind === "block" && entry.kind === "block") {
        return candidate.blockIndex === entry.blockIndex;
      }
      return false;
    });

  const appendNewActiveEntriesIntoQueue = (): void => {
    for (const entry of internal.creatureSlipList) {
      const creature = creatureForSerial(internal, entry.serial);
      if (
        !creature ||
        creature.hidden ||
        creature.cloning ||
        creature.floorMovement === "none" ||
        creature.floorMovementDir === MS_DIRECTION.none
      ) {
        continue;
      }

      const activeEntry: ActiveNonChipSlip = {
        kind: "creature",
        serial: entry.serial,
        dir: entry.dir,
        slipOrder: entry.slipOrder,
      };
      if (!queueContainsEntry(activeEntry)) {
        queue.push(activeEntry);
      }
    }

    internal.blocks.forEach((block, blockIndex) => {
      if (block.hidden || block.floorMovement === "none" || block.floorMovementDir === MS_DIRECTION.none) {
        return;
      }

      const activeEntry: ActiveNonChipSlip = {
        kind: "block",
        blockIndex,
        slipOrder: block.slipOrder,
      };
      if (!queueContainsEntry(activeEntry)) {
        queue.push(activeEntry);
      }
    });

    queue.sort(compareActiveNonChipSlips);
  };

  const requeueCurrentEntry = (index: number): void => {
    const entry = queue[index];
    if (!entry || !isQueueEntryActive(entry)) {
      removeQueueEntry(index);
      return;
    }

    updateQueueEntry(entry);
    entry.slipOrder = reserveNextSlipOrder(internal);
    queue.splice(index, 1);
    queue.push(entry);
  };

  internal.blocks.forEach((block, blockIndex) => {
    if (!block.hidden && block.floorMovement === "slide" && block.floorMovementDir !== MS_DIRECTION.none && block.slideDelayPending) {
      block.slideDelayPending = false;
    }
  });

  let soundEffects = 0;
  let advance = 0;
  traceQueue("start", 0, advance);
  for (let slipIndex = 0; slipIndex < queue.length; ) {
    const previousSlipCount = queue.length;
    const active = queue[slipIndex];
    if (!active) {
      break;
    }

    if (advance > 0) {
      traceQueue("skip-advance", slipIndex, advance, active);
      advance -= 1;
      slipIndex += 1;
      continue;
    }

    if (!isQueueEntryActive(active)) {
      traceQueue("remove-inactive", slipIndex, advance, active);
      removeQueueEntry(slipIndex);
      continue;
    }

    traceQueue("process", slipIndex, advance, active);

    if (active.kind === "creature") {
      const creature = creatureForSerial(internal, active.serial);
      if (
        !creature ||
        creature.hidden ||
        creature.cloning ||
        creature.floorMovement === "none" ||
        creature.floorMovementDir === MS_DIRECTION.none
      ) {
        removeQueueEntry(slipIndex);
        continue;
      }

      creature.frame = creature.dir;
      try {
        const originalDir = active.dir;
        let moved = false;
        let retriedAfterBlock = false;

        if (canMoveCreature(cells, creature, originalDir)) {
          soundEffects |= moveCreatureOnce(cells, creature, originalDir, internal);
          refreshCreatureSlidingFlag(creature);
          moved = true;
        } else if (creature.floorMovement === "ice") {
          retriedAfterBlock = true;
          const turnedDir = iceWallTurn(cells[creature.pos]!.bottom.id, backDirection(originalDir));
          if (turnedDir !== MS_DIRECTION.none && canMoveCreature(cells, creature, turnedDir)) {
            soundEffects |= moveCreatureOnce(cells, creature, turnedDir, internal);
            refreshCreatureSlidingFlag(creature);
            moved = true;
          } else {
            creature.floorMovementDir = originalDir;
            const slipIndex = findCreatureSlipIndex(internal, creature.serial);
            if (slipIndex >= 0) {
              internal.creatureSlipList[slipIndex]!.dir = originalDir;
            }
          }
        }

        if (retriedAfterBlock && findCreatureSlipIndex(internal, creature.serial) >= 0) {
          if (moved) {
            syncCreatureFloorMovement(cells, creature, internal);
          }
          if (isQueueEntryActive(active)) {
            traceQueue("requeue-creature-retry", slipIndex, advance, active);
            requeueCurrentEntry(slipIndex);
          } else {
            traceQueue("remove-creature-retry-inactive", slipIndex, advance, active);
            removeQueueEntry(slipIndex);
          }
        }

        if (!moved) {
          restartCreatureFloorMovementAfterBlockedAttempt(cells, creature, originalDir, internal);
          if (isQueueEntryActive(active)) {
            updateQueueEntry(active);
          } else {
            traceQueue("remove-creature-post-restart-inactive", slipIndex, advance, active);
            removeQueueEntry(slipIndex);
            continue;
          }

          if (!retriedAfterBlock && findCreatureSlipIndex(internal, creature.serial) >= 0 && creature.floorMovementDir !== MS_DIRECTION.none) {
            traceQueue("requeue-creature-blocked", slipIndex, advance, active);
            requeueCurrentEntry(slipIndex);
          }
        } else if (isQueueEntryActive(active)) {
          updateQueueEntry(active);
        } else {
          traceQueue("remove-creature-post-move-inactive", slipIndex, advance, active);
          removeQueueEntry(slipIndex);
          appendNewActiveEntriesIntoQueue();
          if (queue.length === previousSlipCount) {
            advance += 1;
          }
          continue;
        }
      } finally {
        creature.frame = 0;
      }
    } else {
      const block = internal.blocks[active.blockIndex];
      if (!block) {
        traceQueue("remove-missing-block", slipIndex, advance, active);
        removeQueueEntry(slipIndex);
        continue;
      }

      const tryMove = (dir: number): boolean => {
        const oldWasCloneMachine = cells[block.pos]!.bottom.id === MS_TILE.CloneMachine;
        if (!canLeaveFloor(cells, block.pos, dir, block.released)) {
          return false;
        }

        const nextPos = nextPosition(block.pos, dir, MS_GRID_WIDTH);
        if (!canMoveBlockInto(cells, nextPos, dir)) {
          return false;
        }

        const targetTop = cells[nextPos]!.top.id;
        const targetTopState = cells[nextPos]!.top.state;
        const targetBottom = cells[nextPos]!.bottom.id;
        const targetBottomState = cells[nextPos]!.bottom.state;
        if (targetTop === MS_TILE.Water) {
          cells[nextPos]!.top = { id: MS_TILE.Dirt, state: 0 };
          if (!oldWasCloneMachine) {
            popTile(cells, block.pos);
          } else {
            cells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
          }
          hideTrackedBlockAtPos(internal, block.pos, dir);
          soundEffects |= 1 << MS_SOUND.WaterSplash;
          return true;
        }
        if (targetTop === MS_TILE.Bomb) {
          cells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
          if (!oldWasCloneMachine) {
            popTile(cells, block.pos);
          } else {
            cells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
          }
          hideTrackedBlockAtPos(internal, block.pos, dir);
          soundEffects |= 1 << MS_SOUND.BombExplodes;
          return true;
        }

        const movedTile = oldWasCloneMachine ? { ...cells[block.pos]!.top } : popTile(cells, block.pos);
        let landingPos = nextPos;
        if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
          landingPos = teleportDestinationForBlock(cells, nextPos, dir, block.pos);
        }

        placeStaticBlock(cells, landingPos, movedTile.state);

        const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
        if (targetCreatureId === MS_TILE.Chip || targetCreatureId === MS_TILE.Swimming_Chip) {
          internal.chipStatus = "collided";
        }
        if (oldWasCloneMachine) {
          cells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }

        const successfulFloor = targetCreatureId !== MS_TILE.Empty ? targetBottom : targetTop;
        const successfulFloorState = targetCreatureId !== MS_TILE.Empty ? targetBottomState : targetTopState;

        const sourcePos = block.pos;
        block.pos = landingPos;
        block.dir = dir;
        updateBlockReleaseAfterMove(cells, internal, block, sourcePos, targetTop, landingPos);
        const previousFloorMovement = block.floorMovement;
        const previousSliding = block.sliding;
        setBlockFloorMovementAfterSuccessfulMove(
          block,
          successfulFloor,
          successfulFloorState,
          internal,
          previousFloorMovement,
          previousSliding,
        );
        if (previousFloorMovement === "none" && block.floorMovement !== "none") {
          internal.controllerDir = block.floorMovementDir;
        }
        if (
          successfulFloor === MS_TILE.Button_Blue ||
          successfulFloor === MS_TILE.Button_Green ||
          successfulFloor === MS_TILE.Button_Red ||
          successfulFloor === MS_TILE.Button_Brown
        ) {
          soundEffects |= resolveButtonFloorEffects(cells, internal, landingPos, successfulFloor);
        }
        return true;
      };

      const originalDir = block.floorMovementDir;
      let moved = tryMove(originalDir);
      let retriedAfterBlock = false;

      if (!moved && block.floorMovement === "ice") {
        retriedAfterBlock = true;
        const turnedDir = iceWallTurn(cells[block.pos]!.bottom.id, backDirection(originalDir));
        block.floorMovementDir = turnedDir;
        if (turnedDir !== MS_DIRECTION.none) {
          moved = tryMove(turnedDir);
        }
      }

      if (
        retriedAfterBlock &&
        !block.hidden &&
        block.floorMovement !== "none" &&
        block.floorMovementDir !== MS_DIRECTION.none
      ) {
        if (moved) {
          restartBlockFloorMovementAfterRetrySuccess(cells, block, internal);
        }
        traceQueue("requeue-block-retry", slipIndex, advance, active);
        requeueCurrentEntry(slipIndex);
      }

      if (!moved && internal.blocks.includes(block)) {
        restartBlockFloorMovementAfterBlockedAttempt(cells, block, originalDir, internal);
        if (!isQueueEntryActive(active)) {
          traceQueue("remove-block-post-restart-inactive", slipIndex, advance, active);
          removeQueueEntry(slipIndex);
          continue;
        }

        if (!retriedAfterBlock && !block.hidden && block.floorMovement !== "none" && block.floorMovementDir !== MS_DIRECTION.none) {
          traceQueue("requeue-block-blocked", slipIndex, advance, active);
          requeueCurrentEntry(slipIndex);
        }
      } else if (!isQueueEntryActive(active)) {
        traceQueue("remove-block-post-move-inactive", slipIndex, advance, active);
        removeQueueEntry(slipIndex);
        appendNewActiveEntriesIntoQueue();
        if (queue.length === previousSlipCount) {
          advance += 1;
        }
        continue;
      }
    }

    appendNewActiveEntriesIntoQueue();
    const nextSlipCount = queue.length;
    if (nextSlipCount === previousSlipCount) {
      advance += 1;
    }
  }

  syncQueueBackToState();
  traceQueue("end", queue.length, advance);
  return soundEffects;
}

function runCreatureMovements(cells: EngineMapCell[], internal: MsInternalState, currentTime: number, stepping: number): number {
  if (currentTime <= 0 || (currentTime & 1) !== 0) {
    return 0;
  }

  let soundEffects = 0;
  const applyBlockedCreatureAttempt = (creature: MsTrackedCreature, dir: number): void => {
    const floor = floorAt(cells, creature.pos);
    if (dir === MS_DIRECTION.none || floor === MS_TILE.Beartrap || floor === MS_TILE.CloneMachine) {
      return;
    }

    creature.dir = dir;
    updateCreatureTile(cells, creature);
  };

  for (const creature of internal.creatures) {
    if (creature.hidden || creature.cloning) {
      continue;
    }
    const dir = chooseCreatureDirection(cells, creature, internal, currentTime, stepping);
    if (dir !== MS_DIRECTION.none) {
      if (canMoveCreature(cells, creature, dir)) {
        soundEffects |= moveCreatureOnce(cells, creature, dir, internal);
      } else {
        applyBlockedCreatureAttempt(creature, dir);
      }
    }
  }

  return soundEffects;
}

function teleportDestination(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  start: number,
  dir: number,
): { destination: number; soundEffects: number } {
  let destination = start;
  const basePendingSoundEffects = internal.pendingSoundEffects;
  let pendingSoundEffects = basePendingSoundEffects;

  for (;;) {
    destination -= 1;
    if (destination < 0) {
      destination += cells.length;
    }
    if (destination === start) {
      break;
    }

    const tile = cells[destination]!.top;
    if (tile.id !== MS_TILE.Teleport || (tile.state & MS_FLOOR_STATE.Broken) !== 0) {
      continue;
    }

    const probeInternal: MsInternalState = {
      ...internal,
      chipPos: destination,
      chipDir: dir,
      chipTDir: MS_DIRECTION.none,
      currentInput: MS_DIRECTION.none,
      controllerDir: MS_DIRECTION.none,
      chipHasMoved: false,
      chipReleased: false,
      chipWait: 0,
      chipStatus: "okay",
      completed: false,
      replayDeadlineFailed: false,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      pendingSoundEffects,
    };

    const canExit = canMoveChip(cells, probeInternal, inventory, dir, {
        exposeWalls: false,
        noLeaveCheck: true,
        teleportPush: true,
        deferButtons: false,
        occupiedOriginPos: start,
      });
    pendingSoundEffects = probeInternal.pendingSoundEffects;

    if (canExit) {
      internal.pendingSoundEffects = pendingSoundEffects;
      return {
        destination,
        soundEffects: pendingSoundEffects & ~basePendingSoundEffects,
      };
    }
  }

  internal.pendingSoundEffects = pendingSoundEffects;
  return {
    destination: start,
    soundEffects: pendingSoundEffects & ~basePendingSoundEffects,
  };
}

function applyMsChipEntryEffects(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  nextPos: number,
  nextCell: EngineMapCell,
): { enteredTeleport: boolean; soundEffects: number; floorTileBeforeMove: EngineMapCell["top"] } {
  let floorTileBeforeMove = nextCell.top;
  const floor = floorTileBeforeMove.id;
  let enteredTeleport = false;
  let soundEffects = 0;

  switch (msChipEnterAction(floor)) {
    case "clear-floor":
      popTile(cells, nextPos);
      break;
    case "collect-chip":
      inventory.chipsNeeded = Math.max(0, inventory.chipsNeeded - 1);
      popTile(cells, nextPos);
      soundEffects |= 1 << MS_SOUND.IcCollected;
      break;
    case "popup-wall":
      if (nextCell.top.id === MS_TILE.Empty) {
        popTile(cells, nextPos);
      } else {
        floorTileBeforeMove.id = MS_TILE.Wall;
      }
      break;
    case "open-door": {
      const index = msDoorKeyIndex(floor);
      if (index !== null && floor !== MS_TILE.Door_Green) {
        inventory.keys[index] -= 1;
      }
      popTile(cells, nextPos);
      soundEffects |= 1 << MS_SOUND.DoorOpened;
      break;
    }
    case "collect-item": {
      const slot = msInventorySlot(floor);
      const index = msInventoryIndex(floor);
      if (slot !== null && index !== null) {
        inventory[slot][index] += 1;
        popTile(cells, nextPos);
        soundEffects |= 1 << MS_SOUND.ItemCollected;
      }
      break;
    }
    case "open-socket":
      popTile(cells, nextPos);
      soundEffects |= 1 << MS_SOUND.SocketOpened;
      break;
    case "steal-boots":
      inventory.boots = [0, 0, 0, 0] as EngineState["inventory"]["boots"];
      soundEffects |= 1 << MS_SOUND.BootsStolen;
      break;
    case "explode-bomb":
      internal.chipStatus = "bombed";
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      break;
    case "water-death":
      if (inventory.boots[3] === 0) {
        internal.chipStatus = "drowned";
      }
      break;
    case "fire-death":
      if (inventory.boots[2] === 0) {
        internal.chipStatus = "burned";
      }
      break;
    case "teleport":
      if ((floorTileBeforeMove.state & MS_FLOOR_STATE.Broken) === 0) {
        enteredTeleport = true;
      }
      break;
    case "collision":
      if (msIsActorTile(floor)) {
        internal.chipStatus = "collided";
      }
      break;
    case "none":
      break;
  }

  return {
    enteredTeleport,
    soundEffects,
    floorTileBeforeMove,
  };
}

function moveChipOnce(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
): number {
  const oldPos = internal.chipPos;
  let nextPos =
    oldPos +
    (dir === MS_DIRECTION.north
      ? -MS_GRID_WIDTH
      : dir === MS_DIRECTION.south
        ? MS_GRID_WIDTH
        : dir === MS_DIRECTION.west
          ? -1
          : 1);
  let nextCell = cells[nextPos]!;
  const enteredFloor = nextCell.top.id;
  const enteredFloorState = nextCell.top.state;
  let soundEffects = 0;
  internal.chipReleased = false;

  const enteredEffects = applyMsChipEntryEffects(cells, internal, inventory, nextPos, nextCell);
  let floorTileBeforeMove = enteredEffects.floorTileBeforeMove;
  let floor = floorTileBeforeMove.id;
  const enteredTeleport = enteredEffects.enteredTeleport;
  soundEffects |= enteredEffects.soundEffects;

  popTile(cells, oldPos);

  if (enteredTeleport) {
    const teleported = teleportDestination(cells, internal, inventory, nextPos, dir);
    nextPos = teleported.destination;
    soundEffects |= teleported.soundEffects;
    nextCell = cells[nextPos]!;
    soundEffects |= 1 << MS_SOUND.Teleporting;
  }

  const landingCell = cells[nextPos]!;
  const preserveUnderlyingFloor = landingCell.top.id === MS_TILE.Empty && msPreservesUnderlyingFloor(landingCell.bottom.id);
  if (!preserveUnderlyingFloor) {
    pushTile(cells, nextPos, { id: MS_TILE.Empty, state: 0 });
  }
  cells[nextPos]!.top = {
    id:
      internal.chipStatus === "drowned"
        ? MS_TILE.Drowned_Chip
        : internal.chipStatus === "burned"
          ? MS_TILE.Burned_Chip
          : internal.chipStatus === "bombed"
            ? MS_TILE.Bombed_Chip
            : msCreatureTile(MS_TILE.Chip, dir),
    state: 0,
  };

  internal.chipPos = nextPos;
  internal.chipDir = dir;
  if (internal.goalPos === internal.chipPos) {
    internal.goalPos = -1;
  }
  if (internal.chipStatus === "okay") {
    updateChipTile(cells, internal);
  }
  // Native MS resolves Chip button effects from the original landed tile,
  // not any floor uncovered by popping items like sockets or chips.
  soundEffects |= resolveButtonFloorEffects(cells, internal, internal.chipPos, floor);
  if (floor === MS_TILE.Beartrap) {
    internal.chipReleased = isTrapOpen(cells, internal, nextPos, oldPos);
  } else if (cells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    internal.chipReleased = hasTrapConnection(internal, nextPos);
  }
  if (internal.chipStatus === "okay" && msTileHasTag(cells[nextPos]!.bottom.id, "exit")) {
    internal.completed = true;
  }

  refreshFloorMovementFromEnteredTile(cells, internal, inventory, enteredFloor, enteredFloorState);
  soundEffects |= handleDeferredButtons(cells, internal);
  return soundEffects;
}

function runFloorMovement(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): number {
  if (internal.floorMovement === "none" || internal.floorMovementDir === MS_DIRECTION.none || internal.chipStatus !== "okay") {
    return 0;
  }

  internal.chipWait = 0;
  internal.lastSlipDir = internal.floorMovementDir;
  let soundEffects = 0;
  if (canMoveChip(cells, internal, inventory, internal.floorMovementDir)) {
    soundEffects |= moveChipOnce(cells, internal, inventory, internal.floorMovementDir);
    internal.chipHasMoved = false;
    return soundEffects;
  }

  soundEffects |= 1 << MS_SOUND.CantMove;
  resetButtons(cells);
  internal.goalPos = -1;

  if (internal.floorMovement === "ice") {
    internal.floorMovementDir = iceWallTurn(bottomTileId(cells, internal.chipPos), backDirection(internal.floorMovementDir));
    internal.lastSlipDir = internal.floorMovementDir;
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    if (canMoveChip(cells, internal, inventory, internal.floorMovementDir)) {
      soundEffects |= moveChipOnce(cells, internal, inventory, internal.floorMovementDir);
      refreshFloorMovement(cells, internal, inventory);
      internal.chipHasMoved = false;
      return soundEffects;
    }
  } else if (internal.floorMovement === "slide") {
    // Native MS clears Chip's "has moved" flag after a blocked slide push,
    // allowing a perpendicular manual move later in the same even tick.
    internal.chipHasMoved = false;
  } else if (internal.floorMovement === "teleport") {
    internal.floorMovementDir = backDirection(internal.floorMovementDir);
    internal.lastSlipDir = internal.floorMovementDir;
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    if (canMoveChip(cells, internal, inventory, internal.floorMovementDir)) {
      soundEffects |= moveChipOnce(cells, internal, inventory, internal.floorMovementDir);
      internal.chipHasMoved = false;
      return soundEffects;
    }
  }

  refreshFloorMovement(cells, internal, inventory);
  return soundEffects;
}

function chipMoveToGoalPos(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): number {
  if (internal.goalPos < 0) {
    return MS_DIRECTION.none;
  }
  if (internal.goalPos === internal.chipPos) {
    internal.goalPos = -1;
    return MS_DIRECTION.none;
  }

  let dy = Math.floor(internal.goalPos / MS_GRID_WIDTH) - Math.floor(internal.chipPos / MS_GRID_WIDTH);
  let dx = (internal.goalPos % MS_GRID_WIDTH) - (internal.chipPos % MS_GRID_WIDTH);
  let primary: number = dy < 0 ? MS_DIRECTION.north : dy > 0 ? MS_DIRECTION.south : MS_DIRECTION.none;
  if (dy < 0) {
    dy = -dy;
  }
  let secondary: number = dx < 0 ? MS_DIRECTION.west : dx > 0 ? MS_DIRECTION.east : MS_DIRECTION.none;
  if (dx < 0) {
    dx = -dx;
  }
  if (dx > dy) {
    const swap = primary;
    primary = secondary;
    secondary = swap;
  }
  if (primary !== MS_DIRECTION.none && secondary !== MS_DIRECTION.none) {
    return canMoveChip(cells, internal, inventory, primary) ? primary : secondary;
  }
  return secondary === MS_DIRECTION.none ? primary : secondary;
}

function chooseManualMovement(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  currentTime: number,
): number {
  internal.chipTDir = MS_DIRECTION.none;
  if ((currentTime & 3) === 0) {
    internal.chipHasMoved = false;
  }
  if (internal.chipHasMoved) {
    if (internal.currentInput !== MS_DIRECTION.none && internal.goalPos >= 0) {
      internal.goalPos = -1;
    }
    return MS_DIRECTION.none;
  }
  const inputCode = internal.currentInput;
  internal.currentInput = MS_DIRECTION.none;
  if (
    internal.floorMovement === "ice" ||
    internal.floorMovement === "teleport" ||
    (internal.floorMovement === "slide" && inputCode === internal.chipDir)
  ) {
    if (currentTime > 0 && (currentTime & 1) === 0) {
      internal.goalPos = -1;
    }
    return MS_DIRECTION.none;
  }
  if (inputCode === MS_DIRECTION.none) {
    let dir: number = MS_DIRECTION.none;
    if (internal.goalPos >= 0 && (currentTime & 3) === 2) {
      dir = chipMoveToGoalPos(cells, internal, inventory);
    }
    internal.chipTDir = dir;
    return dir;
  }

  let dir = normalizeDirection(inputCode);
  if (isAbsoluteMouseCommand(inputCode)) {
    internal.goalPos = inputCode - CMD_ABS_MOUSE_MOVE_FIRST;
    dir = (currentTime & 3) === 2 ? chipMoveToGoalPos(cells, internal, inventory) : MS_DIRECTION.none;
  } else if (isRelativeMouseCommand(inputCode)) {
    internal.goalPos = makeMouseAbsolute(inputCode - CMD_MOUSE_MOVE_FIRST, internal.chipPos);
    dir = (currentTime & 3) === 2 ? chipMoveToGoalPos(cells, internal, inventory) : MS_DIRECTION.none;
  }

  internal.chipTDir = dir;
  return dir;
}

function runManualMovement(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
): number {
  if (dir === MS_DIRECTION.none) {
    return 0;
  }

  internal.chipWait = 0;
  if (!canMoveChip(cells, internal, inventory, dir)) {
    resetButtons(cells);
    internal.chipDir = dir;
    internal.chipHasMoved = internal.chipStatus === "okay";
    internal.goalPos = -1;
    updateChipTile(cells, internal);
    return 1 << MS_SOUND.CantMove;
  }

  const soundEffects = moveChipOnce(cells, internal, inventory, dir);
  internal.chipHasMoved = internal.chipStatus === "okay";
  return soundEffects;
}

function resolveReplayLastMoveAfterChoose(
  state: MsGameState,
  internal: MsInternalState,
  currentTime: number,
  inputCode: number,
  chipHasMovedBeforeChoose: boolean,
  goalPosBeforeChoose: number,
  floorMovementBeforeChoose: MsInternalState["floorMovement"],
  chipDirBeforeChoose: number,
): EngineState["lastMove"] {
  const previous = state.engine.lastMove;

  if (state.engine.replay.cursor < 0) {
    return { code: MS_DIRECTION.none, name: "none" };
  }

  const chipHasMoved = (currentTime & 3) === 0 ? false : chipHasMovedBeforeChoose;
  const discardFloorMovement = floorMovementBeforeChoose;
  const discardChipDir = chipDirBeforeChoose;

  if (chipHasMoved) {
    if (inputCode !== MS_DIRECTION.none && goalPosBeforeChoose >= 0) {
      const runtimeMove = createRuntimeCommand(CMD_MOVE_NOP, state.engine.timer.currentTime + 1);
      return {
        code: runtimeMove.inputCode,
        name: runtimeMove.inputName,
      };
    }
    return previous;
  }

  const discard =
    discardFloorMovement === "ice" ||
    discardFloorMovement === "teleport" ||
    (discardFloorMovement === "slide" && inputCode === discardChipDir);
  if (discard) {
    return previous;
  }

  if (isAbsoluteMouseCommand(inputCode)) {
    const goalPos = inputCode - CMD_ABS_MOUSE_MOVE_FIRST;
    const move = createRuntimeCommand(
      CMD_MOUSE_MOVE_FIRST + makeMouseRelative(goalPos, internal.chipPos),
      state.engine.timer.currentTime + 1,
    );
    return {
      code: move.inputCode,
      name: move.inputName,
    };
  }

  if (isRelativeMouseCommand(inputCode)) {
    const move = createRuntimeCommand(inputCode, state.engine.timer.currentTime + 1);
    return {
      code: move.inputCode,
      name: move.inputName,
    };
  }

  const dir = normalizeDirection(inputCode);
  const runtimeMove = createRuntimeCommand(dir, state.engine.timer.currentTime + 1);
  return {
    code: runtimeMove.inputCode,
    name: runtimeMove.inputName,
  };
}

function replayBestTimeTicks(replay: ReplaySolutionPayload): number | undefined {
  const replayWithBestTime = replay as ReplaySolutionPayload & {
    bestTimeTicks?: number;
  };
  return typeof replayWithBestTime.bestTimeTicks === "number" ? replayWithBestTime.bestTimeTicks : undefined;
}

function isMouseGoalInputCode(inputCode: number): boolean {
  return inputCode === CMD_MOVE_NOP || isAbsoluteMouseCommand(inputCode) || isRelativeMouseCommand(inputCode);
}

function latchCurrentInput(state: MsGameState, internal: MsInternalState, input: GameRuntimeCommand): void {
  if (state.engine.replay.cursor >= 0) {
    if (input.inputCode !== MS_DIRECTION.none) {
      internal.currentInput = input.inputCode;
    }
    return;
  }

  internal.currentInput = normalizeDirection(input.inputCode);
}

// MS runs Chip floor movement on even ticks before normal input handling.
function advanceMsTick(
  state: MsGameState,
  input: GameRuntimeCommand,
  debugPhases: GameDebugPhaseSnapshot[] | null = null,
): MsGameState {
  const cells = cloneBoardCells(state.engine.map.cells);
  const internal = cloneInternalState(state.internal);
  const inputLatchInternal = cloneInternalState(state.internal);
  const inventory = cloneInventory(state.engine.inventory);
  const nextTick = state.engine.timer.currentTime + 1;
  let timeOffset = -1;
  let soundEffects = 0;
  internal.pendingSoundEffects = 0;
  const flushPendingSoundEffects = (): void => {
    if (internal.pendingSoundEffects === 0) {
      return;
    }
    soundEffects |= internal.pendingSoundEffects;
    internal.pendingSoundEffects = 0;
  };

  const finishTick = (
    lastMove: EngineState["lastMove"] = state.engine.lastMove,
    overrideTimeOffset = timeOffset,
    includeFinalPhase = true,
  ): MsGameState => {
    const nextState = updateEngine(
      {
        engine: {
          ...state.engine,
          inventory,
          lastMove,
          timer: {
            ...state.engine.timer,
            timeOffset: overrideTimeOffset,
          },
        },
        internal,
      },
      cells,
      soundEffects,
    );
    if (debugPhases && includeFinalPhase) {
      recordTurnDebugPhase(debugPhases, TURN_DEBUG_PHASE.final, (phase) =>
        projectMsDebugPhaseSnapshot(
          nextState,
          nextState.engine.map.cells,
          nextState.internal,
          nextState.engine.inventory,
          nextState.engine.timer.currentTime,
          nextState.engine.soundEffects,
          nextState.engine.lastMove,
          phase,
        ),
      );
    }
    return nextState;
  };

  if (
    state.engine.replay.cursor >= 0 &&
    state.engine.replay.cursor >= state.engine.replay.moveCount &&
    nextTick + state.engine.timer.timeOffset - 1 > state.engine.replay.bestTimeTicks
  ) {
    internal.replayDeadlineFailed = true;
    return finishTick(state.engine.lastMove, state.engine.timer.timeOffset, false);
  }

  const recordPhase = (phase: TurnDebugPhaseName, lastMove: EngineState["lastMove"] = state.engine.lastMove): void => {
    if (!debugPhases) {
      return;
    }
    recordTurnDebugPhase(debugPhases, phase, (recordedPhase) =>
      projectMsDebugPhaseSnapshot(
        state,
        cells,
        internal,
        inventory,
        nextTick,
        soundEffects,
        lastMove,
        recordedPhase,
      ),
    );
  };

  const recordPhaseWithInternal = (
    phase: TurnDebugPhaseName,
    snapshotInternal: MsInternalState,
    lastMove: EngineState["lastMove"] = state.engine.lastMove,
    chipSlipCarryDir: number = MS_DIRECTION.none,
  ): void => {
    if (!debugPhases) {
      return;
    }
    recordTurnDebugPhase(debugPhases, phase, (recordedPhase) =>
      projectMsDebugPhaseSnapshot(
        state,
        cells,
        snapshotInternal,
        inventory,
        nextTick,
        soundEffects,
        lastMove,
        recordedPhase,
        chipSlipCarryDir,
      ),
    );
  };

  const isPlayablePhase = (): boolean => internal.chipStatus === "okay" && !internal.completed;

  const maybeFinishEarly = (lastMove: EngineState["lastMove"] = state.engine.lastMove): MsGameState | null => {
    if (isPlayablePhase()) {
      return null;
    }
    flushPendingSoundEffects();
    return finishTick(lastMove);
  };

  const runInitialHousekeepingPhase = (): number => {
    latchCurrentInput(state, inputLatchInternal, input);
    if (debugPhases) {
      debugPhases.push(
        projectMsDebugPhaseSnapshot(
          state,
          cells,
          inputLatchInternal,
          inventory,
          nextTick,
          soundEffects,
          state.engine.lastMove,
          TURN_DEBUG_PHASE.postInputLatch,
        ),
      );
    }

    if ((nextTick & 3) === 0) {
      for (const creature of internal.creatures) {
        if (creature.turning) {
          creature.turning = false;
          creature.hasMoved = false;
          updateCreatureTile(cells, creature);
        }
      }
      internal.chipWait += 1;
      if (internal.chipWait > 3) {
        internal.chipWait = 3;
        if (internal.chipDir !== MS_DIRECTION.none) {
          internal.chipDir = MS_DIRECTION.south;
          updateChipTile(cells, internal);
        }
      }
    }

    latchCurrentInput(state, internal, input);
    recordPhase(TURN_DEBUG_PHASE.postInitialHousekeeping);
    return internal.currentInput;
  };

  const runCreatureMovementPhase = (): void => {
    if (!isPlayablePhase()) {
      return;
    }
    if (nextTick > 0 && (nextTick & 1) === 0) {
      internal.controllerDir = MS_DIRECTION.none;
    }
    soundEffects |= runCreatureMovements(cells, internal, nextTick, state.engine.replay.stepping);
    if (nextTick > 0 && (nextTick & 1) === 0) {
      recordPhase(TURN_DEBUG_PHASE.postCreatureMovement);
    }
  };

  const runChipFloorPhase = (): {
    chipFloorMovementModeBeforeFloor: MsInternalState["floorMovement"];
    chipFloorMovementModeAfterFloor: MsInternalState["floorMovement"];
    chipFloorMovementWasActive: boolean;
  } => {
    const chipFloorMovementModeBeforeFloor = internal.floorMovement;
    const chipFloorMovementDirBeforeFloor = internal.floorMovementDir;
    const chipFloorMovementWasActive =
      isPlayablePhase() &&
      nextTick > 0 &&
      (nextTick & 1) === 0 &&
      internal.floorMovement !== "none" &&
      internal.floorMovementDir !== MS_DIRECTION.none;

    if (nextTick > 0 && (nextTick & 1) === 0) {
      soundEffects |= runFloorMovement(cells, internal, inventory);
      recordPhaseWithInternal(
        TURN_DEBUG_PHASE.postChipFloorMovement,
        cloneInternalState(internal),
        state.engine.lastMove,
        chipFloorMovementWasActive && internal.floorMovement === "none"
          ? chipFloorMovementDirBeforeFloor
          : MS_DIRECTION.none,
      );
    }

    return {
      chipFloorMovementModeBeforeFloor,
      chipFloorMovementModeAfterFloor: internal.floorMovement,
      chipFloorMovementWasActive,
    };
  };

  const runCreatureFloorPhase = (): void => {
    if (!isPlayablePhase() || nextTick <= 0 || (nextTick & 1) !== 0) {
      return;
    }
    soundEffects |= runCreatureFloorMovements(cells, internal, nextTick);
    recordPhase(TURN_DEBUG_PHASE.postBlockFloorMovement);
  };

  const resolveChipInputPhase = (
    replayLastMoveInputCode: number,
  ): {
    chipPosBeforeManualMovement: number;
    manualDir: number;
    nextLastMove: EngineState["lastMove"];
  } => {
    const replayLastMoveFloorMovement = internal.floorMovement;
    const replayLastMoveChipDir = internal.chipDir;
    const replayLastMoveGoalPos = internal.goalPos;
    const replayLastMoveChipHasMoved = internal.chipHasMoved;
    const manualDir = isPlayablePhase()
      ? chooseManualMovement(cells, internal, inventory, nextTick)
      : MS_DIRECTION.none;
    const chipPosBeforeManualMovement = internal.chipPos;
    const nextLastMove = resolveReplayLastMoveAfterChoose(
      state,
      internal,
      nextTick,
      replayLastMoveInputCode,
      replayLastMoveChipHasMoved,
      replayLastMoveGoalPos,
      replayLastMoveFloorMovement,
      replayLastMoveChipDir,
    );

    return {
      chipPosBeforeManualMovement,
      manualDir,
      nextLastMove,
    };
  };

  const runTimerPhase = (nextLastMove: EngineState["lastMove"]): MsGameState | null => {
    if (!isPlayablePhase()) {
      return null;
    }
    timeOffset = 0;
    if (state.engine.timer.timeLimit > 0 && nextTick >= state.engine.timer.timeLimit) {
      internal.chipStatus = "outoftime";
      soundEffects |= 1 << MS_SOUND.TimeOut;
      return updateEngine(
        {
          engine: {
            ...state.engine,
            inventory,
            lastMove: nextLastMove,
            timer: {
              ...state.engine.timer,
              timeOffset,
            },
          },
          internal,
        },
        cells,
        soundEffects,
      );
    }
    if (
      state.engine.timer.timeLimit > 0 &&
      state.engine.timer.timeLimit > nextTick &&
      state.engine.timer.timeLimit - nextTick <= 15 * MS_TICKS_PER_SECOND &&
      nextTick % MS_TICKS_PER_SECOND === 0
    ) {
      soundEffects |= 1 << MS_SOUND.TimeLow;
    }
    return null;
  };

  const runManualMovementPhase = (
    nextLastMove: EngineState["lastMove"],
    manualDir: number,
    chipPosBeforeManualMovement: number,
    chipFloorMovementWasActive: boolean,
    chipFloorMovementModeBeforeFloor: MsInternalState["floorMovement"],
    chipFloorMovementModeAfterFloor: MsInternalState["floorMovement"],
  ): MsGameState | null => {
    recordPhaseWithInternal(TURN_DEBUG_PHASE.postChipInput, cloneInternalState(internal), nextLastMove);
    if (isPlayablePhase()) {
      soundEffects |= runManualMovement(cells, internal, inventory, manualDir);
    }
    if (!isPlayablePhase()) {
      flushPendingSoundEffects();
      return finishTick(nextLastMove);
    }
    const carriedSlideExitThisTick =
      !chipFloorMovementWasActive &&
      chipFloorMovementModeAfterFloor === "slide" &&
      internal.floorMovement === "none" &&
      internal.chipPos !== chipPosBeforeManualMovement;
    recordPhaseWithInternal(
      TURN_DEBUG_PHASE.postChipMovement,
      cloneInternalState(internal),
      nextLastMove,
      ((chipFloorMovementWasActive &&
        chipFloorMovementModeBeforeFloor === "slide" &&
        chipFloorMovementModeAfterFloor === "slide" &&
        internal.floorMovement === "none") ||
        carriedSlideExitThisTick)
        ? internal.lastSlipDir
        : MS_DIRECTION.none,
    );
    return null;
  };

  const runCloneReleasePhase = (nextLastMove: EngineState["lastMove"]): MsGameState => {
    soundEffects |= handleDeferredButtons(cells, internal);
    resolvePendingCloners(cells, internal);
    createClones(internal);
    flushPendingSoundEffects();
    recordPhase(TURN_DEBUG_PHASE.postCloneRelease, nextLastMove);
    return finishTick(nextLastMove);
  };

  const replayLastMoveInputCode = runInitialHousekeepingPhase();
  runCreatureMovementPhase();

  let nextLastMove = state.engine.lastMove;
  const earlyAfterCreatureMovement = maybeFinishEarly(nextLastMove);
  if (earlyAfterCreatureMovement) {
    return earlyAfterCreatureMovement;
  }

  const {
    chipFloorMovementModeBeforeFloor,
    chipFloorMovementModeAfterFloor,
    chipFloorMovementWasActive,
  } = runChipFloorPhase();

  nextLastMove = state.engine.lastMove;
  const earlyAfterChipFloor = maybeFinishEarly(nextLastMove);
  if (earlyAfterChipFloor) {
    return earlyAfterChipFloor;
  }

  runCreatureFloorPhase();

  nextLastMove = state.engine.lastMove;
  const earlyAfterCreatureFloor = maybeFinishEarly(nextLastMove);
  if (earlyAfterCreatureFloor) {
    return earlyAfterCreatureFloor;
  }

  const { chipPosBeforeManualMovement, manualDir, nextLastMove: resolvedNextLastMove } = resolveChipInputPhase(
    replayLastMoveInputCode,
  );
  nextLastMove = resolvedNextLastMove;

  const timerResult = runTimerPhase(nextLastMove);
  if (timerResult) {
    return timerResult;
  }

  const manualMovementResult = runManualMovementPhase(
    nextLastMove,
    manualDir,
    chipPosBeforeManualMovement,
    chipFloorMovementWasActive,
    chipFloorMovementModeBeforeFloor,
    chipFloorMovementModeAfterFloor,
  );
  if (manualMovementResult) {
    return manualMovementResult;
  }

  return runCloneReleasePhase(nextLastMove);
}

export function runMsInputTrace(request: GameRequest, level: MsLevel, commands: GameCommand[], maxTicks: number): GameTrace {
  let state = initializeMsGameState(request, level);
  const initialState = engineStateToSnapshot(state.engine, "initial", createRuntimeCommand(0, -1));
  const steps = [];
  let previousInput = createRuntimeCommand(0, -1);

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const input = resolveManualInput(previousInput, scheduledInputForTick(commands, tick));
    previousInput = input;
    state = advanceMsTick(state, input);
    steps.push(engineStateToSnapshot(state.engine, "tick", input));
    if (state.engine.status !== "playing") {
      break;
    }
  }

  return createGameTrace({
    request,
    scheduledInputs: commands,
    initialState,
    steps,
  });
}

export function runMsInputTraceDebug(
  request: GameRequest,
  level: MsLevel,
  commands: GameCommand[],
  maxTicks: number,
): GameDebugTrace {
  let state = initializeMsGameState(request, level);
  const initialState = engineStateToSnapshot(state.engine, "initial", createRuntimeCommand(0, -1));
  const initialDebugState = projectMsDebugPhaseSnapshot(
    state,
    state.engine.map.cells,
    state.internal,
    state.engine.inventory,
    state.engine.timer.currentTime,
    state.engine.soundEffects,
    state.engine.lastMove,
    TURN_DEBUG_PHASE.initial,
  );
  const steps: GameDebugTrace["steps"] = [];
  let previousInput = createRuntimeCommand(0, -1);

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const input = resolveManualInput(previousInput, scheduledInputForTick(commands, tick));
    previousInput = input;
    const phases: GameDebugPhaseSnapshot[] = [];
    state = advanceMsTick(state, input, phases);
    steps.push({
      ...engineStateToSnapshot(state.engine, "tick", input),
      phases,
    });
    if (state.engine.status !== "playing") {
      break;
    }
  }

  return createGameDebugTrace({
    request,
    debugSchemaVersion: MS_DEBUG_SCHEMA_VERSION,
    scheduledInputs: commands,
    initialState,
    initialDebugState,
    steps,
  });
}

export function runMsReplayTrace(
  request: GameRequest,
  level: MsLevel,
  replay: ReplaySolutionPayload,
  maxTicks: number,
): GameTrace {
  let replayPlan = createReplayPlan(replay);
  let state = initializeMsGameState(request, level, {
    ...replay,
    moveCount: replay.moves.length,
    bestTimeTicks: replayBestTimeTicks(replay),
  });
  const initialState = engineStateToSnapshot(state.engine, "initial", createRuntimeCommand(0, -1));
  const steps = [];

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const replayTick = plannedReplayInput(replayPlan, tick);
    replayPlan = replayTick.plan;
    state = advanceMsTick(
      {
        engine: {
          ...state.engine,
          replay: {
            ...state.engine.replay,
            cursor: replayPlan.cursor,
          },
        },
        internal: state.internal,
      },
      replayTick.input,
    );
    steps.push(engineStateToSnapshot(state.engine, "tick", replayTick.input));
    if (state.engine.status !== "playing") {
      break;
    }
  }

  return createGameTrace({
    request,
    scheduledInputs: [],
    initialState,
    steps,
  });
}

export function runMsReplayTraceDebug(
  request: GameRequest,
  level: MsLevel,
  replay: ReplaySolutionPayload,
  maxTicks: number,
): GameDebugTrace {
  return runMsReplayTraceDebugWindow(request, level, replay, maxTicks, 0, maxTicks);
}

export function runMsReplayTraceDebugWindow(
  request: GameRequest,
  level: MsLevel,
  replay: ReplaySolutionPayload,
  maxTicks: number,
  windowStart: number,
  windowEndExclusive: number,
): GameDebugTrace {
  let replayPlan = createReplayPlan(replay);
  let state = initializeMsGameState(request, level, {
    ...replay,
    moveCount: replay.moves.length,
    bestTimeTicks: replayBestTimeTicks(replay),
  });
  const initialState = engineStateToSnapshot(state.engine, "initial", createRuntimeCommand(0, -1));
  const initialDebugState = projectMsDebugPhaseSnapshot(
    state,
    state.engine.map.cells,
    state.internal,
    state.engine.inventory,
    state.engine.timer.currentTime,
    state.engine.soundEffects,
    state.engine.lastMove,
    TURN_DEBUG_PHASE.initial,
  );
  const steps: GameDebugTrace["steps"] = [];
  const includeStep = (tick: number) => tick >= windowStart && tick < windowEndExclusive;

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const replayTick = plannedReplayInput(replayPlan, tick);
    replayPlan = replayTick.plan;
    const phases: GameDebugPhaseSnapshot[] = [];
    state = advanceMsTick(
      {
        engine: {
          ...state.engine,
          replay: {
            ...state.engine.replay,
            cursor: replayPlan.cursor,
          },
        },
        internal: state.internal,
      },
      replayTick.input,
      phases,
    );
    if (includeStep(tick)) {
      steps.push({
        ...engineStateToSnapshot(state.engine, "tick", replayTick.input),
        phases,
      });
    }
    if (state.engine.status !== "playing") {
      break;
    }
  }

  return createGameDebugTrace({
    request,
    debugSchemaVersion: MS_DEBUG_SCHEMA_VERSION,
    scheduledInputs: [],
    initialState,
    initialDebugState,
    steps,
  });
}

export function createMsInteractiveSession(request: GameRequest, level: MsLevel): MsInteractiveSessionState {
  return {
    state: initializeMsGameState(request, level),
    lastInput: createRuntimeCommand(0, -1),
    recordedMoves: [],
    replayPlan: null,
  };
}

export function createMsReplaySession(
  request: GameRequest,
  level: MsLevel,
  replay: ReplaySolutionPayload,
): MsInteractiveSessionState {
  return {
    state: initializeMsGameState(request, level, {
      ...replay,
      moveCount: replay.moves.length,
      bestTimeTicks: replayBestTimeTicks(replay),
    }),
    lastInput: createRuntimeCommand(0, -1),
    recordedMoves: replay.moves.map((move) => ({ ...move })),
    replayPlan: createReplayPlan(replay),
  };
}

export function advanceMsInteractiveSession(
  session: MsInteractiveSessionState,
  inputCode: number,
): MsInteractiveSessionState {
  const tick = session.state.engine.timer.currentTime + 1;
  let input = createRuntimeCommand(inputCode, tick);
  let replayPlan = session.replayPlan;
  if (replayPlan) {
    const replayTick = plannedReplayInput(replayPlan, tick);
    replayPlan = replayTick.plan;
    input = replayTick.input;
  }
  const nextState = advanceMsTick(session.state, input);

  return {
    state: nextState,
    lastInput: input,
    recordedMoves: recordManualMove(
      session.recordedMoves,
      nextState.engine.timer.currentTime,
      nextState.engine.replay.cursor,
      input.inputCode,
    ),
    replayPlan,
  };
}
