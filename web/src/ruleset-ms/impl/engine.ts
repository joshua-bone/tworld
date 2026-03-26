import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import type {
  GameDebugPhaseSnapshot,
  GameDebugTrace,
} from "@game-core/api/debug";
import { findExistingActorAtPosition, findVisibleActorAtPosition } from "@game-core/impl/actors";
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
  promoteBottomTile,
  pushBoardTile,
  removeBottomTileFlags,
  removeTopTileFlags,
  replaceTopTile,
  topTile,
  topTileId,
  topTileIdOr,
} from "@game-core/impl/board";
import {
  advanceToCell,
  directionName,
  nextPosition,
  normalizeCardinalDirection as normalizeDirection,
  reverseDirection as backDirection,
} from "@game-core/impl/grid";
import {
  TURN_DEBUG_PHASE,
  TURN_PHASE,
  recordTurnDebugPhase,
  runTurnPhaseHandlers,
  type TurnDebugPhaseName,
} from "@game-core/api/turnPhases";
import { advanceTimer, createInitialEngineTimer } from "@game-core/impl/timer";
import { mapHash } from "@game-core/impl/hash";
import {
  appendRecordedReplayMove,
  createReplayPlan,
  createRuntimeCommand,
  plannedReplayInput,
  type RecordedReplayMoveDecision,
  resolveManualInput,
  scheduledInputForTick,
  runtimeCommandName,
} from "@game-core/api/playback";
import {
  decodeRuntimeInputCode,
  encodeRuntimeInputCode,
  GAME_INPUT_CODES,
  GAME_INPUT_MODIFIER_MASKS,
  stripRuntimeInputModifiers,
} from "@game-core/api/command";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { createGameDebugTrace, createGameTrace } from "@game-core/impl/trace";
import { collectMsActorsFromLayers, hashMsCreaturesFromLayers, projectMsDebugPhaseSnapshot } from "@ruleset-ms/impl/debugProjection";
import type { GameCommand, GameRequest, GameRuntimeCommand, GameTrace } from "@game-core/api/types";
import {
  collectLevelConnections,
  collectLevelCreaturePositions,
  levelLayers,
  type MsConnection,
  type MsLevel,
} from "@ruleset-ms/api/level";
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
} from "@ruleset-ms/impl/catalog";
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
} from "@ruleset-ms/api/tiles";

export interface MsTrackedCreature {
  serial: number;
  id: number;
  dir: number;
  tdir: number;
  pos: number;
  z?: number;
  hidden: boolean;
  moving: number;
  frame: number;
  cloning: boolean;
  released: boolean;
  turning: boolean;
  hasMoved: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
  sliding: boolean;
}

interface MsCreatureSlipEntry {
  serial: number;
  dir: number;
  slipOrder: number;
}

interface MsPrimedToolDrop {
  tileId: number;
  pos: number;
  z: number;
}

export interface MsTrackedBlock {
  pos: number;
  z?: number;
  dir: number;
  hidden: boolean;
  released: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
  sliding: boolean;
  slideDelayPending: boolean;
  slipOrder: number;
}

export interface MsInternalState {
  chipPos: number;
  chipZ?: number;
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
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
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
  primedToolDrop: MsPrimedToolDrop | null;
  pendingToolDropAfterSettle: MsPrimedToolDrop | null;
  runtimeLayers: MsRuntimeLayer[];
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

interface MsRuntimeLayer {
  z: number;
  cells: EngineMapCell[];
}

interface MsRuntimeState {
  tileOverlays: Array<{
    z: number;
    pos: number;
    kind: InteractiveGameTileOverlayKind;
    ttl: number;
    tileId?: number;
  }>;
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
  recordedMoves: ReplayRecordedMove[];
  replayPlan: ReturnType<typeof createReplayPlan> | null;
}

type MsSessionReplayOptions = Partial<Pick<ReplaySolutionPayload, "randomSeed" | "stepping" | "randomSlideDirection">> & {
  moveCount?: number;
  bestTimeTicks?: number;
};

interface MsAdvanceTickResult {
  state: MsGameState;
  recordedReplayMove: RecordedReplayMoveDecision | null;
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
const MS_AIR_MOVEMENT_DIR = MS_DIRECTION.north;
const MS_ELEVATOR_MOVEMENT_DIR = MS_DIRECTION.south;
const HIDDEN_WALL_REVEAL_TTL = MS_TICKS_PER_SECOND / 2;
const PUSH_BLOCK_PICKUP_REVEAL_TTL = 3;

let msQueueTraceHook: ((event: MsQueueTraceEvent) => void) | null = null;

export function setMsQueueTraceHook(hook: ((event: MsQueueTraceEvent) => void) | null): void {
  msQueueTraceHook = hook;
}

function normalizeRandomSeed(seed: number | undefined): bigint {
  return BigInt((seed ?? 0) & Number(UINT31_MASK));
}

function isRelativeMouseCommand(code: number): boolean {
  const normalized = stripRuntimeInputModifiers(code);
  return normalized >= CMD_MOUSE_MOVE_FIRST && normalized <= CMD_MOUSE_MOVE_LAST;
}

function isAbsoluteMouseCommand(code: number): boolean {
  const normalized = stripRuntimeInputModifiers(code);
  return normalized >= CMD_ABS_MOUSE_MOVE_FIRST && normalized <= CMD_ABS_MOUSE_MOVE_LAST;
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

function isAirFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "air";
}

function isElevatorFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "elevator";
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

function isMsSupportingWallTile(id: number): boolean {
  switch (id) {
    case MS_TILE.Wall:
    case MS_TILE.HiddenWall_Perm:
    case MS_TILE.HiddenWall_Temp:
    case MS_TILE.BlueWall_Real:
    case MS_TILE.SwitchWall_Closed:
      return true;
    default:
      return false;
  }
}

function msLowerRuntimeCells(
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  z: number | undefined,
): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  if (currentZ <= 1) {
    return null;
  }

  return layerCellsByZ.get(currentZ - 1) ?? null;
}

function msUpperRuntimeCells(
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  z: number | undefined,
): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  return layerCellsByZ.get(currentZ + 1) ?? null;
}

function promoteTopFloorToUnderlying(cells: EngineMapCell[], pos: number): void {
  promoteBottomTile(cells, pos, MS_TILE.Empty);
}

function resolveMsChipSupportBelow(
  engine: EngineState,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  inventory: EngineState["inventory"],
  currentZ: number,
): boolean {
  if (!lowerCells) {
    return false;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return false;
  }

  const topId = cell.top.id;
  const bottomId = cell.bottom.id;
  const topActorId = topId === MS_TILE.Block_Static ? MS_TILE.Block : isMsCreature(topId) ? msCreatureId(topId) : null;
  if (topActorId === MS_TILE.Block) {
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  if (topActorId !== null) {
    return false;
  }

  if (isMsSupportingWallTile(topId)) {
    if (topId === MS_TILE.BlueWall_Real) {
      replaceTopTile(lowerCells, pos, { ...cell.top, id: MS_TILE.Wall });
    }
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.BlueWall_Fake) {
    promoteTopFloorToUnderlying(lowerCells, pos);
    return false;
  }

  if (msTileHasTag(topId, "door")) {
    const doorKeyIndex = msDoorKeyIndex(topId);
    if (doorKeyIndex !== null && inventory.keys[doorKeyIndex] > 0) {
      if (topId !== MS_TILE.Door_Green) {
        inventory.keys[doorKeyIndex] -= 1;
      }
      promoteTopFloorToUnderlying(lowerCells, pos);
      return false;
    }
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.Socket) {
    if (inventory.chipsNeeded === 0) {
      promoteTopFloorToUnderlying(lowerCells, pos);
      return false;
    }
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  return false;
}

function resolveMsNonChipSupportBelow(
  engine: EngineState,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  currentZ: number,
  internal: MsInternalState | null,
): boolean {
  if (!lowerCells) {
    return false;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return false;
  }

  const topId = cell.top.id;
  const bottomId = cell.bottom.id;
  const topActorId = topId === MS_TILE.Block_Static ? MS_TILE.Block : isMsCreature(topId) ? msCreatureId(topId) : null;
  if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  if (topActorId !== null) {
    const supported =
      msChipActsWallForMobs(internal, pos, runtimeCellZ(lowerCells, pos)) ||
      (topActorId !== MS_TILE.Chip && topActorId !== MS_TILE.Swimming_Chip);
    if (supported) {
      addMsTileOverlay(engine, currentZ, pos, "support");
    }
    return supported;
  }

  if (
    topId === MS_TILE.Sandbag ||
    isMsSupportingWallTile(topId) ||
    topId === MS_TILE.BlueWall_Fake ||
    msTileHasTag(topId, "door") ||
    topId === MS_TILE.Socket
  ) {
    addMsTileOverlay(engine, currentZ, pos, "support");
    return true;
  }

  return false;
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
    tools: [...inventory.tools] as EngineState["inventory"]["tools"],
    chipsNeeded: inventory.chipsNeeded,
  };
}

function msRuntimeState(engine: EngineState): MsRuntimeState {
  const runtime = engine as EngineState & { msRuntimeState?: MsRuntimeState };
  if (!runtime.msRuntimeState) {
    runtime.msRuntimeState = {
      tileOverlays: [],
    };
  }
  return runtime.msRuntimeState;
}

function clearMsTileOverlays(engine: EngineState): void {
  const runtime = msRuntimeState(engine);
  runtime.tileOverlays = runtime.tileOverlays
    .map((overlay) => ({ ...overlay, ttl: overlay.ttl - 1 }))
    .filter((overlay) => overlay.ttl > 0);
}

function addMsTileOverlay(
  engine: EngineState,
  z: number,
  pos: number,
  kind: InteractiveGameTileOverlayKind,
  ttl = 2,
  tileId?: number,
): void {
  const runtime = msRuntimeState(engine);
  const existing = runtime.tileOverlays.find((overlay) => overlay.z === z && overlay.pos === pos && overlay.kind === kind);
  if (existing) {
    existing.ttl = ttl;
    existing.tileId = tileId;
    return;
  }
  runtime.tileOverlays.push({ z, pos, kind, ttl, tileId });
}

function findPressedMsPermanentHiddenWallPos(cells: EngineMapCell[], chipPos: number, dir: number): number | null {
  const targetStep = advanceToCell(cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  return floorAt(cells, targetStep.pos) === MS_TILE.HiddenWall_Perm ? targetStep.pos : null;
}

function isMsPushPickupRevealTile(id: number): boolean {
  return (
    id === MS_TILE.ICChip ||
    (id >= MS_TILE.Key_Red && id <= MS_TILE.Key_Green) ||
    (id >= MS_TILE.Boots_Ice && id <= MS_TILE.Boots_Water)
  );
}

function findPushedMsBlockPickupRevealTileId(cells: EngineMapCell[], chipPos: number, dir: number): number | null {
  const targetStep = advanceToCell(cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  const targetCell = cells[targetStep.pos];
  if (!targetCell || targetCell.top.id !== MS_TILE.Block_Static) {
    return null;
  }

  return isMsPushPickupRevealTile(targetCell.bottom.id) ? targetCell.bottom.id : null;
}

function runtimeMapLayers(map: EngineState["map"]): MsRuntimeLayer[] {
  return map.layers?.map((layer) => ({ z: layer.z, cells: layer.cells })) ?? [{ z: 1, cells: map.cells }];
}

function cloneRuntimeMapLayers(map: EngineState["map"]): MsRuntimeLayer[] {
  return runtimeMapLayers(map).map((layer) => ({
    z: layer.z,
    cells: cloneBoardCells(layer.cells),
  }));
}

function runtimeCellsForZ(layers: ReadonlyArray<MsRuntimeLayer>, z = 1): EngineMapCell[] {
  return layers.find((layer) => layer.z === z)?.cells ?? layers[0]!.cells;
}

function runtimeCellZ(cells: EngineMapCell[], pos: number): number {
  return cells[pos]?.position.z ?? cells[0]?.position.z ?? 1;
}

function forEachRuntimeLayer(
  layers: ReadonlyArray<MsRuntimeLayer>,
  visit: (cells: EngineMapCell[], z: number) => void,
): void {
  for (const layer of layers) {
    visit(layer.cells, layer.z);
  }
}

function createTrackedBlockState(pos: number, dir: number, z = 1): MsTrackedBlock {
  return {
    pos,
    z,
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
    primedToolDrop: internal.primedToolDrop ? { ...internal.primedToolDrop } : null,
    pendingToolDropAfterSettle: internal.pendingToolDropAfterSettle ? { ...internal.pendingToolDropAfterSettle } : null,
    goalPos: internal.goalPos,
    runtimeLayers: internal.runtimeLayers.map((layer) => ({
      z: layer.z,
      cells: layer.cells,
    })),
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

function updateEngine(
  state: MsGameState,
  cells: EngineMapCell[],
  soundEffects: number,
  advanceTick = true,
  nextMapLayers: ReadonlyArray<MsRuntimeLayer> | null = null,
): MsGameState {
  const mapLayers =
    nextMapLayers?.map((layer) => ({
      z: layer.z,
      cells: layer.cells,
    })) ??
    runtimeMapLayers(state.engine.map).map((layer) => ({
      z: layer.z,
      cells: layer.cells === state.engine.map.cells ? cells : layer.cells,
    }));
  const persistedRuntimeLayers = mapLayers.map((layer) => ({
    z: layer.z,
    cells: layer.cells === cells ? cells : cloneBoardCells(layer.cells),
  }));
  const actors = collectMsActorsFromLayers(mapLayers);
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
        creaturesHash: hashMsCreaturesFromLayers(mapLayers),
        creatureCount: actors.length,
        cells,
        layers: persistedRuntimeLayers,
      },
      view: {
        x: (state.internal.chipPos % MS_GRID_WIDTH) * 8,
        y: Math.floor(state.internal.chipPos / MS_GRID_WIDTH) * 8,
      },
      soundEffects: nextSoundEffects,
      statusFlags,
      lastMove: { ...state.engine.lastMove },
    },
    internal: {
      ...cloneInternalState(state.internal),
      runtimeLayers: persistedRuntimeLayers.map((layer) => ({
        z: layer.z,
        cells: layer.cells,
      })),
    },
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

function clearMsToolInventory(inventory: EngineState["inventory"]): void {
  inventory.tools = [0] as EngineState["inventory"]["tools"];
}

function setMsToolInventoryTile(inventory: EngineState["inventory"], tileId: number): void {
  inventory.tools = [tileId] as EngineState["inventory"]["tools"];
}

function msChipActsWallForMobs(internal: MsInternalState | null, pos: number, z: number): boolean {
  return (
    internal !== null &&
    internal.chipStatus === "okay" &&
    internal.primedToolDrop !== null &&
    internal.chipPos === pos &&
    (internal.chipZ ?? 1) === z
  );
}

function primeMsToolDrop(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  pos: number,
  z: number,
): boolean {
  const tileId = inventory.tools[0] ?? 0;
  if (tileId === 0 || internal.primedToolDrop !== null) {
    return false;
  }

  clearMsToolInventory(inventory);
  internal.primedToolDrop = {
    tileId,
    pos,
    z,
  };
  return true;
}

function queueMsToolInventoryReplacement(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  tileId: number,
  pos: number,
  z: number,
): void {
  const displacedTileId = inventory.tools[0] ?? 0;
  setMsToolInventoryTile(inventory, tileId);
  if (displacedTileId === 0) {
    return;
  }

  const replacementDrop = {
    tileId: displacedTileId,
    pos,
    z,
  };
  if (internal.primedToolDrop !== null) {
    internal.pendingToolDropAfterSettle = replacementDrop;
    return;
  }

  internal.primedToolDrop = replacementDrop;
}

function replaceMsSettledSandbagWater(cells: EngineMapCell[], pos: number): boolean {
  const cell = cells[pos];
  if (!cell || floorAt(cells, pos) !== MS_TILE.Water) {
    return false;
  }

  if (cell.top.id === MS_TILE.Water) {
    replaceTopTile(cells, pos, { ...cell.top, id: MS_TILE.Dirt });
    return true;
  }

  if (cell.bottom.id === MS_TILE.Water) {
    cell.bottom = { ...cell.bottom, id: MS_TILE.Dirt };
    return true;
  }

  return false;
}

function settleMsPrimedToolDrop(cells: EngineMapCell[], internal: MsInternalState, pos: number, z: number): void {
  const primed = internal.primedToolDrop;
  if (!primed || primed.pos !== pos || primed.z !== z) {
    return;
  }

  internal.primedToolDrop = null;
  const pendingReplacement = internal.pendingToolDropAfterSettle;
  internal.pendingToolDropAfterSettle = null;
  if (primed.tileId === MS_TILE.Sandbag && replaceMsSettledSandbagWater(cells, pos)) {
    if (pendingReplacement) {
      internal.primedToolDrop = pendingReplacement;
    }
    return;
  }

  pushTile(cells, pos, { id: primed.tileId, state: 0 });
  if (pendingReplacement) {
    internal.primedToolDrop = pendingReplacement;
  }
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

  if (isAirFloor(floor)) {
    internal.floorMovement = "air";
    internal.floorMovementDir = MS_AIR_MOVEMENT_DIR;
    return;
  }

  if (isElevatorFloor(floor)) {
    internal.floorMovement = "elevator";
    internal.floorMovementDir = MS_ELEVATOR_MOVEMENT_DIR;
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

  if (isAirFloor(enteredFloor)) {
    internal.floorMovement = "air";
    internal.floorMovementDir = MS_AIR_MOVEMENT_DIR;
    return;
  }

  if (isElevatorFloor(enteredFloor)) {
    internal.floorMovement = "elevator";
    internal.floorMovementDir = MS_ELEVATOR_MOVEMENT_DIR;
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
  replay: MsSessionReplayOptions | null = null,
): MsGameState {
  const cells = cloneBoardCells(level.cells);
  initializeBrokenFloors(cells);
  const layers = levelLayers(level);
  const layerCellsByZ = new Map<number, EngineMapCell[]>(
    layers.map((layer) => [layer.z, layer.z === 1 ? cells : layer.cells]),
  );

  let chipPos = 0;
  let chipZ = 1;
  let chipDir: number = MS_DIRECTION.south;
  const creatures: MsTrackedCreature[] = [];
  const blocks: MsTrackedBlock[] = [];
  const seededPositions = new Set<string>();
  const layerPositionKey = (pos: number, z: number) => `${z}:${pos}`;

  for (const { pos, z } of collectLevelCreaturePositions(level)) {
    const layerCells = layerCellsByZ.get(z);
    if (!layerCells || pos < 0 || pos >= layerCells.length) {
      continue;
    }
    const cell = layerCells[pos]!;
    if (cell.top.id === MS_TILE.Block_Static) {
      blocks.push(createTrackedBlockState(pos, MS_DIRECTION.none, z));
      seededPositions.add(layerPositionKey(pos, z));
      continue;
    }
    if (!isMsCreature(cell.top.id)) {
      continue;
    }
    if (msCreatureId(cell.top.id) === MS_TILE.Chip) {
      chipPos = pos;
      chipZ = z;
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
          z,
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
    seededPositions.add(layerPositionKey(pos, z));
  }

  for (const layer of layers) {
    const layerCells = layerCellsByZ.get(layer.z) ?? layer.cells;
    for (const cell of layerCells) {
      if (seededPositions.has(layerPositionKey(cell.position.pos, layer.z))) {
        continue;
      }
      if (isMsCreature(cell.top.id) && msCreatureId(cell.top.id) === MS_TILE.Chip) {
        chipPos = cell.position.pos;
        chipZ = layer.z;
        // Native MS seeds Chip's runtime direction from the lower tile
        // when Chip starts on the top layer.
        chipDir = msCreatureDir(cell.bottom.id);
      }
    }
  }

  const internal: MsInternalState = {
    chipPos,
    chipZ,
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
    traps: collectLevelConnections(level, "traps"),
    cloners: collectLevelConnections(level, "cloners"),
    pendingCloners: [],
    pendingSoundEffects: 0,
    nextCreatureSerial: creatures.length + 1,
    nextSlipOrder: 0,
    randomMainInitial: normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed),
    randomMainValue: normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed),
    lastSlipDir: MS_DIRECTION.none,
    primedToolDrop: null,
    pendingToolDropAfterSettle: null,
    runtimeLayers: [],
  };
  const normalizedRandomSeed = normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed);
  const runtimeLayers = (level.layers ?? [{ z: 1, cells, traps: [], cloners: [], creaturePositions: [], hintText: "" }]).map((layer) => ({
    z: layer.z,
    cells: layer.z === 1 ? cells : cloneBoardCells(layer.cells),
  }));
  internal.runtimeLayers = runtimeLayers.map((layer) => ({
    z: layer.z,
    cells: layer.cells,
  }));

  for (const connection of internal.traps) {
    const z = connection.toZ ?? connection.fromZ ?? 1;
    const layerCells = runtimeCellsForZ(runtimeLayers, z);
    if (
      ((connection.toZ ?? z) === z &&
        (connection.fromZ ?? z) === z &&
        ((connection.to === internal.chipPos && (internal.chipZ ?? 1) === z) ||
          layerCells[connection.to]?.top.id === MS_TILE.Block_Static ||
          isTrapButtonDown(layerCells, connection.from)))
    ) {
      springTrap(layerCells, internal, connection.from, z);
    }
  }

  const engine: EngineState = {
    request: { ...request },
    status: "playing",
    timer: createInitialEngineTimer(level.timeLimitTicks),
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      tools: [0],
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
      layers: runtimeLayers.map((layer) => ({
        z: layer.z,
        cells: layer.cells,
      })),
    },
    view: { x: 0, y: 0 },
    soundEffects: 0,
    statusFlags: level.statusFlags | MS_STATUS_FLAG.NoAnimation,
    lastMove: { code: 0, name: "none" },
  };

  const mapLayers = runtimeMapLayers(engine.map);
  const activeCells = runtimeCellsForZ(mapLayers, chipZ);
  engine.map.cells = activeCells;

  return updateEngine({ engine, internal }, activeCells, 0, false, mapLayers);
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

function canMoveCreature(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  internal: MsInternalState | null = null,
): boolean {
  return canMoveCreatureWithOptions(cells, creature, dir, false, false, internal);
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
  if (msChipActsWallForMobs(internal, to, runtimeCellZ(cells, to))) {
    return false;
  }
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
      const blockingCreature = creatureAtPos(internal, to, creature.z ?? 1);
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
  internal: MsInternalState | null = null,
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
        false,
        internal,
      )
    ) {
      return destination;
    }
  }

  return start;
}

function canMoveBlockInto(
  cells: EngineMapCell[],
  to: number,
  dir: number,
  occupiedOriginPos = -1,
  internal: MsInternalState | null = null,
): boolean {
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
  if (msChipActsWallForMobs(internal, to, runtimeCellZ(cells, to))) {
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

function teleportDestinationForBlock(
  cells: EngineMapCell[],
  start: number,
  dir: number,
  occupiedOriginPos = -1,
  internal: MsInternalState | null = null,
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
    if (destination === occupiedOriginPos) {
      continue;
    }

    const tile = cells[destination]!.top;
    if (tile.id !== MS_TILE.Teleport || (tile.state & MS_FLOOR_STATE.Broken) !== 0) {
      continue;
    }

    const exitStep = advanceToCell(cells, destination, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
    if (exitStep && canMoveBlockInto(cells, exitStep.pos, dir, occupiedOriginPos, internal)) {
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
  const trackedBlock =
    findVisibleTrackedBlock(internal, pos, runtimeCellZ(cells, pos)) ?? upsertTrackedBlock(cells, internal, pos, dir);
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
  if (!canMoveBlockInto(cells, nextPos, dir, occupiedOriginPos, internal)) {
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
    hideTrackedBlockAtPos(internal, pos, dir, trackedBlock.z ?? runtimeCellZ(cells, pos));
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
    hideTrackedBlockAtPos(internal, pos, dir, trackedBlock.z ?? runtimeCellZ(cells, pos));
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
    landingPos = teleportDestinationForBlock(cells, nextPos, dir, pos, internal);
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
  const trackedBlock = findVisibleTrackedBlock(internal, pos, runtimeCellZ(cells, pos));
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

function findClonerTarget(internal: MsInternalState, buttonPos: number, buttonZ = 1): number | null {
  return internal.cloners.find(
    (connection) => connection.from === buttonPos && (connection.fromZ ?? 1) === buttonZ && (connection.toZ ?? 1) === buttonZ,
  )?.to ?? null;
}

function findTrapTarget(internal: MsInternalState, buttonPos: number, buttonZ = 1): number | null {
  return internal.traps.find(
    (connection) => connection.from === buttonPos && (connection.fromZ ?? 1) === buttonZ && (connection.toZ ?? 1) === buttonZ,
  )?.to ?? null;
}

function creatureAtPos(internal: MsInternalState, pos: number, z = 1): MsTrackedCreature | undefined {
  return internal.creatures.find((creature) => !creature.hidden && creature.pos === pos && (creature.z ?? 1) === z);
}

function isTrapButtonDown(cells: EngineMapCell[], pos: number): boolean {
  return pos >= 0 && pos < cells.length && topTileId(cells, pos) !== MS_TILE.Button_Brown;
}

function hasTrapConnection(internal: MsInternalState, pos: number, z = 1): boolean {
  return internal.traps.some((connection) => connection.to === pos && (connection.toZ ?? 1) === z);
}

function isTrapOpen(cells: EngineMapCell[], internal: MsInternalState, trapPos: number, skipButtonPos: number, z = 1): boolean {
  return internal.traps.some(
    (connection) =>
      connection.to === trapPos &&
      connection.from !== skipButtonPos &&
      (connection.fromZ ?? 1) === z &&
      (connection.toZ ?? 1) === z &&
      isTrapButtonDown(cells, connection.from),
  );
}

function springTrap(cells: EngineMapCell[], internal: MsInternalState, buttonPos: number, buttonZ = 1): void {
  const trapPos = findTrapTarget(internal, buttonPos, buttonZ);
  if (trapPos === null || trapPos < 0 || trapPos >= cells.length) {
    return;
  }

  if (trapPos === internal.chipPos && (internal.chipZ ?? 1) === buttonZ) {
    internal.chipReleased = true;
  }

  const trappedBlock = findVisibleTrackedBlock(internal, trapPos, buttonZ);
  if (trappedBlock) {
    trappedBlock.released = true;
  } else if (cells[trapPos]?.top.id === MS_TILE.Block_Static) {
    upsertTrackedBlock(cells, internal, trapPos, MS_DIRECTION.none).released = true;
  }

  const trappedCreature = creatureAtPos(internal, trapPos, buttonZ);
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
  buttonZ = inMidMove?.z ?? internal.chipZ ?? 1,
): number {
  switch (msButtonAction(floor)) {
    case "turn-tanks":
      turnTanks(cells, internal, inMidMove);
      return 1 << MS_SOUND.ButtonPushed;
    case "toggle-walls":
      toggleWalls(internal.runtimeLayers);
      return 0;
    case "activate-cloner":
      activateCloner(cells, internal, buttonPos, buttonZ);
      return 1 << MS_SOUND.ButtonPushed;
    case "spring-trap":
      springTrap(cells, internal, buttonPos, buttonZ);
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
      soundEffects |= resolveButtonFloorEffects(cells, internal, cell.position.pos, floor, null, runtimeCellZ(cells, cell.position.pos));
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

function clearBlockFloorMovement(block: MsTrackedBlock): void {
  block.floorMovement = "none";
  block.floorMovementDir = MS_DIRECTION.none;
  block.sliding = false;
  block.slideDelayPending = false;
  block.slipOrder = -1;
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

function syncMsCreatureAirFloorMovement(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
): void {
  if (creature.hidden || creature.cloning) {
    if (creature.floorMovement === "air") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  const cells = layerCellsByZ.get(creature.z ?? 1);
  if (!cells || !isAirFloor(bottomTileIdOr(cells, creature.pos, MS_TILE.Empty))) {
    if (creature.floorMovement === "air") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  const lowerCells = msLowerRuntimeCells(layerCellsByZ, creature.z);
  if (resolveMsNonChipSupportBelow(engine, lowerCells, creature.pos, creature.z ?? 1, internal)) {
    if (creature.floorMovement === "air") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  creature.floorMovement = "air";
  creature.floorMovementDir = MS_AIR_MOVEMENT_DIR;
  creature.sliding = false;

  const slipIndex = findCreatureSlipIndex(internal, creature.serial);
  if (slipIndex >= 0) {
    internal.creatureSlipList[slipIndex]!.dir = MS_AIR_MOVEMENT_DIR;
    return;
  }

  internal.creatureSlipList.push({
    serial: creature.serial,
    dir: MS_AIR_MOVEMENT_DIR,
    slipOrder: reserveNextSlipOrder(internal),
  });
}

function syncMsCreatureElevatorFloorMovement(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
): void {
  if (creature.hidden || creature.cloning) {
    if (creature.floorMovement === "elevator") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  const cells = layerCellsByZ.get(creature.z ?? 1);
  if (!cells || !isElevatorFloor(bottomTileIdOr(cells, creature.pos, MS_TILE.Empty))) {
    if (creature.floorMovement === "elevator") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  if (!canNonChipUseElevator(msUpperRuntimeCells(layerCellsByZ, creature.z), creature.pos, internal)) {
    clearCreatureFloorMovement(creature, internal);
    addMsTileOverlay(engine, creature.z ?? 1, creature.pos, "elevator-failure");
    return;
  }

  creature.floorMovement = "elevator";
  creature.floorMovementDir = MS_ELEVATOR_MOVEMENT_DIR;
  creature.sliding = false;

  const slipIndex = findCreatureSlipIndex(internal, creature.serial);
  if (slipIndex >= 0) {
    internal.creatureSlipList[slipIndex]!.dir = MS_ELEVATOR_MOVEMENT_DIR;
    return;
  }

  internal.creatureSlipList.push({
    serial: creature.serial,
    dir: MS_ELEVATOR_MOVEMENT_DIR,
    slipOrder: reserveNextSlipOrder(internal),
  });
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

function findVisibleTrackedBlock(internal: MsInternalState, pos: number, z = 1): MsTrackedBlock | undefined {
  return internal.blocks.find((block) => !block.hidden && block.pos === pos && (block.z ?? 1) === z);
}

function hideTrackedBlockAtPos(internal: MsInternalState, pos: number, dir: number, z = 1): MsTrackedBlock {
  const block =
    findVisibleTrackedBlock(internal, pos, z) ??
    internal.blocks.find((entry) => entry.pos === pos && (entry.z ?? 1) === z) ?? {
      pos,
      z,
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
  block.z = z;
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
  const z = runtimeCellZ(cells, pos);
  const existing = findVisibleTrackedBlock(internal, pos, z);
  if (existing) {
    existing.dir = dir;
    return existing;
  }

  const topId = topTileIdOr(cells, pos, MS_TILE.Empty);

  const block: MsTrackedBlock = {
    pos,
    z,
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

function syncMsBlockAirFloorMovement(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  block: MsTrackedBlock,
  internal: MsInternalState,
): void {
  if (block.hidden) {
    if (block.floorMovement === "air") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  const cells = layerCellsByZ.get(block.z ?? 1);
  if (!cells || !isAirFloor(bottomTileIdOr(cells, block.pos, MS_TILE.Empty))) {
    if (block.floorMovement === "air") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  const lowerCells = msLowerRuntimeCells(layerCellsByZ, block.z);
  if (resolveMsNonChipSupportBelow(engine, lowerCells, block.pos, block.z ?? 1, internal)) {
    if (block.floorMovement === "air") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  block.floorMovement = "air";
  block.floorMovementDir = MS_AIR_MOVEMENT_DIR;
  block.sliding = false;
  block.slideDelayPending = false;
  activateBlockSlipOrder(block, internal, false);
}

function syncMsBlockElevatorFloorMovement(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  block: MsTrackedBlock,
  internal: MsInternalState,
): void {
  if (block.hidden) {
    if (block.floorMovement === "elevator") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  const cells = layerCellsByZ.get(block.z ?? 1);
  if (!cells || !isElevatorFloor(bottomTileIdOr(cells, block.pos, MS_TILE.Empty))) {
    if (block.floorMovement === "elevator") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  if (!canNonChipUseElevator(msUpperRuntimeCells(layerCellsByZ, block.z), block.pos, internal)) {
    clearBlockFloorMovement(block);
    addMsTileOverlay(engine, block.z ?? 1, block.pos, "elevator-failure");
    return;
  }

  block.floorMovement = "elevator";
  block.floorMovementDir = MS_ELEVATOR_MOVEMENT_DIR;
  block.sliding = false;
  block.slideDelayPending = false;
  activateBlockSlipOrder(block, internal, false);
}

function refreshBlockFloorMovement(cells: EngineMapCell[], block: MsTrackedBlock, internal: MsInternalState): void {
  if (block.hidden) {
    clearBlockFloorMovement(block);
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

  clearBlockFloorMovement(block);
}

function restartBlockFloorMovementAfterBlockedAttempt(
  cells: EngineMapCell[],
  block: MsTrackedBlock,
  originalDir: number,
  internal: MsInternalState,
): void {
  if (block.hidden) {
    clearBlockFloorMovement(block);
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

  clearBlockFloorMovement(block);
}

function restartBlockFloorMovementAfterRetrySuccess(
  cells: EngineMapCell[],
  block: MsTrackedBlock,
  internal: MsInternalState,
): void {
  if (block.hidden) {
    clearBlockFloorMovement(block);
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

  clearBlockFloorMovement(block);
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

  clearBlockFloorMovement(block);
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
    block.released = isTrapOpen(cells, internal, landingPos, sourcePos, block.z ?? runtimeCellZ(cells, landingPos));
    return;
  }

  if (cells[landingPos]!.bottom.id === MS_TILE.Beartrap) {
    block.released = hasTrapConnection(internal, landingPos, block.z ?? runtimeCellZ(cells, landingPos));
    return;
  }

  block.released = false;
}

function turnTanks(cells: EngineMapCell[], internal: MsInternalState, inMidMove: MsTrackedCreature | null = null): void {
  for (const creature of internal.creatures) {
    if (creature.hidden || creature.id !== MS_TILE.Tank) {
      continue;
    }
    const creatureCells = runtimeCellsForZ(internal.runtimeLayers, creature.z ?? runtimeCellZ(cells, creature.pos));
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
    if (
      isMsCreature(creatureCells[creature.pos]!.top.id) &&
      msCreatureId(creatureCells[creature.pos]!.top.id) === MS_TILE.Tank
    ) {
      updateCreatureTile(creatureCells, creature);
    } else if (creature.moving !== 0) {
      if (creature.turning) {
        creature.turning = false;
        updateCreatureTileWithForce(creatureCells, creature, true);
        creature.turning = true;
      }
      creature.dir = backDirection(creature.dir);
    }
  }
}

function toggleWalls(layers: ReadonlyArray<MsRuntimeLayer>): void {
  forEachRuntimeLayer(layers, (cells) => {
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
  });
}

function activateCloner(cells: EngineMapCell[], internal: MsInternalState, buttonPos: number, buttonZ = runtimeCellZ(cells, buttonPos)): void {
  const sourcePos = findClonerTarget(internal, buttonPos, buttonZ);
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
    z: buttonZ,
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
        const teleportedPos = teleportDestinationForCreature(cells, creature, nextPos, dir, oldPos, internal);
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
    creature.released = isTrapOpen(cells, internal, nextPos, oldPos, creature.z ?? runtimeCellZ(cells, nextPos));
  } else if (cells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    creature.released = hasTrapConnection(internal, nextPos, creature.z ?? runtimeCellZ(cells, nextPos));
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

function moveCreatureDownOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
): number {
  const oldPos = creature.pos;
  const sourceZ = creature.z ?? runtimeCellZ(sourceCells, oldPos);
  const targetZ = Math.max(1, sourceZ - 1);
  let nextPos = oldPos;
  const targetTop = targetCells[nextPos]!.top.id;
  const targetTopState = targetCells[nextPos]!.top.state;
  const targetBottom = targetCells[nextPos]!.bottom.id;
  const targetBottomState = targetCells[nextPos]!.bottom.state;
  const standingFloorWasTop = !isMsCreature(targetTop);
  let soundEffects = 0;

  creature.released = false;
  creature.hasMoved = false;
  pushTile(targetCells, nextPos, { id: MS_TILE.Empty, state: 0 });
  targetCells[nextPos]!.top = {
    id: msCreatureTile(creature.id, creature.dir),
    state: 0,
  };

  creature.pos = nextPos;
  creature.z = targetZ;
  if (creature.turning) {
    updateCreatureTile(targetCells, creature);
  }

  const standingFloor = standingFloorWasTop ? targetTop : targetBottom;
  const standingFloorState = standingFloorWasTop ? targetTopState : targetBottomState;

  switch (standingFloor) {
    case MS_TILE.Water:
      if (creature.id !== MS_TILE.Glider) {
        targetCells[nextPos]!.top = { id: targetTop, state: targetTopState };
        targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
        popTile(sourceCells, oldPos);
        creature.pos = oldPos;
        creature.z = sourceZ;
        creature.hidden = true;
        clearCreatureFloorMovement(creature, internal);
        return soundEffects;
      }
      break;
    case MS_TILE.Fire:
      if (creature.id !== MS_TILE.Fireball) {
        targetCells[nextPos]!.top = { id: targetTop, state: targetTopState };
        targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
        popTile(sourceCells, oldPos);
        creature.pos = oldPos;
        creature.z = sourceZ;
        creature.hidden = true;
        clearCreatureFloorMovement(creature, internal);
        return soundEffects;
      }
      break;
    case MS_TILE.Bomb:
      targetCells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
      targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      popTile(sourceCells, oldPos);
      creature.pos = oldPos;
      creature.z = sourceZ;
      creature.hidden = true;
      clearCreatureFloorMovement(creature, internal);
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      return soundEffects;
    case MS_TILE.Teleport:
      if ((standingFloorState & MS_FLOOR_STATE.Broken) === 0) {
        const teleportedPos = teleportDestinationForCreature(targetCells, creature, nextPos, creature.dir, -1, internal);
        if (teleportedPos !== nextPos) {
          targetCells[nextPos]!.top = { id: targetTop, state: targetTopState };
          targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
          pushTile(targetCells, teleportedPos, { id: MS_TILE.Empty, state: 0 });
          targetCells[teleportedPos]!.top = {
            id: msCreatureTile(creature.id, creature.dir),
            state: 0,
          };
          creature.pos = teleportedPos;
          nextPos = teleportedPos;
          if (creature.turning) {
            updateCreatureTile(targetCells, creature);
          }
        }
      }
      break;
    default:
      break;
  }

  popTile(sourceCells, oldPos);
  const savedPos = creature.pos;
  const savedZ = creature.z;
  creature.pos = oldPos;
  creature.z = sourceZ;
  if (standingFloor === MS_TILE.Button_Red) {
    creature.moving = 1;
  }
  soundEffects |= resolveButtonFloorEffects(targetCells, internal, nextPos, standingFloor, creature);
  creature.moving = 0;
  creature.pos = savedPos;
  creature.z = savedZ;
  if (standingFloor === MS_TILE.Beartrap) {
    creature.released = isTrapOpen(targetCells, internal, nextPos, oldPos, targetZ);
  } else if (targetCells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    creature.released = hasTrapConnection(internal, nextPos, targetZ);
  }
  if (isMsCreature(targetCells[nextPos]!.bottom.id)) {
    const targetId = msCreatureId(targetCells[nextPos]!.bottom.id);
    if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      internal.chipStatus = "collided";
    }
  }
  if (isIceFloor(standingFloor)) {
    clearCreatureFloorMovement(creature, internal);
  } else {
    syncCreatureFloorMovement(targetCells, creature, internal);
    syncMsCreatureAirFloorMovement(engine, layerCellsByZ, creature, internal);
  }
  return soundEffects;
}

function moveCreatureUpOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
): { moved: boolean; soundEffects: number } {
  const oldPos = creature.pos;
  const sourceZ = creature.z ?? runtimeCellZ(sourceCells, oldPos);
  const targetZ = sourceZ + 1;
  const targetTop = targetCells[oldPos]!.top.id;
  const targetTopState = targetCells[oldPos]!.top.state;
  const targetBottom = targetCells[oldPos]!.bottom.id;
  const targetBottomState = targetCells[oldPos]!.bottom.state;
  const targetActorId =
    targetTop === MS_TILE.Block_Static ? MS_TILE.Block : isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  const standingFloor = targetActorId !== MS_TILE.Empty ? targetBottom : targetTop;
  let soundEffects = 0;

  if (!isValidElevatorDestinationFloor(standingFloor)) {
    return { moved: false, soundEffects };
  }
  if (msChipActsWallForMobs(internal, oldPos, targetZ)) {
    return { moved: false, soundEffects };
  }
  if (
    targetActorId !== MS_TILE.Empty &&
    targetActorId !== MS_TILE.Chip &&
    targetActorId !== MS_TILE.Swimming_Chip
  ) {
    return { moved: false, soundEffects };
  }

  creature.released = false;
  creature.hasMoved = false;
  pushTile(targetCells, oldPos, { id: MS_TILE.Empty, state: 0 });
  targetCells[oldPos]!.top = {
    id: msCreatureTile(creature.id, creature.dir),
    state: 0,
  };

  creature.pos = oldPos;
  creature.z = targetZ;
  if (creature.turning) {
    updateCreatureTile(targetCells, creature);
  }

  popTile(sourceCells, oldPos);
  const savedPos = creature.pos;
  const savedZ = creature.z;
  creature.pos = oldPos;
  creature.z = sourceZ;
  if (standingFloor === MS_TILE.Button_Red) {
    creature.moving = 1;
  }
  soundEffects |= resolveButtonFloorEffects(targetCells, internal, oldPos, standingFloor, creature);
  creature.moving = 0;
  creature.pos = savedPos;
  creature.z = savedZ;

  if (targetActorId === MS_TILE.Chip || targetActorId === MS_TILE.Swimming_Chip) {
    internal.chipStatus = "collided";
  }

  syncCreatureFloorMovement(targetCells, creature, internal);
  syncMsCreatureAirFloorMovement(engine, layerCellsByZ, creature, internal);
  syncMsCreatureElevatorFloorMovement(engine, layerCellsByZ, creature, internal);
  return { moved: true, soundEffects };
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
    if (dir !== MS_DIRECTION.none && canMoveCreature(cells, creature, dir, internal)) {
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

function runCreatureFloorMovements(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  currentTime: number,
): number {
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

  const fallbackCells = layerCellsByZ.values().next().value as EngineMapCell[] | undefined;
  const cellsForZ = (z = 1): EngineMapCell[] => layerCellsByZ.get(z) ?? fallbackCells ?? [];

  for (const creature of internal.creatures) {
    syncMsCreatureAirFloorMovement(engine, layerCellsByZ, creature, internal);
    syncMsCreatureElevatorFloorMovement(engine, layerCellsByZ, creature, internal);
  }
  for (const block of internal.blocks) {
    syncMsBlockAirFloorMovement(engine, layerCellsByZ, block, internal);
    syncMsBlockElevatorFloorMovement(engine, layerCellsByZ, block, internal);
  }

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
      const creatureCells = cellsForZ(creature?.z ?? 1);
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

        if (creature.floorMovement === "air") {
          const lowerCells = msLowerRuntimeCells(layerCellsByZ, creature.z);
          if (!lowerCells || resolveMsNonChipSupportBelow(engine, lowerCells, creature.pos, creature.z ?? 1, internal)) {
            clearCreatureFloorMovement(creature, internal);
          } else {
            soundEffects |= moveCreatureDownOneLayer(engine, creatureCells, lowerCells, layerCellsByZ, creature, internal);
            refreshCreatureSlidingFlag(creature);
            moved = true;
          }
        } else if (creature.floorMovement === "elevator") {
          const upperCells = msUpperRuntimeCells(layerCellsByZ, creature.z);
          if (upperCells) {
            const elevated = moveCreatureUpOneLayer(engine, creatureCells, upperCells, layerCellsByZ, creature, internal);
            soundEffects |= elevated.soundEffects;
            if (elevated.moved) {
              refreshCreatureSlidingFlag(creature);
              moved = true;
            }
          }
        } else if (canMoveCreature(creatureCells, creature, originalDir, internal)) {
          soundEffects |= moveCreatureOnce(creatureCells, creature, originalDir, internal);
          refreshCreatureSlidingFlag(creature);
          moved = true;
        } else if (creature.floorMovement === "ice") {
          retriedAfterBlock = true;
          const turnedDir = iceWallTurn(creatureCells[creature.pos]!.bottom.id, backDirection(originalDir));
          if (turnedDir !== MS_DIRECTION.none && canMoveCreature(creatureCells, creature, turnedDir, internal)) {
            soundEffects |= moveCreatureOnce(creatureCells, creature, turnedDir, internal);
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
            syncCreatureFloorMovement(creatureCells, creature, internal);
          }
          if (isQueueEntryActive(active)) {
            traceQueue("requeue-creature-retry", slipIndex, advance, active);
            requeueCurrentEntry(slipIndex);
          } else {
            traceQueue("remove-creature-retry-inactive", slipIndex, advance, active);
            removeQueueEntry(slipIndex);
          }
        }

        if (!moved && creature.floorMovement === "elevator") {
          addMsTileOverlay(engine, creature.z ?? 1, creature.pos, "elevator-failure");
          if (isQueueEntryActive(active)) {
            updateQueueEntry(active);
          } else {
            traceQueue("remove-creature-post-elevator-inactive", slipIndex, advance, active);
            removeQueueEntry(slipIndex);
            continue;
          }
        } else if (!moved) {
          restartCreatureFloorMovementAfterBlockedAttempt(creatureCells, creature, originalDir, internal);
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
      const blockCells = cellsForZ(block?.z ?? 1);
      if (!block) {
        traceQueue("remove-missing-block", slipIndex, advance, active);
        removeQueueEntry(slipIndex);
        continue;
      }

      const tryMove = (dir: number): boolean => {
        const oldWasCloneMachine = blockCells[block.pos]!.bottom.id === MS_TILE.CloneMachine;
        if (!canLeaveFloor(blockCells, block.pos, dir, block.released)) {
          return false;
        }

        const nextPos = nextPosition(block.pos, dir, MS_GRID_WIDTH);
        if (!canMoveBlockInto(blockCells, nextPos, dir, -1, internal)) {
          return false;
        }

        const targetTop = blockCells[nextPos]!.top.id;
        const targetTopState = blockCells[nextPos]!.top.state;
        const targetBottom = blockCells[nextPos]!.bottom.id;
        const targetBottomState = blockCells[nextPos]!.bottom.state;
        if (targetTop === MS_TILE.Water) {
          blockCells[nextPos]!.top = { id: MS_TILE.Dirt, state: 0 };
          if (!oldWasCloneMachine) {
            popTile(blockCells, block.pos);
          } else {
            blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
          }
          hideTrackedBlockAtPos(internal, block.pos, dir, block.z ?? 1);
          soundEffects |= 1 << MS_SOUND.WaterSplash;
          return true;
        }
        if (targetTop === MS_TILE.Bomb) {
          blockCells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
          if (!oldWasCloneMachine) {
            popTile(blockCells, block.pos);
          } else {
            blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
          }
          hideTrackedBlockAtPos(internal, block.pos, dir, block.z ?? 1);
          soundEffects |= 1 << MS_SOUND.BombExplodes;
          return true;
        }

        const movedTile = oldWasCloneMachine ? { ...blockCells[block.pos]!.top } : popTile(blockCells, block.pos);
        let landingPos = nextPos;
        if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
          landingPos = teleportDestinationForBlock(blockCells, nextPos, dir, block.pos, internal);
        }

        placeStaticBlock(blockCells, landingPos, movedTile.state);

        const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
        if (targetCreatureId === MS_TILE.Chip || targetCreatureId === MS_TILE.Swimming_Chip) {
          internal.chipStatus = "collided";
        }
        if (oldWasCloneMachine) {
          blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }

        const successfulFloor = targetCreatureId !== MS_TILE.Empty ? targetBottom : targetTop;
        const successfulFloorState = targetCreatureId !== MS_TILE.Empty ? targetBottomState : targetTopState;

        const sourcePos = block.pos;
        block.pos = landingPos;
        block.dir = dir;
        updateBlockReleaseAfterMove(blockCells, internal, block, sourcePos, targetTop, landingPos);
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
          soundEffects |= resolveButtonFloorEffects(blockCells, internal, landingPos, successfulFloor, null, block.z ?? 1);
        }
        return true;
      };

      const originalDir = block.floorMovementDir;
      let moved = false;
      let retriedAfterBlock = false;

      if (block.floorMovement === "air") {
        const lowerCells = msLowerRuntimeCells(layerCellsByZ, block.z);
        if (!lowerCells || resolveMsNonChipSupportBelow(engine, lowerCells, block.pos, block.z ?? 1, internal)) {
          clearBlockFloorMovement(block);
        } else {
          const sourceZ = block.z ?? runtimeCellZ(blockCells, block.pos);
          const oldPos = block.pos;
          const targetTop = lowerCells[oldPos]!.top.id;
          const targetTopState = lowerCells[oldPos]!.top.state;
          const targetBottom = lowerCells[oldPos]!.bottom.id;
          const targetBottomState = lowerCells[oldPos]!.bottom.state;

          if (targetTop === MS_TILE.Water) {
            lowerCells[oldPos]!.top = { id: MS_TILE.Dirt, state: 0 };
            popTile(blockCells, oldPos);
            hideTrackedBlockAtPos(internal, oldPos, block.dir, sourceZ);
            soundEffects |= 1 << MS_SOUND.WaterSplash;
            moved = true;
          } else if (targetTop === MS_TILE.Bomb) {
            lowerCells[oldPos]!.top = { id: MS_TILE.Empty, state: 0 };
            popTile(blockCells, oldPos);
            hideTrackedBlockAtPos(internal, oldPos, block.dir, sourceZ);
            soundEffects |= 1 << MS_SOUND.BombExplodes;
            moved = true;
          } else {
            const movedTile = popTile(blockCells, oldPos);
            let landingPos = oldPos;
            if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
              landingPos = teleportDestinationForBlock(lowerCells, oldPos, block.dir, -1, internal);
            }

            placeStaticBlock(lowerCells, landingPos, movedTile.state);
            const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
            if (targetCreatureId === MS_TILE.Chip || targetCreatureId === MS_TILE.Swimming_Chip) {
              internal.chipStatus = "collided";
            }

            const successfulFloor = targetCreatureId !== MS_TILE.Empty ? targetBottom : targetTop;
            const successfulFloorState = targetCreatureId !== MS_TILE.Empty ? targetBottomState : targetTopState;
            block.pos = landingPos;
            block.z = Math.max(1, sourceZ - 1);
            updateBlockReleaseAfterMove(lowerCells, internal, block, oldPos, targetTop, landingPos);
            const previousFloorMovement = block.floorMovement;
            const previousSliding = block.sliding;
            if (isIceFloor(successfulFloor)) {
              clearBlockFloorMovement(block);
            } else {
              setBlockFloorMovementAfterSuccessfulMove(
                block,
                successfulFloor,
                successfulFloorState,
                internal,
                previousFloorMovement,
                previousSliding,
              );
              syncMsBlockAirFloorMovement(engine, layerCellsByZ, block, internal);
            }
            if (
              successfulFloor === MS_TILE.Button_Blue ||
              successfulFloor === MS_TILE.Button_Green ||
              successfulFloor === MS_TILE.Button_Red ||
              successfulFloor === MS_TILE.Button_Brown
            ) {
              soundEffects |= resolveButtonFloorEffects(lowerCells, internal, landingPos, successfulFloor, null, block.z ?? 1);
            }
            moved = true;
          }
        }
      } else if (block.floorMovement === "elevator") {
        const upperCells = msUpperRuntimeCells(layerCellsByZ, block.z);
        if (upperCells) {
          const elevated = moveBlockUpOneLayer(engine, blockCells, upperCells, layerCellsByZ, block, internal);
          soundEffects |= elevated.soundEffects;
          moved = elevated.moved;
        }
      } else {
        moved = tryMove(originalDir);
      }

      if (!moved && block.floorMovement === "ice") {
        retriedAfterBlock = true;
        const turnedDir = iceWallTurn(blockCells[block.pos]!.bottom.id, backDirection(originalDir));
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
          restartBlockFloorMovementAfterRetrySuccess(blockCells, block, internal);
        }
        traceQueue("requeue-block-retry", slipIndex, advance, active);
        requeueCurrentEntry(slipIndex);
      }

      if (!moved && block.floorMovement === "elevator" && internal.blocks.includes(block)) {
        addMsTileOverlay(engine, block.z ?? 1, block.pos, "elevator-failure");
        if (!isQueueEntryActive(active)) {
          traceQueue("remove-block-post-elevator-inactive", slipIndex, advance, active);
          removeQueueEntry(slipIndex);
          continue;
        }
      } else if (!moved && internal.blocks.includes(block)) {
        restartBlockFloorMovementAfterBlockedAttempt(blockCells, block, originalDir, internal);
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

function runCreatureMovements(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  currentTime: number,
  stepping: number,
): number {
  if (currentTime <= 0 || (currentTime & 1) !== 0) {
    return 0;
  }

  const fallbackCells = layerCellsByZ.values().next().value as EngineMapCell[] | undefined;
  const cellsForZ = (z = 1): EngineMapCell[] => layerCellsByZ.get(z) ?? fallbackCells ?? [];
  let soundEffects = 0;
  const applyBlockedCreatureAttempt = (creatureCells: EngineMapCell[], creature: MsTrackedCreature, dir: number): void => {
    const floor = floorAt(creatureCells, creature.pos);
    if (dir === MS_DIRECTION.none || floor === MS_TILE.Beartrap || floor === MS_TILE.CloneMachine) {
      return;
    }

    creature.dir = dir;
    updateCreatureTile(creatureCells, creature);
  };

  for (const creature of internal.creatures) {
    if (creature.hidden || creature.cloning) {
      continue;
    }
    const creatureCells = cellsForZ(creature.z ?? 1);
    const dir = chooseCreatureDirection(creatureCells, creature, internal, currentTime, stepping);
    if (dir !== MS_DIRECTION.none) {
      if (canMoveCreature(creatureCells, creature, dir, internal)) {
        soundEffects |= moveCreatureOnce(creatureCells, creature, dir, internal);
      } else {
        applyBlockedCreatureAttempt(creatureCells, creature, dir);
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
): {
  enteredTeleport: boolean;
  soundEffects: number;
  floorTileBeforeMove: EngineMapCell["top"];
  movementFloorTile: EngineMapCell["top"];
} {
  let floorTileBeforeMove = nextCell.top;
  let movementFloorTile = floorTileBeforeMove;
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
        if (slot === "tools") {
          queueMsToolInventoryReplacement(internal, inventory, floor, nextPos, runtimeCellZ(cells, nextPos));
        } else {
          inventory[slot][index] += 1;
        }
        popTile(cells, nextPos);
        if (slot === "tools") {
          movementFloorTile = nextCell.top;
        }
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
      clearMsToolInventory(inventory);
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
    movementFloorTile,
  };
}

function moveChipOnce(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
): number {
  const oldPos = internal.chipPos;
  const oldZ = internal.chipZ ?? runtimeCellZ(cells, oldPos);
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
  let soundEffects = 0;
  internal.chipReleased = false;

  const enteredEffects = applyMsChipEntryEffects(cells, internal, inventory, nextPos, nextCell);
  let floorTileBeforeMove = enteredEffects.floorTileBeforeMove;
  const movementFloorTile = enteredEffects.movementFloorTile;
  let floor = floorTileBeforeMove.id;
  const enteredTeleport = enteredEffects.enteredTeleport;
  soundEffects |= enteredEffects.soundEffects;

  popTile(cells, oldPos);
  settleMsPrimedToolDrop(cells, internal, oldPos, oldZ);

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
    internal.chipReleased = isTrapOpen(cells, internal, nextPos, oldPos, internal.chipZ ?? runtimeCellZ(cells, nextPos));
  } else if (cells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    internal.chipReleased = hasTrapConnection(internal, nextPos, internal.chipZ ?? runtimeCellZ(cells, nextPos));
  }
  if (internal.chipStatus === "okay" && msTileHasTag(cells[nextPos]!.bottom.id, "exit")) {
    internal.completed = true;
  }

  refreshFloorMovementFromEnteredTile(cells, internal, inventory, movementFloorTile.id, movementFloorTile.state);
  soundEffects |= handleDeferredButtons(cells, internal);
  return soundEffects;
}

function moveChipDownOneLayer(
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): number {
  const oldPos = internal.chipPos;
  const oldZ = internal.chipZ ?? runtimeCellZ(sourceCells, oldPos);
  const targetZ = Math.max(1, (internal.chipZ ?? runtimeCellZ(sourceCells, oldPos)) - 1);
  let nextPos = oldPos;
  let nextCell = targetCells[nextPos]!;
  const enteredFloor = nextCell.top.id;
  const enteredFloorState = nextCell.top.state;
  let soundEffects = 0;
  internal.chipReleased = false;

  const enteredEffects = applyMsChipEntryEffects(targetCells, internal, inventory, nextPos, nextCell);
  let floorTileBeforeMove = enteredEffects.floorTileBeforeMove;
  let floor = floorTileBeforeMove.id;
  const enteredTeleport = enteredEffects.enteredTeleport;
  soundEffects |= enteredEffects.soundEffects;

  popTile(sourceCells, oldPos);
  settleMsPrimedToolDrop(sourceCells, internal, oldPos, oldZ);
  internal.chipZ = targetZ;

  if (enteredTeleport) {
    const teleported = teleportDestination(targetCells, internal, inventory, nextPos, internal.chipDir);
    nextPos = teleported.destination;
    soundEffects |= teleported.soundEffects;
    nextCell = targetCells[nextPos]!;
    soundEffects |= 1 << MS_SOUND.Teleporting;
  }

  const landingCell = targetCells[nextPos]!;
  const preserveUnderlyingFloor = landingCell.top.id === MS_TILE.Empty && msPreservesUnderlyingFloor(landingCell.bottom.id);
  if (!preserveUnderlyingFloor) {
    pushTile(targetCells, nextPos, { id: MS_TILE.Empty, state: 0 });
  }
  targetCells[nextPos]!.top = {
    id:
      internal.chipStatus === "drowned"
        ? MS_TILE.Drowned_Chip
        : internal.chipStatus === "burned"
          ? MS_TILE.Burned_Chip
          : internal.chipStatus === "bombed"
            ? MS_TILE.Bombed_Chip
            : msCreatureTile(MS_TILE.Chip, internal.chipDir),
    state: 0,
  };

  internal.chipPos = nextPos;
  if (internal.goalPos === internal.chipPos) {
    internal.goalPos = -1;
  }
  if (internal.chipStatus === "okay") {
    updateChipTile(targetCells, internal);
  }
  soundEffects |= resolveButtonFloorEffects(targetCells, internal, internal.chipPos, floor, null, targetZ);
  if (floor === MS_TILE.Beartrap) {
    internal.chipReleased = isTrapOpen(targetCells, internal, nextPos, oldPos, targetZ);
  } else if (targetCells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    internal.chipReleased = hasTrapConnection(internal, nextPos, targetZ);
  }
  if (internal.chipStatus === "okay" && msTileHasTag(targetCells[nextPos]!.bottom.id, "exit")) {
    internal.completed = true;
  }

  if (isIceFloor(enteredFloor) && inventory.boots[0] === 0) {
    internal.floorMovement = "none";
    internal.floorMovementDir = MS_DIRECTION.none;
  } else {
    refreshFloorMovementFromEnteredTile(targetCells, internal, inventory, enteredFloor, enteredFloorState);
  }
  soundEffects |= handleDeferredButtons(targetCells, internal);
  return soundEffects;
}

function elevatorDestinationFloor(cell: EngineMapCell): number {
  if (cell.top.id === MS_TILE.Block_Static || isMsCreature(cell.top.id)) {
    return cell.bottom.id;
  }
  return cell.top.id;
}

function isValidElevatorDestinationFloor(floor: number): boolean {
  return isAirFloor(floor) || isSlideFloor(floor) || isElevatorFloor(floor) || floor === MS_TILE.Exit;
}

function canChipUseElevator(targetCells: EngineMapCell[] | null, pos: number, dir: number): boolean {
  if (!targetCells) {
    return false;
  }

  const nextCell = targetCells[pos];
  if (!nextCell) {
    return false;
  }

  if (!isValidElevatorDestinationFloor(elevatorDestinationFloor(nextCell))) {
    return false;
  }

  if (nextCell.top.id !== MS_TILE.Block_Static) {
    return true;
  }

  const pushDir = normalizeDirection(dir);
  if (pushDir === MS_DIRECTION.none) {
    return false;
  }

  const x = pos % MS_GRID_WIDTH;
  const y = Math.floor(pos / MS_GRID_WIDTH);
  const nextX = x + (pushDir === MS_DIRECTION.west ? -1 : pushDir === MS_DIRECTION.east ? 1 : 0);
  const nextY = y + (pushDir === MS_DIRECTION.north ? -1 : pushDir === MS_DIRECTION.south ? 1 : 0);
  if (nextX < 0 || nextX >= MS_GRID_WIDTH || nextY < 0 || nextY >= MS_GRID_HEIGHT) {
    return false;
  }

  return canMoveBlockInto(targetCells, nextY * MS_GRID_WIDTH + nextX, pushDir);
}

function canNonChipUseElevator(
  targetCells: EngineMapCell[] | null,
  pos: number,
  internal: MsInternalState | null = null,
): boolean {
  if (!targetCells) {
    return false;
  }

  const nextCell = targetCells[pos];
  if (!nextCell) {
    return false;
  }
  if (msChipActsWallForMobs(internal, pos, runtimeCellZ(targetCells, pos))) {
    return false;
  }

  if (!isValidElevatorDestinationFloor(elevatorDestinationFloor(nextCell))) {
    return false;
  }

  const targetTop = nextCell.top.id;
  const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  return (
    targetTop !== MS_TILE.Block_Static &&
    (targetCreatureId === MS_TILE.Empty || targetCreatureId === MS_TILE.Chip || targetCreatureId === MS_TILE.Swimming_Chip)
  );
}

function moveChipUpOneLayer(
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): number {
  const oldPos = internal.chipPos;
  const oldZ = internal.chipZ ?? runtimeCellZ(sourceCells, oldPos);
  const targetZ = (internal.chipZ ?? runtimeCellZ(sourceCells, oldPos)) + 1;
  let nextPos = oldPos;
  let nextCell = targetCells[nextPos]!;
  let destinationFloor = elevatorDestinationFloor(nextCell);
  if (!isValidElevatorDestinationFloor(destinationFloor)) {
    return 0;
  }

  if (nextCell.top.id === MS_TILE.Block_Static) {
    const pushDir = normalizeDirection(internal.chipDir);
    if (pushDir === MS_DIRECTION.none || !pushBlock(targetCells, internal, nextPos, pushDir, false, true)) {
      return 0;
    }
    nextCell = targetCells[nextPos]!;
    destinationFloor = elevatorDestinationFloor(nextCell);
    if (!isValidElevatorDestinationFloor(destinationFloor)) {
      return 0;
    }
  }

  let soundEffects = 0;
  internal.chipReleased = false;

  const enteredEffects = applyMsChipEntryEffects(targetCells, internal, inventory, nextPos, nextCell);
  const floorTileBeforeMove = enteredEffects.floorTileBeforeMove;
  const movementFloorTile = enteredEffects.movementFloorTile;
  const floor = floorTileBeforeMove.id;
  soundEffects |= enteredEffects.soundEffects;

  popTile(sourceCells, oldPos);
  settleMsPrimedToolDrop(sourceCells, internal, oldPos, oldZ);
  internal.chipZ = targetZ;

  const landingCell = targetCells[nextPos]!;
  const preserveUnderlyingFloor = landingCell.top.id === MS_TILE.Empty && msPreservesUnderlyingFloor(landingCell.bottom.id);
  if (!preserveUnderlyingFloor) {
    pushTile(targetCells, nextPos, { id: MS_TILE.Empty, state: 0 });
  }
  targetCells[nextPos]!.top = {
    id:
      internal.chipStatus === "drowned"
        ? MS_TILE.Drowned_Chip
        : internal.chipStatus === "burned"
          ? MS_TILE.Burned_Chip
          : internal.chipStatus === "bombed"
            ? MS_TILE.Bombed_Chip
            : msCreatureTile(MS_TILE.Chip, internal.chipDir),
    state: 0,
  };

  internal.chipPos = nextPos;
  if (internal.goalPos === internal.chipPos) {
    internal.goalPos = -1;
  }
  if (internal.chipStatus === "okay") {
    updateChipTile(targetCells, internal);
  }
  soundEffects |= resolveButtonFloorEffects(targetCells, internal, internal.chipPos, floor, null, targetZ);
  if (internal.chipStatus === "okay" && msTileHasTag(targetCells[nextPos]!.bottom.id, "exit")) {
    internal.completed = true;
  }

  refreshFloorMovementFromEnteredTile(targetCells, internal, inventory, movementFloorTile.id, movementFloorTile.state);
  soundEffects |= handleDeferredButtons(targetCells, internal);
  return soundEffects;
}

function moveBlockUpOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  block: MsTrackedBlock,
  internal: MsInternalState,
): { moved: boolean; soundEffects: number } {
  const oldPos = block.pos;
  const sourceZ = block.z ?? runtimeCellZ(sourceCells, oldPos);
  const targetZ = sourceZ + 1;
  const targetTop = targetCells[oldPos]!.top.id;
  const targetTopState = targetCells[oldPos]!.top.state;
  const targetBottom = targetCells[oldPos]!.bottom.id;
  const targetBottomState = targetCells[oldPos]!.bottom.state;
  const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  const standingFloor = targetCreatureId !== MS_TILE.Empty ? targetBottom : targetTop;
  let soundEffects = 0;

  if (!isValidElevatorDestinationFloor(standingFloor)) {
    return { moved: false, soundEffects };
  }
  if (msChipActsWallForMobs(internal, oldPos, targetZ)) {
    return { moved: false, soundEffects };
  }
  if (
    targetTop === MS_TILE.Block_Static ||
    (targetCreatureId !== MS_TILE.Empty &&
      targetCreatureId !== MS_TILE.Chip &&
      targetCreatureId !== MS_TILE.Swimming_Chip)
  ) {
    return { moved: false, soundEffects };
  }

  const movedTile = popTile(sourceCells, oldPos);
  placeStaticBlock(targetCells, oldPos, movedTile.state);
  block.pos = oldPos;
  block.z = targetZ;

  if (targetCreatureId === MS_TILE.Chip || targetCreatureId === MS_TILE.Swimming_Chip) {
    internal.chipStatus = "collided";
  }

  const previousFloorMovement = block.floorMovement;
  const previousSliding = block.sliding;
  setBlockFloorMovementAfterSuccessfulMove(
    block,
    standingFloor,
    targetCreatureId !== MS_TILE.Empty ? targetBottomState : targetTopState,
    internal,
    previousFloorMovement,
    previousSliding,
  );
  syncMsBlockAirFloorMovement(engine, layerCellsByZ, block, internal);
  syncMsBlockElevatorFloorMovement(engine, layerCellsByZ, block, internal);
  return { moved: true, soundEffects };
}

function syncMsChipAirFloorMovement(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): void {
  const chipZ = internal.chipZ ?? 1;
  const cells = layerCellsByZ.get(chipZ);
  if (!cells) {
    return;
  }

  if (internal.chipStatus !== "okay" || internal.completed) {
    if (internal.floorMovement === "air") {
      internal.floorMovement = "none";
      internal.floorMovementDir = MS_DIRECTION.none;
    }
    return;
  }

  if (!isAirFloor(bottomTileIdOr(cells, internal.chipPos, MS_TILE.Empty))) {
    if (internal.floorMovement === "air") {
      internal.floorMovement = "none";
      internal.floorMovementDir = MS_DIRECTION.none;
    }
    return;
  }

  const lowerCells = msLowerRuntimeCells(layerCellsByZ, chipZ);
  if (resolveMsChipSupportBelow(engine, lowerCells, internal.chipPos, inventory, chipZ)) {
    internal.floorMovement = "none";
    internal.floorMovementDir = MS_DIRECTION.none;
    return;
  }

  internal.floorMovement = "air";
  internal.floorMovementDir = MS_AIR_MOVEMENT_DIR;
}

function syncMsChipElevatorFloorMovement(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
): void {
  const chipZ = internal.chipZ ?? 1;
  const cells = layerCellsByZ.get(chipZ);
  if (!cells) {
    return;
  }

  if (internal.chipStatus !== "okay" || internal.completed) {
    if (internal.floorMovement === "elevator") {
      internal.floorMovement = "none";
      internal.floorMovementDir = MS_DIRECTION.none;
    }
    return;
  }

  if (!isElevatorFloor(bottomTileIdOr(cells, internal.chipPos, MS_TILE.Empty))) {
    if (internal.floorMovement === "elevator") {
      internal.floorMovement = "none";
      internal.floorMovementDir = MS_DIRECTION.none;
    }
    return;
  }

  if (!canChipUseElevator(msUpperRuntimeCells(layerCellsByZ, chipZ), internal.chipPos, internal.chipDir)) {
    internal.floorMovement = "none";
    internal.floorMovementDir = MS_DIRECTION.none;
    addMsTileOverlay(engine, chipZ, internal.chipPos, "elevator-failure");
    return;
  }

  internal.floorMovement = "elevator";
  internal.floorMovementDir = MS_ELEVATOR_MOVEMENT_DIR;
}

function runFloorMovement(
  engine: EngineState,
  cells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): number {
  if (
    internal.floorMovement === "none" ||
    (internal.floorMovement !== "air" && internal.floorMovement !== "elevator" && internal.floorMovementDir === MS_DIRECTION.none) ||
    internal.chipStatus !== "okay"
  ) {
    return 0;
  }

  internal.chipWait = 0;
  internal.lastSlipDir = internal.floorMovementDir;
  let soundEffects = 0;
  if (internal.floorMovement === "air") {
    const lowerCells = msLowerRuntimeCells(layerCellsByZ, internal.chipZ);
    if (!lowerCells || resolveMsChipSupportBelow(engine, lowerCells, internal.chipPos, inventory, internal.chipZ ?? 1)) {
      internal.floorMovement = "none";
      internal.floorMovementDir = MS_DIRECTION.none;
      return 0;
    }
    soundEffects |= moveChipDownOneLayer(cells, lowerCells, internal, inventory);
    internal.chipHasMoved = false;
    return soundEffects;
  }
  if (internal.floorMovement === "elevator") {
    const upperCells = msUpperRuntimeCells(layerCellsByZ, internal.chipZ);
    if (!upperCells) {
      addMsTileOverlay(engine, internal.chipZ ?? 1, internal.chipPos, "elevator-failure");
      return 0;
    }
    const previousZ = internal.chipZ ?? runtimeCellZ(cells, internal.chipPos);
    soundEffects |= moveChipUpOneLayer(cells, upperCells, internal, inventory);
    if ((internal.chipZ ?? previousZ) === previousZ) {
      addMsTileOverlay(engine, previousZ, internal.chipPos, "elevator-failure");
    }
    internal.chipHasMoved = false;
    return soundEffects;
  }
  const pushedBlockPickupRevealTileId = findPushedMsBlockPickupRevealTileId(cells, internal.chipPos, internal.floorMovementDir);
  if (canMoveChip(cells, internal, inventory, internal.floorMovementDir)) {
    soundEffects |= moveChipWithPushPickupReveal(
      engine,
      cells,
      internal,
      inventory,
      internal.floorMovementDir,
      pushedBlockPickupRevealTileId,
    );
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
): {
  consumedInputCode: number;
  dir: number;
} {
  internal.chipTDir = MS_DIRECTION.none;
  if ((currentTime & 3) === 0) {
    internal.chipHasMoved = false;
  }
  if (internal.chipHasMoved) {
    if (internal.currentInput !== MS_DIRECTION.none && internal.goalPos >= 0) {
      internal.goalPos = -1;
    }
    return {
      consumedInputCode: GAME_INPUT_CODES.none,
      dir: MS_DIRECTION.none,
    };
  }
  const inputCode = internal.currentInput;
  const { baseCode: decodedInputCode } = decodeRuntimeInputCode(inputCode);
  internal.currentInput = MS_DIRECTION.none;
  if (
    internal.floorMovement === "ice" ||
    internal.floorMovement === "air" ||
    internal.floorMovement === "elevator" ||
    internal.floorMovement === "teleport" ||
    (internal.floorMovement === "slide" && decodedInputCode === internal.chipDir)
  ) {
    if (currentTime > 0 && (currentTime & 1) === 0) {
      internal.goalPos = -1;
    }
    return {
      consumedInputCode: GAME_INPUT_CODES.none,
      dir: MS_DIRECTION.none,
    };
  }
  if (decodedInputCode === MS_DIRECTION.none) {
    let dir: number = MS_DIRECTION.none;
    if (internal.goalPos >= 0 && (currentTime & 3) === 2) {
      dir = chipMoveToGoalPos(cells, internal, inventory);
    }
    internal.chipTDir = dir;
    return {
      consumedInputCode: GAME_INPUT_CODES.none,
      dir,
    };
  }

  let dir = normalizeDirection(decodedInputCode);
  if (isAbsoluteMouseCommand(decodedInputCode)) {
    internal.goalPos = decodedInputCode - CMD_ABS_MOUSE_MOVE_FIRST;
    dir = (currentTime & 3) === 2 ? chipMoveToGoalPos(cells, internal, inventory) : MS_DIRECTION.none;
  } else if (isRelativeMouseCommand(decodedInputCode)) {
    internal.goalPos = makeMouseAbsolute(decodedInputCode - CMD_MOUSE_MOVE_FIRST, internal.chipPos);
    dir = (currentTime & 3) === 2 ? chipMoveToGoalPos(cells, internal, inventory) : MS_DIRECTION.none;
  }

  internal.chipTDir = dir;
  return {
    consumedInputCode: inputCode,
    dir,
  };
}

function moveChipWithPushPickupReveal(
  engine: EngineState,
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
  pushedBlockPickupRevealTileId: number | null,
): number {
  const soundEffects = moveChipOnce(cells, internal, inventory, dir);
  if (
    pushedBlockPickupRevealTileId !== null &&
    (soundEffects & ((1 << MS_SOUND.IcCollected) | (1 << MS_SOUND.ItemCollected))) !== 0
  ) {
    addMsTileOverlay(
      engine,
      internal.chipZ ?? 1,
      internal.chipPos,
      "push-pickup-reveal",
      PUSH_BLOCK_PICKUP_REVEAL_TTL,
      pushedBlockPickupRevealTileId,
    );
  }
  return soundEffects;
}

function runManualMovement(
  engine: EngineState,
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
): number {
  if (dir === MS_DIRECTION.none) {
    return 0;
  }

  internal.chipWait = 0;
  const pressedPermanentHiddenWallPos = findPressedMsPermanentHiddenWallPos(cells, internal.chipPos, dir);
  const pushedBlockPickupRevealTileId = findPushedMsBlockPickupRevealTileId(cells, internal.chipPos, dir);
  if (!canMoveChip(cells, internal, inventory, dir)) {
    if (pressedPermanentHiddenWallPos !== null) {
      addMsTileOverlay(engine, internal.chipZ ?? 1, pressedPermanentHiddenWallPos, "hidden-wall-reveal", HIDDEN_WALL_REVEAL_TTL);
    }
    resetButtons(cells);
    internal.chipDir = dir;
    internal.chipHasMoved = internal.chipStatus === "okay";
    internal.goalPos = -1;
    updateChipTile(cells, internal);
    return 1 << MS_SOUND.CantMove;
  }

  const soundEffects = moveChipWithPushPickupReveal(
    engine,
    cells,
    internal,
    inventory,
    dir,
    pushedBlockPickupRevealTileId,
  );
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
  toolActionTriggered: boolean,
): EngineState["lastMove"] {
  const previous = state.engine.lastMove;
  const { baseCode, modifierMask } = decodeRuntimeInputCode(inputCode);

  if (state.engine.replay.cursor < 0) {
    return { code: MS_DIRECTION.none, name: "none" };
  }

  const chipHasMoved = (currentTime & 3) === 0 ? false : chipHasMovedBeforeChoose;
  const discardFloorMovement = floorMovementBeforeChoose;
  const discardChipDir = chipDirBeforeChoose;

  if (chipHasMoved && !toolActionTriggered) {
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
    discardFloorMovement === "air" ||
    discardFloorMovement === "elevator" ||
    discardFloorMovement === "teleport" ||
    (discardFloorMovement === "slide" && baseCode === discardChipDir);
  if (discard && !toolActionTriggered) {
    return previous;
  }

  if (isAbsoluteMouseCommand(baseCode)) {
    const goalPos = baseCode - CMD_ABS_MOUSE_MOVE_FIRST;
    const move = createRuntimeCommand(
      encodeRuntimeInputCode(CMD_MOUSE_MOVE_FIRST + makeMouseRelative(goalPos, internal.chipPos), modifierMask),
      state.engine.timer.currentTime + 1,
    );
    return {
      code: move.inputCode,
      name: move.inputName,
    };
  }

  if (isRelativeMouseCommand(baseCode)) {
    const move = createRuntimeCommand(encodeRuntimeInputCode(baseCode, modifierMask), state.engine.timer.currentTime + 1);
    return {
      code: move.inputCode,
      name: move.inputName,
    };
  }

  const dir = normalizeDirection(baseCode);
  const runtimeMove = createRuntimeCommand(dir, state.engine.timer.currentTime + 1);
  return {
    code: encodeRuntimeInputCode(runtimeMove.inputCode, modifierMask),
    name: runtimeCommandName(encodeRuntimeInputCode(runtimeMove.inputCode, modifierMask)),
  };
}

function resolveRecordedReplayMoveAfterChoose(
  state: MsGameState,
  internal: MsInternalState,
  currentTime: number,
  inputCode: number,
  chipHasMovedBeforeChoose: boolean,
  goalPosBeforeChoose: number,
  floorMovementBeforeChoose: MsInternalState["floorMovement"],
  chipDirBeforeChoose: number,
  toolActionTriggered: boolean,
): RecordedReplayMoveDecision | null {
  const { baseCode, modifierMask } = decodeRuntimeInputCode(inputCode);
  if (state.engine.replay.cursor >= 0 || (baseCode === MS_DIRECTION.none && (!toolActionTriggered || modifierMask === 0))) {
    return null;
  }

  const chipHasMoved = (currentTime & 3) === 0 ? false : chipHasMovedBeforeChoose;
  if (chipHasMoved && !toolActionTriggered) {
    return goalPosBeforeChoose >= 0
      ? {
          when: currentTime,
          dir: CMD_MOVE_NOP,
          modifierMask,
        }
      : null;
  }

  const discard =
    floorMovementBeforeChoose === "ice" ||
    floorMovementBeforeChoose === "air" ||
    floorMovementBeforeChoose === "elevator" ||
    floorMovementBeforeChoose === "teleport" ||
    (floorMovementBeforeChoose === "slide" && baseCode === chipDirBeforeChoose);
  if (discard && !toolActionTriggered) {
    return null;
  }

  if (isAbsoluteMouseCommand(baseCode)) {
    const goalPos = baseCode - CMD_ABS_MOUSE_MOVE_FIRST;
    return {
      when: currentTime,
      dir: CMD_MOUSE_MOVE_FIRST + makeMouseRelative(goalPos, internal.chipPos),
      modifierMask,
    };
  }

  if (isRelativeMouseCommand(baseCode)) {
    return {
      when: currentTime,
      dir: baseCode,
      modifierMask,
    };
  }

  return {
    when: currentTime,
    dir: normalizeDirection(baseCode),
    modifierMask,
  };
}

function replayBestTimeTicks(replay: ReplaySolutionPayload): number | undefined {
  const replayWithBestTime = replay as ReplaySolutionPayload & {
    bestTimeTicks?: number;
  };
  return typeof replayWithBestTime.bestTimeTicks === "number" ? replayWithBestTime.bestTimeTicks : undefined;
}

function isMouseGoalInputCode(inputCode: number): boolean {
  const normalized = stripRuntimeInputModifiers(inputCode);
  return normalized === CMD_MOVE_NOP || isAbsoluteMouseCommand(normalized) || isRelativeMouseCommand(normalized);
}

function latchCurrentInput(state: MsGameState, internal: MsInternalState, input: GameRuntimeCommand): void {
  if (state.engine.replay.cursor >= 0) {
    if (input.inputCode !== MS_DIRECTION.none) {
      internal.currentInput = input.inputCode;
    }
    return;
  }

  const { baseCode, modifierMask } = decodeRuntimeInputCode(input.inputCode);
  internal.currentInput = isMouseGoalInputCode(input.inputCode)
    ? input.inputCode
    : encodeRuntimeInputCode(normalizeDirection(baseCode), modifierMask);
}

// MS runs Chip floor movement on even ticks before normal input handling.
function advanceMsTick(
  state: MsGameState,
  input: GameRuntimeCommand,
  debugPhases: GameDebugPhaseSnapshot[] | null = null,
): MsAdvanceTickResult {
  const mapLayers = cloneRuntimeMapLayers(state.engine.map);
  const layerCellsByZ = new Map<number, EngineMapCell[]>(mapLayers.map((layer) => [layer.z, layer.cells]));
  const cellsForZ = (z = 1): EngineMapCell[] => layerCellsByZ.get(z) ?? mapLayers[0]!.cells;
  const cells = cellsForZ(state.internal.chipZ ?? 1);
  const activeChipCells = (): EngineMapCell[] => cellsForZ(internal.chipZ ?? 1);
  const internal = cloneInternalState(state.internal);
  const inputLatchInternal = cloneInternalState(state.internal);
  internal.runtimeLayers = mapLayers.map((layer) => ({
    z: layer.z,
    cells: layer.cells,
  }));
  inputLatchInternal.runtimeLayers = internal.runtimeLayers;
  const inventory = cloneInventory(state.engine.inventory);
  const nextTick = state.engine.timer.currentTime + 1;
  let timeOffset = -1;
  let soundEffects = 0;
  let recordedReplayMove: RecordedReplayMoveDecision | null = null;
  let toolActionTriggeredThisTick = false;
  clearMsTileOverlays(state.engine);
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
  ): MsAdvanceTickResult => {
    const activeCells = cellsForZ(internal.chipZ ?? 1);
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
      activeCells,
      soundEffects,
      true,
      mapLayers,
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
    return {
      state: nextState,
      recordedReplayMove,
    };
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
    const phaseCells = activeChipCells();
    recordTurnDebugPhase(debugPhases, phase, (recordedPhase) =>
      projectMsDebugPhaseSnapshot(
        state,
        phaseCells,
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
    const phaseCells = cellsForZ(snapshotInternal.chipZ ?? 1);
    recordTurnDebugPhase(debugPhases, phase, (recordedPhase) =>
      projectMsDebugPhaseSnapshot(
        state,
        phaseCells,
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

  const maybeFinishEarly = (
    lastMove: EngineState["lastMove"] = state.engine.lastMove,
  ): MsAdvanceTickResult | null => {
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
          updateCreatureTile(cellsForZ(creature.z ?? 1), creature);
        }
      }
      internal.chipWait += 1;
      if (internal.chipWait > 3) {
        internal.chipWait = 3;
        if (internal.chipDir !== MS_DIRECTION.none) {
          internal.chipDir = MS_DIRECTION.south;
          updateChipTile(activeChipCells(), internal);
        }
      }
    }

    latchCurrentInput(state, internal, input);
    const { modifierMask } = decodeRuntimeInputCode(internal.currentInput);
    if (
      isPlayablePhase() &&
      (modifierMask & GAME_INPUT_MODIFIER_MASKS.action1) !== 0 &&
      primeMsToolDrop(internal, inventory, internal.chipPos, internal.chipZ ?? 1)
    ) {
      toolActionTriggeredThisTick = true;
    }
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
    soundEffects |= runCreatureMovements(state.engine, layerCellsByZ, internal, nextTick, state.engine.replay.stepping);
    if (nextTick > 0 && (nextTick & 1) === 0) {
      recordPhase(TURN_DEBUG_PHASE.postCreatureMovement);
    }
  };

  const runChipFloorPhase = (): {
    chipFloorMovementModeBeforeFloor: MsInternalState["floorMovement"];
    chipFloorMovementModeAfterFloor: MsInternalState["floorMovement"];
    chipFloorMovementWasActive: boolean;
  } => {
    if (isPlayablePhase()) {
      syncMsChipAirFloorMovement(state.engine, layerCellsByZ, internal, inventory);
      syncMsChipElevatorFloorMovement(state.engine, layerCellsByZ, internal);
    }

    const chipFloorMovementModeBeforeFloor = internal.floorMovement;
    const chipFloorMovementDirBeforeFloor = internal.floorMovementDir;
    const chipFloorMovementWasActive =
      isPlayablePhase() &&
      nextTick > 0 &&
      (nextTick & 1) === 0 &&
      internal.floorMovement !== "none" &&
      internal.floorMovementDir !== MS_DIRECTION.none;

    if (nextTick > 0 && (nextTick & 1) === 0) {
      soundEffects |= runFloorMovement(state.engine, activeChipCells(), layerCellsByZ, internal, inventory);
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
    soundEffects |= runCreatureFloorMovements(state.engine, layerCellsByZ, internal, nextTick);
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
    const manualChoice: ReturnType<typeof chooseManualMovement> = isPlayablePhase()
      ? chooseManualMovement(activeChipCells(), internal, inventory, nextTick)
      : {
          consumedInputCode: GAME_INPUT_CODES.none,
          dir: MS_DIRECTION.none,
        };
    const recordedInputCode =
      toolActionTriggeredThisTick && manualChoice.consumedInputCode === GAME_INPUT_CODES.none
        ? replayLastMoveInputCode
        : manualChoice.consumedInputCode;
    recordedReplayMove = resolveRecordedReplayMoveAfterChoose(
      state,
      internal,
      nextTick,
      recordedInputCode,
      replayLastMoveChipHasMoved,
      replayLastMoveGoalPos,
      replayLastMoveFloorMovement,
      replayLastMoveChipDir,
      toolActionTriggeredThisTick,
    );
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
      toolActionTriggeredThisTick,
    );

    return {
      chipPosBeforeManualMovement,
      manualDir: manualChoice.dir,
      nextLastMove,
    };
  };

  const runTimerPhase = (nextLastMove: EngineState["lastMove"]): MsAdvanceTickResult | null => {
    if (!isPlayablePhase()) {
      return null;
    }
    timeOffset = 0;
    if (state.engine.timer.timeLimit > 0 && nextTick >= state.engine.timer.timeLimit) {
      internal.chipStatus = "outoftime";
      soundEffects |= 1 << MS_SOUND.TimeOut;
      return {
        state: updateEngine(
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
          activeChipCells(),
          soundEffects,
        ),
        recordedReplayMove,
      };
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
  ): MsAdvanceTickResult | null => {
    recordPhaseWithInternal(TURN_DEBUG_PHASE.postChipInput, cloneInternalState(internal), nextLastMove);
    if (isPlayablePhase()) {
      soundEffects |= runManualMovement(state.engine, activeChipCells(), internal, inventory, manualDir);
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

  const runCloneReleasePhase = (nextLastMove: EngineState["lastMove"]): MsAdvanceTickResult => {
    forEachRuntimeLayer(mapLayers, (layerCells) => {
      soundEffects |= handleDeferredButtons(layerCells, internal);
    });
    resolvePendingCloners(cells, internal);
    createClones(internal);
    flushPendingSoundEffects();
    recordPhase(TURN_DEBUG_PHASE.postCloneRelease, nextLastMove);
    return finishTick(nextLastMove);
  };

  let replayLastMoveInputCode = 0;
  let nextLastMove = state.engine.lastMove;
  let chipFloorMovementModeBeforeFloor = internal.floorMovement;
  let chipFloorMovementModeAfterFloor = internal.floorMovement;
  let chipFloorMovementWasActive = false;
  let chipPosBeforeManualMovement = internal.chipPos;
  let manualDir: number = MS_DIRECTION.none;
  const earlyResult = runTurnPhaseHandlers<MsAdvanceTickResult>([
    {
      name: TURN_PHASE.initialHousekeeping,
      run: () => {
        replayLastMoveInputCode = runInitialHousekeepingPhase();
        return null;
      },
    },
    {
      name: TURN_PHASE.creatureMovement,
      run: () => {
        runCreatureMovementPhase();
        nextLastMove = state.engine.lastMove;
        return maybeFinishEarly(nextLastMove);
      },
    },
    {
      name: TURN_PHASE.chipFloorMovement,
      run: () => {
        ({
          chipFloorMovementModeBeforeFloor,
          chipFloorMovementModeAfterFloor,
          chipFloorMovementWasActive,
        } = runChipFloorPhase());
        nextLastMove = state.engine.lastMove;
        return maybeFinishEarly(nextLastMove);
      },
    },
    {
      name: TURN_PHASE.creatureFloorMovement,
      run: () => {
        runCreatureFloorPhase();
        nextLastMove = state.engine.lastMove;
        return maybeFinishEarly(nextLastMove);
      },
    },
    {
      name: TURN_PHASE.chipInputResolution,
      run: () => {
        ({ chipPosBeforeManualMovement, manualDir, nextLastMove } = resolveChipInputPhase(replayLastMoveInputCode));
        return null;
      },
    },
    {
      name: TURN_PHASE.timer,
      run: () => runTimerPhase(nextLastMove),
    },
    {
      name: TURN_PHASE.manualMovement,
      run: () =>
        runManualMovementPhase(
          nextLastMove,
          manualDir,
          chipPosBeforeManualMovement,
          chipFloorMovementWasActive,
          chipFloorMovementModeBeforeFloor,
          chipFloorMovementModeAfterFloor,
        ),
    },
    {
      name: TURN_PHASE.cloneRelease,
      run: () => runCloneReleasePhase(nextLastMove),
    },
  ]);
  return earlyResult ?? runCloneReleasePhase(nextLastMove);
}

export function runMsInputTrace(request: GameRequest, level: MsLevel, commands: GameCommand[], maxTicks: number): GameTrace {
  let state = initializeMsGameState(request, level);
  const initialState = engineStateToSnapshot(state.engine, "initial", createRuntimeCommand(0, -1));
  const steps = [];
  let previousInput = createRuntimeCommand(0, -1);

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const input = resolveManualInput(previousInput, scheduledInputForTick(commands, tick));
    previousInput = input;
    state = advanceMsTick(state, input).state;
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
    state = advanceMsTick(state, input, phases).state;
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
    ).state;
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
    ).state;
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

export function createMsInteractiveSession(
  request: GameRequest,
  level: MsLevel,
  options: MsSessionReplayOptions | null = null,
): MsInteractiveSessionState {
  return {
    state: initializeMsGameState(request, level, options),
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
    recordedMoves: replay.moves.map((move, index) => ({
      ...move,
      modifierMask: replay.modifierMasks?.[index] ?? 0,
    })),
    replayPlan: createReplayPlan(replay),
  };
}

export function advanceMsInteractiveSession(
  session: MsInteractiveSessionState,
  inputCode: number,
): MsInteractiveSessionState {
  const tick = session.state.engine.timer.currentTime + 1;
  const scheduledInput = createRuntimeCommand(inputCode, tick);
  const { baseCode: scheduledBaseCode } = decodeRuntimeInputCode(scheduledInput.inputCode);
  let input =
    scheduledBaseCode === GAME_INPUT_CODES.preserve
      ? createRuntimeCommand(session.state.internal.currentInput, tick)
      : scheduledInput;
  let replayPlan = session.replayPlan;
  if (replayPlan) {
    const replayTick = plannedReplayInput(replayPlan, tick);
    replayPlan = replayTick.plan;
    input = replayTick.input;
  }
  const advanceResult = advanceMsTick(
    replayPlan
      ? {
          engine: {
            ...session.state.engine,
            replay: {
              ...session.state.engine.replay,
              cursor: replayPlan.cursor,
            },
          },
          internal: session.state.internal,
        }
      : session.state,
    input,
  );
  const nextState = advanceResult.state;

  return {
    state: nextState,
    lastInput: input,
    recordedMoves: appendRecordedReplayMove(
      session.recordedMoves,
      nextState.engine.replay.cursor,
      advanceResult.recordedReplayMove,
    ),
    replayPlan,
  };
}
