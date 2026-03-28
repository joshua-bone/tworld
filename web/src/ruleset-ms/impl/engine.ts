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
  createArrayTurnDebugPhaseRecorder,
  TURN_DEBUG_PHASE,
  TURN_PHASE,
  recordTurnDebugPhase,
  runTurnPhaseHandlers,
  type TurnDebugPhaseRecorder,
  type TurnDebugPhaseName,
} from "@game-core/api/turnPhases";
import {
  blockedMovement,
  movedMovement,
  movementDidSucceed,
  type MovementAttemptResult,
} from "@game-core/api/movementOutcomes";
import { hasVerticalSupport } from "@game-core/api/verticalMovement";
import { advanceTimer, createInitialEngineTimer } from "@game-core/impl/timer";
import { mapHash } from "@game-core/impl/hash";
import { actorCollectionAllowsSlot, actorCollectsChips, actorThiefStealsBootsAndTools } from "@game-core/api/actorCapabilities";
import {
  actorInventoryClearBoots,
  actorInventoryCollectIndexedItem,
  actorInventoryHasBoot,
  actorInventoryHasKey,
  actorInventoryUseKey,
  createNoActorLocalInventoryOwner,
  createKeysBootsToolsActorLocalInventoryOwner,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import {
  appendRecordedReplayMove,
  createReplayPlan,
  createRuntimeCommand,
  plannedReplayInput,
  type RecordedReplayMoveDecision,
  resolveManualInput,
  scheduledInputForTick,
} from "@game-core/api/playback";
import {
  decodeRuntimeInputCode,
  GAME_INPUT_CODES,
  GAME_INPUT_MODIFIER_MASKS,
} from "@game-core/api/command";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { createGameDebugTrace, createGameTrace } from "@game-core/impl/trace";
import { collectMsActorsFromLayers, hashMsCreaturesFromLayers, projectMsDebugPhaseSnapshot } from "@ruleset-ms/impl/debugProjection";
import type { GameCommand, GameRequest, GameRuntimeCommand, GameTrace } from "@game-core/api/types";
import {
  chooseMsManualMovement,
  latchCurrentMsInput,
  replayBestTimeTicks,
  resolveMsRecordedReplayMoveAfterChoose,
  resolveMsReplayLastMoveAfterChoose,
} from "@ruleset-ms/impl/chipInput";
import {
  collectLevelConnections,
  collectLevelCreaturePositions,
  levelLayers,
  type MsConnection,
  type MsLevel,
} from "@ruleset-ms/api/level";
import {
  msActorEntryMask,
  msActorGlobalProgressKind,
  msActorHazardResponse,
  msActorItemCollectionKind,
  msActorLocalInventoryMode,
  msActorThiefHook,
  msActorArrivalAction,
  msBlockMovementMask,
  msButtonAction,
  msChipMovementMask,
  msChipEnterAction,
  msDoorKeyIndex,
  msExitMovementMask,
  msIceWallTurn,
  msInventoryIndex,
  msInventorySlot,
  msIsActorTile,
  msIsOverlayFloorTile,
  msPreservesUnderlyingFloor,
  msRequiresReleaseToExit,
  msSlideDirection,
  msTileHasTag,
  msTileForcedFloorKind,
} from "@ruleset-ms/impl/catalog";
import {
  clearMsToolInventory,
  collectMsPortableItemsFromLayers,
  primeMsToolDrop,
  primedMsPortableToolItem,
  projectMsPortableToolState,
  queueMsToolInventoryReplacement,
  reconcileMsPortableToolProjection,
  settleMsPrimedToolDrop,
  type MsPortableItem,
  type MsPortableToolStateStore,
} from "@ruleset-ms/impl/portableItems";
import { MsNonChipFloorQueue, type MsActiveNonChipFloorEntry } from "@ruleset-ms/impl/nonChipFloorQueue";
import {
  canChipUseMsElevator,
  canNonChipUseMsElevator,
  resolveMsChipSupportBelow,
  resolveMsNonChipSupportBelow,
  syncMsChipAirFloorMovement,
  syncMsChipElevatorFloorMovement,
} from "@ruleset-ms/impl/verticalMovement";
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
type MsChipLocalInventoryProjection = Pick<EngineState["inventory"], "keys" | "boots" | "tools">;

function msChipInventoryOwner(inventory: MsChipLocalInventoryProjection): ActorLocalInventoryOwner {
  return msActorLocalInventoryMode(MS_TILE.Chip) === "keys-boots-tools"
    ? createKeysBootsToolsActorLocalInventoryOwner("chip", inventory as ActorKeysBootsToolsInventory)
    : createNoActorLocalInventoryOwner("chip");
}

function applyMsActorThiefHook(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  actorId: number,
  inventoryOwner: ActorLocalInventoryOwner,
): boolean {
  if (!actorThiefStealsBootsAndTools(msActorThiefHook(actorId))) {
    return false;
  }
  actorInventoryClearBoots(inventoryOwner);
  clearMsToolInventory(internal, inventory);
  return true;
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
  portableItems: MsPortableItem[];
  nextPortableItemSerial: number;
  primedToolDrop: MsPortableToolStateStore["primedToolDrop"];
  pendingToolDropAfterSettle: MsPortableToolStateStore["pendingToolDropAfterSettle"];
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

interface MsTickContext {
  engine: EngineState;
  internal: MsInternalState;
  inventory: EngineState["inventory"];
  cellsForZ(z?: number): EngineMapCell[] | null;
  lowerCells(z?: number): EngineMapCell[] | null;
  upperCells(z?: number): EngineMapCell[] | null;
  chipActsWallForMobs(pos: number, z: number): boolean;
  addTileOverlay(
    z: number,
    pos: number,
    kind: InteractiveGameTileOverlayKind,
    ttl?: number,
    tileId?: number,
  ): void;
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

function canLeaveFloor(cells: EngineMapCell[], pos: number, dir: number, released: boolean): boolean {
  const floor = cells[pos] ? bottomTileId(cells, pos) : MS_TILE.Empty;
  if ((msExitMovementMask(floor) & dir) === 0) {
    return false;
  }
  return !msRequiresReleaseToExit(floor) || released;
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

function createMsTickContext(
  engine: EngineState,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
): MsTickContext {
  return {
    engine,
    internal,
    inventory,
    cellsForZ: (z = 1) => layerCellsByZ.get(z) ?? null,
    lowerCells: (z) => msLowerRuntimeCells(layerCellsByZ, z),
    upperCells: (z) => msUpperRuntimeCells(layerCellsByZ, z),
    chipActsWallForMobs: (pos, z) => msChipActsWallForMobs(internal, pos, z),
    addTileOverlay: (z, pos, kind, ttl = 2, tileId) => addMsTileOverlay(engine, z, pos, kind, ttl, tileId),
  };
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
    portableItems: internal.portableItems.map((item) => ({
      ...item,
      state: { ...item.state },
    })),
    nextPortableItemSerial: internal.nextPortableItemSerial,
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

function msChipActsWallForMobs(internal: MsInternalState | null, pos: number, z: number): boolean {
  return (
    internal !== null &&
    internal.chipStatus === "okay" &&
    primedMsPortableToolItem(internal) !== undefined &&
    internal.chipPos === pos &&
    (internal.chipZ ?? 1) === z
  );
}

function refreshFloorMovement(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): void {
  const chipInventory = msChipInventoryOwner(inventory);
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

  if (isIceFloor(floor) && !actorInventoryHasBoot(chipInventory, 0)) {
    internal.floorMovement = "ice";
    internal.floorMovementDir = iceWallTurn(floor, internal.chipDir);
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    return;
  }

  if (isSlideFloor(floor) && !actorInventoryHasBoot(chipInventory, 1)) {
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
  const chipInventory = msChipInventoryOwner(inventory);
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

  if (isIceFloor(enteredFloor) && !actorInventoryHasBoot(chipInventory, 0)) {
    internal.floorMovement = "ice";
    internal.floorMovementDir = iceWallTurn(enteredFloor, internal.chipDir);
    internal.chipDir = internal.floorMovementDir;
    updateChipTile(cells, internal);
    return;
  }

  if (isSlideFloor(enteredFloor) && !actorInventoryHasBoot(chipInventory, 1)) {
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
    portableItems: [],
    nextPortableItemSerial: 1,
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
  internal.portableItems = collectMsPortableItemsFromLayers(runtimeLayers);
  internal.nextPortableItemSerial = internal.portableItems.length + 1;

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
  projectMsPortableToolState(internal, engine.inventory);

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
  const chipInventory = msChipInventoryOwner(inventory);
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
    if (doorKeyIndex === null || !actorInventoryHasKey(chipInventory, doorKeyIndex)) {
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
  if ((msActorEntryMask(floor, creature.id) & dir) === 0) {
    return false;
  }
  if (!ignoreFireCheck && floor === MS_TILE.Fire && msActorHazardResponse(creature.id, "fire") === "deny") {
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
): MovementAttemptResult {
  const trackedBlock =
    findVisibleTrackedBlock(internal, pos, runtimeCellZ(cells, pos)) ?? upsertTrackedBlock(cells, internal, pos, dir);
  const oldWasCloneMachine = cells[pos]!.bottom.id === MS_TILE.CloneMachine;
  const keepSourceTile = preserveSourceTile || oldWasCloneMachine;
  if (!canLeaveFloor(cells, pos, dir, trackedBlock.released)) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return blockedMovement();
  }
  const x = pos % MS_GRID_WIDTH;
  const y = Math.floor(pos / MS_GRID_WIDTH);
  const nextX = x + (dir === MS_DIRECTION.west ? -1 : dir === MS_DIRECTION.east ? 1 : 0);
  const nextY = y + (dir === MS_DIRECTION.north ? -1 : dir === MS_DIRECTION.south ? 1 : 0);
  if (nextX < 0 || nextX >= MS_GRID_WIDTH || nextY < 0 || nextY >= MS_GRID_HEIGHT) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return blockedMovement();
  }

  const nextPos = nextY * MS_GRID_WIDTH + nextX;
  if (!canMoveBlockInto(cells, nextPos, dir, occupiedOriginPos, internal)) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return blockedMovement();
  }

  const targetTop = cells[nextPos]!.top.id;
  const targetTopState = cells[nextPos]!.top.state;
  const targetBottom = cells[nextPos]!.bottom.id;
  const targetBottomState = cells[nextPos]!.bottom.state;
  switch (msActorArrivalAction(targetTop, MS_TILE.Block)) {
    case "block-water":
      cells[nextPos]!.top.id = MS_TILE.Dirt;
      cells[nextPos]!.top.state = 0;
      if (!keepSourceTile) {
        popTile(cells, pos);
      } else if (oldWasCloneMachine) {
        cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
      }
      hideTrackedBlockAtPos(internal, pos, dir, trackedBlock.z ?? runtimeCellZ(cells, pos));
      internal.pendingSoundEffects |= 1 << MS_SOUND.WaterSplash;
      return movedMovement();
    case "block-bomb":
      cells[nextPos]!.top.id = MS_TILE.Empty;
      cells[nextPos]!.top.state = 0;
      if (!keepSourceTile) {
        popTile(cells, pos);
      } else if (oldWasCloneMachine) {
        cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
      }
      hideTrackedBlockAtPos(internal, pos, dir, trackedBlock.z ?? runtimeCellZ(cells, pos));
      internal.pendingSoundEffects |= 1 << MS_SOUND.BombExplodes;
      return movedMovement();
    default:
      break;
  }

  if (targetBottom === MS_TILE.CloneMachine) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return blockedMovement();
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

  return movedMovement();
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
  const moveResult = moveBlock(cells, internal, pos, dir, deferButtons, false, occupiedOriginPos);
  if (!movementDidSucceed(moveResult) && trackedBlock && !trackedBlock.hidden && !teleportPush) {
    const standingFloor = bottomTileIdOr(cells, pos, MS_TILE.Empty);
    if (standingFloor !== MS_TILE.Beartrap && standingFloor !== MS_TILE.CloneMachine && trackedBlock.floorMovement === "none") {
      trackedBlock.dir = dir;
    }
  }
  return movementDidSucceed(moveResult);
}

function advanceCloneMachineBlock(cells: EngineMapCell[], internal: MsInternalState, pos: number, dir: number): boolean {
  return movementDidSucceed(moveBlock(cells, internal, pos, dir, false, true));
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

function floorHasMsButtonAction(floor: number): boolean {
  return msButtonAction(floor) !== "none";
}

function resolveDeferredOrImmediateButtonLandingEffects(
  cells: EngineMapCell[],
  internal: MsInternalState,
  pos: number,
  floor: number,
  deferButtons: boolean,
  actor: MsTrackedCreature | null = null,
  buttonZ = actor?.z ?? internal.chipZ ?? 1,
): number {
  if (!floorHasMsButtonAction(floor)) {
    return 0;
  }

  if (deferButtons) {
    addBottomTileFlags(cells, pos, MS_FLOOR_STATE.ButtonDown);
    return msButtonAction(floor) === "toggle-walls" ? 0 : 1 << MS_SOUND.ButtonPushed;
  }

  return resolveButtonFloorEffects(cells, internal, pos, floor, actor, buttonZ);
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

function syncMsCreatureAirFloorMovement(context: MsTickContext, creature: MsTrackedCreature): void {
  const { internal } = context;
  if (creature.hidden || creature.cloning) {
    if (creature.floorMovement === "air") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  const cells = context.cellsForZ(creature.z);
  if (!cells || !isAirFloor(bottomTileIdOr(cells, creature.pos, MS_TILE.Empty))) {
    if (creature.floorMovement === "air") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  const lowerCells = context.lowerCells(creature.z);
  if (
    hasVerticalSupport(
      resolveMsNonChipSupportBelow(
        context,
        lowerCells,
        creature.pos,
        creature.z ?? 1,
        lowerCells ? runtimeCellZ(lowerCells, creature.pos) : 1,
      ),
    )
  ) {
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

function syncMsCreatureElevatorFloorMovement(context: MsTickContext, creature: MsTrackedCreature): void {
  const { internal } = context;
  if (creature.hidden || creature.cloning) {
    if (creature.floorMovement === "elevator") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  const cells = context.cellsForZ(creature.z);
  if (!cells || !isElevatorFloor(bottomTileIdOr(cells, creature.pos, MS_TILE.Empty))) {
    if (creature.floorMovement === "elevator") {
      clearCreatureFloorMovement(creature, internal);
    }
    return;
  }

  if (
    !canNonChipUseMsElevator(
      context.upperCells(creature.z),
      creature.pos,
      (pos, z) => msChipActsWallForMobs(internal, pos, z),
      context.upperCells(creature.z) ? runtimeCellZ(context.upperCells(creature.z)!, creature.pos) : (creature.z ?? 1) + 1,
    )
  ) {
    clearCreatureFloorMovement(creature, internal);
    context.addTileOverlay(creature.z ?? 1, creature.pos, "elevator-failure");
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

function syncMsBlockAirFloorMovement(context: MsTickContext, block: MsTrackedBlock): void {
  const { internal } = context;
  if (block.hidden) {
    if (block.floorMovement === "air") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  const cells = context.cellsForZ(block.z);
  if (!cells || !isAirFloor(bottomTileIdOr(cells, block.pos, MS_TILE.Empty))) {
    if (block.floorMovement === "air") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  const lowerCells = context.lowerCells(block.z);
  if (
    hasVerticalSupport(
      resolveMsNonChipSupportBelow(
        context,
        lowerCells,
        block.pos,
        block.z ?? 1,
        lowerCells ? runtimeCellZ(lowerCells, block.pos) : 1,
      ),
    )
  ) {
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

function syncMsBlockElevatorFloorMovement(context: MsTickContext, block: MsTrackedBlock): void {
  const { internal } = context;
  if (block.hidden) {
    if (block.floorMovement === "elevator") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  const cells = context.cellsForZ(block.z);
  if (!cells || !isElevatorFloor(bottomTileIdOr(cells, block.pos, MS_TILE.Empty))) {
    if (block.floorMovement === "elevator") {
      clearBlockFloorMovement(block);
    }
    return;
  }

  if (
    !canNonChipUseMsElevator(
      context.upperCells(block.z),
      block.pos,
      (pos, z) => msChipActsWallForMobs(internal, pos, z),
      context.upperCells(block.z) ? runtimeCellZ(context.upperCells(block.z)!, block.pos) : (block.z ?? 1) + 1,
    )
  ) {
    clearBlockFloorMovement(block);
    context.addTileOverlay(block.z ?? 1, block.pos, "elevator-failure");
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
): MovementAttemptResult {
  const oldPos = creature.pos;
  // Native MS derives water/fire immunity from the creature tile currently on the board,
  // not strictly from the tracked creature record. Preserve that mismatch behavior here.
  const arrivalActorId = msCreatureId(cells[oldPos]!.top.id);
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

  switch (msActorArrivalAction(standingFloor, arrivalActorId)) {
    case "creature-water":
    case "creature-fire":
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
      return movedMovement(soundEffects);
    case "creature-bomb":
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
      return movedMovement(soundEffects);
    default:
      break;
  }

  switch (standingFloor) {
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
  return movedMovement(soundEffects);
}

function moveCreatureDownOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
): MovementAttemptResult {
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

  switch (msActorArrivalAction(standingFloor, creature.id)) {
    case "creature-water":
    case "creature-fire":
      targetCells[nextPos]!.top = { id: targetTop, state: targetTopState };
      targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      popTile(sourceCells, oldPos);
      creature.pos = oldPos;
      creature.z = sourceZ;
      creature.hidden = true;
      clearCreatureFloorMovement(creature, internal);
      return movedMovement(soundEffects);
    case "creature-bomb":
      targetCells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
      targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      popTile(sourceCells, oldPos);
      creature.pos = oldPos;
      creature.z = sourceZ;
      creature.hidden = true;
      clearCreatureFloorMovement(creature, internal);
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      return movedMovement(soundEffects);
    default:
      break;
  }

  switch (standingFloor) {
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
    syncMsCreatureAirFloorMovement(createMsTickContext(engine, internal, engine.inventory, layerCellsByZ), creature);
  }
  return movedMovement(soundEffects);
}

function moveCreatureUpOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
): MovementAttemptResult {
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
    return blockedMovement(soundEffects);
  }
  if (msChipActsWallForMobs(internal, oldPos, targetZ)) {
    return blockedMovement(soundEffects);
  }
  if (
    targetActorId !== MS_TILE.Empty &&
    targetActorId !== MS_TILE.Chip &&
    targetActorId !== MS_TILE.Swimming_Chip
  ) {
    return blockedMovement(soundEffects);
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
  const tickContext = createMsTickContext(engine, internal, engine.inventory, layerCellsByZ);
  syncMsCreatureAirFloorMovement(tickContext, creature);
  syncMsCreatureElevatorFloorMovement(tickContext, creature);
  return movedMovement(soundEffects);
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

function syncMsNonChipVerticalFloorMovements(tickContext: MsTickContext, internal: MsInternalState): void {
  for (const creature of internal.creatures) {
    syncMsCreatureAirFloorMovement(tickContext, creature);
    syncMsCreatureElevatorFloorMovement(tickContext, creature);
  }
  for (const block of internal.blocks) {
    syncMsBlockAirFloorMovement(tickContext, block);
    syncMsBlockElevatorFloorMovement(tickContext, block);
  }
}

function processMsCreatureFloorQueueEntry(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  cellsForZ: (z?: number) => EngineMapCell[],
  tickContext: MsTickContext,
  queue: MsNonChipFloorQueue,
  slipIndex: number,
  advance: number,
  active: Extract<MsActiveNonChipFloorEntry, { kind: "creature" }>,
): number {
  const creature = creatureForSerial(internal, active.serial);
  const creatureCells = cellsForZ(creature?.z ?? 1);
  if (
    !creature ||
    creature.hidden ||
    creature.cloning ||
    creature.floorMovement === "none" ||
    creature.floorMovementDir === MS_DIRECTION.none
  ) {
    queue.removeEntry(slipIndex);
    return 0;
  }

  let soundEffects = 0;
  creature.frame = creature.dir;
  try {
    const originalDir = active.dir;
    let moved = false;
    let retriedAfterBlock = false;

    if (creature.floorMovement === "air") {
      const lowerCells = msLowerRuntimeCells(layerCellsByZ, creature.z);
      if (
        !lowerCells ||
        hasVerticalSupport(
          resolveMsNonChipSupportBelow(
            tickContext,
            lowerCells,
            creature.pos,
            creature.z ?? 1,
            runtimeCellZ(lowerCells, creature.pos),
          ),
        )
      ) {
        clearCreatureFloorMovement(creature, internal);
      } else {
        soundEffects |= moveCreatureDownOneLayer(engine, creatureCells, lowerCells, layerCellsByZ, creature, internal).soundEffects;
        refreshCreatureSlidingFlag(creature);
        moved = true;
      }
    } else if (creature.floorMovement === "elevator") {
      const upperCells = msUpperRuntimeCells(layerCellsByZ, creature.z);
      if (upperCells) {
        const elevated = moveCreatureUpOneLayer(engine, creatureCells, upperCells, layerCellsByZ, creature, internal);
        soundEffects |= elevated.soundEffects;
        if (movementDidSucceed(elevated)) {
          refreshCreatureSlidingFlag(creature);
          moved = true;
        }
      }
    } else if (canMoveCreature(creatureCells, creature, originalDir, internal)) {
      soundEffects |= moveCreatureOnce(creatureCells, creature, originalDir, internal).soundEffects;
      refreshCreatureSlidingFlag(creature);
      moved = true;
    } else if (creature.floorMovement === "ice") {
      retriedAfterBlock = true;
      const turnedDir = iceWallTurn(creatureCells[creature.pos]!.bottom.id, backDirection(originalDir));
      if (turnedDir !== MS_DIRECTION.none && canMoveCreature(creatureCells, creature, turnedDir, internal)) {
        soundEffects |= moveCreatureOnce(creatureCells, creature, turnedDir, internal).soundEffects;
        refreshCreatureSlidingFlag(creature);
        moved = true;
      } else {
        creature.floorMovementDir = originalDir;
        const creatureSlipIndex = findCreatureSlipIndex(internal, creature.serial);
        if (creatureSlipIndex >= 0) {
          internal.creatureSlipList[creatureSlipIndex]!.dir = originalDir;
        }
      }
    }

    if (retriedAfterBlock && findCreatureSlipIndex(internal, creature.serial) >= 0) {
      if (moved) {
        syncCreatureFloorMovement(creatureCells, creature, internal);
      }
      if (queue.isEntryActive(active)) {
        queue.trace("requeue-creature-retry", slipIndex, advance, active);
        queue.requeueEntry(slipIndex);
      } else {
        queue.trace("remove-creature-retry-inactive", slipIndex, advance, active);
        queue.removeEntry(slipIndex);
      }
    }

    if (!moved && creature.floorMovement === "elevator") {
      addMsTileOverlay(engine, creature.z ?? 1, creature.pos, "elevator-failure");
      if (queue.isEntryActive(active)) {
        queue.updateEntry(active);
      } else {
        queue.trace("remove-creature-post-elevator-inactive", slipIndex, advance, active);
        queue.removeEntry(slipIndex);
      }
      return soundEffects;
    }

    if (!moved) {
      restartCreatureFloorMovementAfterBlockedAttempt(creatureCells, creature, originalDir, internal);
      if (!queue.isEntryActive(active)) {
        queue.trace("remove-creature-post-restart-inactive", slipIndex, advance, active);
        queue.removeEntry(slipIndex);
        return soundEffects;
      }

      queue.updateEntry(active);
      if (!retriedAfterBlock && findCreatureSlipIndex(internal, creature.serial) >= 0 && creature.floorMovementDir !== MS_DIRECTION.none) {
        queue.trace("requeue-creature-blocked", slipIndex, advance, active);
        queue.requeueEntry(slipIndex);
      }
      return soundEffects;
    }

    if (queue.isEntryActive(active)) {
      queue.updateEntry(active);
    } else {
      queue.trace("remove-creature-post-move-inactive", slipIndex, advance, active);
      queue.removeEntry(slipIndex);
    }

    return soundEffects;
  } finally {
    creature.frame = 0;
  }
}

function processMsBlockFloorQueueEntry(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  cellsForZ: (z?: number) => EngineMapCell[],
  queue: MsNonChipFloorQueue,
  slipIndex: number,
  advance: number,
  active: Extract<MsActiveNonChipFloorEntry, { kind: "block" }>,
): number {
  const block = internal.blocks[active.blockIndex];
  const blockCells = cellsForZ(block?.z ?? 1);
  if (!block) {
    queue.trace("remove-missing-block", slipIndex, advance, active);
    queue.removeEntry(slipIndex);
    return 0;
  }

  let soundEffects = 0;
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
    switch (msActorArrivalAction(targetTop, MS_TILE.Block)) {
      case "block-water":
        blockCells[nextPos]!.top = { id: MS_TILE.Dirt, state: 0 };
        if (!oldWasCloneMachine) {
          popTile(blockCells, block.pos);
        } else {
          blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }
        hideTrackedBlockAtPos(internal, block.pos, dir, block.z ?? 1);
        soundEffects |= 1 << MS_SOUND.WaterSplash;
        return true;
      case "block-bomb":
        blockCells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
        if (!oldWasCloneMachine) {
          popTile(blockCells, block.pos);
        } else {
          blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }
        hideTrackedBlockAtPos(internal, block.pos, dir, block.z ?? 1);
        soundEffects |= 1 << MS_SOUND.BombExplodes;
        return true;
      default:
        break;
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
    soundEffects |= resolveDeferredOrImmediateButtonLandingEffects(
      blockCells,
      internal,
      landingPos,
      successfulFloor,
      false,
      null,
      block.z ?? 1,
    );
    return true;
  };

  const originalDir = block.floorMovementDir;
  let moved = false;
  let retriedAfterBlock = false;

  if (block.floorMovement === "air") {
    const lowerCells = msLowerRuntimeCells(layerCellsByZ, block.z);
    if (
      !lowerCells ||
      hasVerticalSupport(
        resolveMsNonChipSupportBelow(
          createMsTickContext(engine, internal, engine.inventory, layerCellsByZ),
          lowerCells,
          block.pos,
          block.z ?? 1,
          runtimeCellZ(lowerCells, block.pos),
        ),
      )
    ) {
      clearBlockFloorMovement(block);
    } else {
      const sourceZ = block.z ?? runtimeCellZ(blockCells, block.pos);
      const oldPos = block.pos;
      const targetTop = lowerCells[oldPos]!.top.id;
      const targetTopState = lowerCells[oldPos]!.top.state;
      const targetBottom = lowerCells[oldPos]!.bottom.id;
      const targetBottomState = lowerCells[oldPos]!.bottom.state;

      switch (msActorArrivalAction(targetTop, MS_TILE.Block)) {
        case "block-water":
          lowerCells[oldPos]!.top = { id: MS_TILE.Dirt, state: 0 };
          popTile(blockCells, oldPos);
          hideTrackedBlockAtPos(internal, oldPos, block.dir, sourceZ);
          soundEffects |= 1 << MS_SOUND.WaterSplash;
          moved = true;
          break;
        case "block-bomb":
          lowerCells[oldPos]!.top = { id: MS_TILE.Empty, state: 0 };
          popTile(blockCells, oldPos);
          hideTrackedBlockAtPos(internal, oldPos, block.dir, sourceZ);
          soundEffects |= 1 << MS_SOUND.BombExplodes;
          moved = true;
          break;
        default: {
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
            syncMsBlockAirFloorMovement(createMsTickContext(engine, internal, engine.inventory, layerCellsByZ), block);
          }
          soundEffects |= resolveDeferredOrImmediateButtonLandingEffects(
            lowerCells,
            internal,
            landingPos,
            successfulFloor,
            false,
            null,
            block.z ?? 1,
          );
          moved = true;
          break;
        }
      }
    }
  } else if (block.floorMovement === "elevator") {
    const upperCells = msUpperRuntimeCells(layerCellsByZ, block.z);
    if (upperCells) {
      const elevated = moveBlockUpOneLayer(engine, blockCells, upperCells, layerCellsByZ, block, internal);
      soundEffects |= elevated.soundEffects;
      moved = movementDidSucceed(elevated);
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

  if (retriedAfterBlock && !block.hidden && block.floorMovement !== "none" && block.floorMovementDir !== MS_DIRECTION.none) {
    if (moved) {
      restartBlockFloorMovementAfterRetrySuccess(blockCells, block, internal);
    }
    queue.trace("requeue-block-retry", slipIndex, advance, active);
    queue.requeueEntry(slipIndex);
  }

  if (!moved && block.floorMovement === "elevator" && internal.blocks.includes(block)) {
    addMsTileOverlay(engine, block.z ?? 1, block.pos, "elevator-failure");
    if (!queue.isEntryActive(active)) {
      queue.trace("remove-block-post-elevator-inactive", slipIndex, advance, active);
      queue.removeEntry(slipIndex);
    }
    return soundEffects;
  }

  if (!moved && internal.blocks.includes(block)) {
    restartBlockFloorMovementAfterBlockedAttempt(blockCells, block, originalDir, internal);
    if (!queue.isEntryActive(active)) {
      queue.trace("remove-block-post-restart-inactive", slipIndex, advance, active);
      queue.removeEntry(slipIndex);
      return soundEffects;
    }

    if (!retriedAfterBlock && !block.hidden && block.floorMovement !== "none" && block.floorMovementDir !== MS_DIRECTION.none) {
      queue.trace("requeue-block-blocked", slipIndex, advance, active);
      queue.requeueEntry(slipIndex);
    }
    return soundEffects;
  }

  if (!queue.isEntryActive(active)) {
    queue.trace("remove-block-post-move-inactive", slipIndex, advance, active);
    queue.removeEntry(slipIndex);
  }

  return soundEffects;
}

function runCreatureFloorMovements(
  engine: EngineState,
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  currentTime: number,
): number {
  const fallbackCells = layerCellsByZ.values().next().value as EngineMapCell[] | undefined;
  const cellsForZ = (z = 1): EngineMapCell[] => layerCellsByZ.get(z) ?? fallbackCells ?? [];
  const tickContext = createMsTickContext(engine, internal, engine.inventory, layerCellsByZ);
  syncMsNonChipVerticalFloorMovements(tickContext, internal);

  const queue = new MsNonChipFloorQueue({
    state: internal,
    findCreature: (serial) => creatureForSerial(internal, serial),
    reserveNextSlipOrder: () => reserveNextSlipOrder(internal),
    trace: (event) =>
      msQueueTraceHook?.({
        tick: currentTime,
        phase: "non-chip-floor",
        ...event,
      }),
  });

  internal.blocks.forEach((block, blockIndex) => {
    if (!block.hidden && block.floorMovement === "slide" && block.floorMovementDir !== MS_DIRECTION.none && block.slideDelayPending) {
      block.slideDelayPending = false;
    }
  });

  let soundEffects = 0;
  let advance = 0;
  queue.trace("start", 0, advance);
  for (let slipIndex = 0; slipIndex < queue.entries.length; ) {
    const previousSlipCount = queue.entries.length;
    const active = queue.entries[slipIndex];
    if (!active) {
      break;
    }

    if (advance > 0) {
      queue.trace("skip-advance", slipIndex, advance, active);
      advance -= 1;
      slipIndex += 1;
      continue;
    }

    if (!queue.isEntryActive(active)) {
      queue.trace("remove-inactive", slipIndex, advance, active);
      queue.removeEntry(slipIndex);
      continue;
    }

    queue.trace("process", slipIndex, advance, active);

    if (active.kind === "creature") {
      soundEffects |= processMsCreatureFloorQueueEntry(
        engine,
        layerCellsByZ,
        internal,
        cellsForZ,
        tickContext,
        queue,
        slipIndex,
        advance,
        active,
      );
    } else {
      soundEffects |= processMsBlockFloorQueueEntry(engine, layerCellsByZ, internal, cellsForZ, queue, slipIndex, advance, active);
    }

    queue.appendNewActiveEntries();
    const nextSlipCount = queue.entries.length;
    if (nextSlipCount === previousSlipCount) {
      advance += 1;
    }
  }

  queue.syncBackToState();
  queue.trace("end", queue.entries.length, advance);
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
        soundEffects |= moveCreatureOnce(creatureCells, creature, dir, internal).soundEffects;
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
  const chipInventory = msChipInventoryOwner(inventory);
  const chipItemCollectionKind = msActorItemCollectionKind(MS_TILE.Chip);
  const chipGlobalProgressKind = msActorGlobalProgressKind(MS_TILE.Chip);
  let enteredTeleport = false;
  let soundEffects = 0;

  switch (msChipEnterAction(floor)) {
    case "clear-floor":
      popTile(cells, nextPos);
      break;
    case "collect-chip":
      if (actorCollectsChips(chipGlobalProgressKind)) {
        inventory.chipsNeeded = Math.max(0, inventory.chipsNeeded - 1);
      }
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
      if (index !== null) {
        actorInventoryUseKey(chipInventory, index, { consume: floor !== MS_TILE.Door_Green });
      }
      popTile(cells, nextPos);
      soundEffects |= 1 << MS_SOUND.DoorOpened;
      break;
    }
    case "collect-item": {
      const slot = msInventorySlot(floor);
      const index = msInventoryIndex(floor);
      if (slot !== null && index !== null && actorCollectionAllowsSlot(chipItemCollectionKind, slot)) {
        if (slot === "tools") {
          queueMsToolInventoryReplacement(internal, inventory, floor, nextPos, runtimeCellZ(cells, nextPos));
        } else {
          actorInventoryCollectIndexedItem(chipInventory, slot, index);
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
      if (applyMsActorThiefHook(internal, inventory, MS_TILE.Chip, chipInventory)) {
        soundEffects |= 1 << MS_SOUND.BootsStolen;
      }
      break;
    case "explode-bomb":
      internal.chipStatus = "bombed";
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      break;
    case "water-death":
      if (!actorInventoryHasBoot(chipInventory, 3)) {
        internal.chipStatus = "drowned";
      }
      break;
    case "fire-death":
      if (!actorInventoryHasBoot(chipInventory, 2)) {
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
): MovementAttemptResult {
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
  settleMsPrimedToolDrop(cells, internal, inventory, oldPos, oldZ);

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
  return movedMovement(soundEffects);
}

function moveChipDownOneLayer(
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): MovementAttemptResult {
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
  settleMsPrimedToolDrop(sourceCells, internal, inventory, oldPos, oldZ);
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

  if (isIceFloor(enteredFloor) && !actorInventoryHasBoot(msChipInventoryOwner(inventory), 0)) {
    internal.floorMovement = "none";
    internal.floorMovementDir = MS_DIRECTION.none;
  } else {
    refreshFloorMovementFromEnteredTile(targetCells, internal, inventory, enteredFloor, enteredFloorState);
  }
  soundEffects |= handleDeferredButtons(targetCells, internal);
  return movedMovement(soundEffects);
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

function moveChipUpOneLayer(
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): MovementAttemptResult {
  const oldPos = internal.chipPos;
  const oldZ = internal.chipZ ?? runtimeCellZ(sourceCells, oldPos);
  const targetZ = (internal.chipZ ?? runtimeCellZ(sourceCells, oldPos)) + 1;
  let nextPos = oldPos;
  let nextCell = targetCells[nextPos]!;
  let destinationFloor = elevatorDestinationFloor(nextCell);
  if (!isValidElevatorDestinationFloor(destinationFloor)) {
    return blockedMovement();
  }

  if (nextCell.top.id === MS_TILE.Block_Static) {
    const pushDir = normalizeDirection(internal.chipDir);
    if (pushDir === MS_DIRECTION.none || !pushBlock(targetCells, internal, nextPos, pushDir, false, true)) {
      return blockedMovement();
    }
    nextCell = targetCells[nextPos]!;
    destinationFloor = elevatorDestinationFloor(nextCell);
    if (!isValidElevatorDestinationFloor(destinationFloor)) {
      return blockedMovement();
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
  settleMsPrimedToolDrop(sourceCells, internal, inventory, oldPos, oldZ);
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
  return movedMovement(soundEffects);
}

function moveBlockUpOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  block: MsTrackedBlock,
  internal: MsInternalState,
): MovementAttemptResult {
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
    return blockedMovement(soundEffects);
  }
  if (msChipActsWallForMobs(internal, oldPos, targetZ)) {
    return blockedMovement(soundEffects);
  }
  if (
    targetTop === MS_TILE.Block_Static ||
    (targetCreatureId !== MS_TILE.Empty &&
      targetCreatureId !== MS_TILE.Chip &&
      targetCreatureId !== MS_TILE.Swimming_Chip)
  ) {
    return blockedMovement(soundEffects);
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
  const tickContext = createMsTickContext(engine, internal, engine.inventory, layerCellsByZ);
  syncMsBlockAirFloorMovement(tickContext, block);
  syncMsBlockElevatorFloorMovement(tickContext, block);
  return movedMovement(soundEffects);
}

function runFloorMovement(context: MsTickContext, cells: EngineMapCell[]): number {
  const { internal } = context;
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
    const lowerCells = context.lowerCells(internal.chipZ);
    if (
      !lowerCells ||
      hasVerticalSupport(resolveMsChipSupportBelow(context, lowerCells, internal.chipPos, internal.chipZ ?? 1))
    ) {
      internal.floorMovement = "none";
      internal.floorMovementDir = MS_DIRECTION.none;
      return 0;
    }
    soundEffects |= moveChipDownOneLayer(cells, lowerCells, internal, context.inventory).soundEffects;
    internal.chipHasMoved = false;
    return soundEffects;
  }
  if (internal.floorMovement === "elevator") {
    const upperCells = context.upperCells(internal.chipZ);
    if (!upperCells) {
      context.addTileOverlay(internal.chipZ ?? 1, internal.chipPos, "elevator-failure");
      return 0;
    }
    const previousZ = internal.chipZ ?? runtimeCellZ(cells, internal.chipPos);
    const elevated = moveChipUpOneLayer(cells, upperCells, internal, context.inventory);
    soundEffects |= elevated.soundEffects;
    if ((internal.chipZ ?? previousZ) === previousZ) {
      context.addTileOverlay(previousZ, internal.chipPos, "elevator-failure");
    }
    internal.chipHasMoved = false;
    return soundEffects;
  }
  const pushedBlockPickupRevealTileId = findPushedMsBlockPickupRevealTileId(cells, internal.chipPos, internal.floorMovementDir);
  if (canMoveChip(cells, internal, context.inventory, internal.floorMovementDir)) {
    soundEffects |= moveChipWithPushPickupReveal(
      context.engine,
      cells,
      internal,
      context.inventory,
      internal.floorMovementDir,
      pushedBlockPickupRevealTileId,
    ).soundEffects;
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
    if (canMoveChip(cells, internal, context.inventory, internal.floorMovementDir)) {
      soundEffects |= moveChipOnce(cells, internal, context.inventory, internal.floorMovementDir).soundEffects;
      refreshFloorMovement(cells, internal, context.inventory);
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
    if (canMoveChip(cells, internal, context.inventory, internal.floorMovementDir)) {
      soundEffects |= moveChipOnce(cells, internal, context.inventory, internal.floorMovementDir).soundEffects;
      internal.chipHasMoved = false;
      return soundEffects;
    }
  }

  refreshFloorMovement(cells, internal, context.inventory);
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

function moveChipWithPushPickupReveal(
  engine: EngineState,
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
  pushedBlockPickupRevealTileId: number | null,
): MovementAttemptResult {
  const moveResult = moveChipOnce(cells, internal, inventory, dir);
  if (
    pushedBlockPickupRevealTileId !== null &&
    (moveResult.soundEffects & ((1 << MS_SOUND.IcCollected) | (1 << MS_SOUND.ItemCollected))) !== 0
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
  return moveResult;
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

  const moveResult = moveChipWithPushPickupReveal(
    engine,
    cells,
    internal,
    inventory,
    dir,
    pushedBlockPickupRevealTileId,
  );
  internal.chipHasMoved = internal.chipStatus === "okay";
  return moveResult.soundEffects;
}

interface MsChipFloorPhaseState {
  chipFloorMovementModeBeforeFloor: MsInternalState["floorMovement"];
  chipFloorMovementModeAfterFloor: MsInternalState["floorMovement"];
  chipFloorMovementWasActive: boolean;
}

interface MsChipInputResolution {
  chipPosBeforeManualMovement: number;
  manualDir: number;
  nextLastMove: EngineState["lastMove"];
}

interface MsAdvanceTickRuntime {
  state: MsGameState;
  input: GameRuntimeCommand;
  debugRecorder: TurnDebugPhaseRecorder<GameDebugPhaseSnapshot> | null;
  mapLayers: MsRuntimeLayer[];
  layerCellsByZ: Map<number, EngineMapCell[]>;
  initialCells: EngineMapCell[];
  internal: MsInternalState;
  inputLatchInternal: MsInternalState;
  inventory: EngineState["inventory"];
  nextTick: number;
  timeOffset: number;
  soundEffects: number;
  recordedReplayMove: RecordedReplayMoveDecision | null;
  toolActionTriggeredThisTick: boolean;
}

function createMsAdvanceTickRuntime(
  state: MsGameState,
  input: GameRuntimeCommand,
  debugRecorder: TurnDebugPhaseRecorder<GameDebugPhaseSnapshot> | null,
): MsAdvanceTickRuntime {
  const mapLayers = cloneRuntimeMapLayers(state.engine.map);
  const layerCellsByZ = new Map<number, EngineMapCell[]>(mapLayers.map((layer) => [layer.z, layer.cells]));
  const initialCells = layerCellsByZ.get(state.internal.chipZ ?? 1) ?? mapLayers[0]!.cells;
  const internal = cloneInternalState(state.internal);
  const inputLatchInternal = cloneInternalState(state.internal);
  internal.runtimeLayers = mapLayers.map((layer) => ({
    z: layer.z,
    cells: layer.cells,
  }));
  inputLatchInternal.runtimeLayers = internal.runtimeLayers;
  const inventory = cloneInventory(state.engine.inventory);
  reconcileMsPortableToolProjection(internal, inventory);
  reconcileMsPortableToolProjection(inputLatchInternal, inventory);
  clearMsTileOverlays(state.engine);
  internal.pendingSoundEffects = 0;

  return {
    state,
    input,
    debugRecorder,
    mapLayers,
    layerCellsByZ,
    initialCells,
    internal,
    inputLatchInternal,
    inventory,
    nextTick: state.engine.timer.currentTime + 1,
    timeOffset: -1,
    soundEffects: 0,
    recordedReplayMove: null,
    toolActionTriggeredThisTick: false,
  };
}

function msAdvanceTickCellsForZ(runtime: MsAdvanceTickRuntime, z = 1): EngineMapCell[] {
  return runtime.layerCellsByZ.get(z) ?? runtime.mapLayers[0]!.cells;
}

function msAdvanceTickActiveChipCells(runtime: MsAdvanceTickRuntime): EngineMapCell[] {
  return msAdvanceTickCellsForZ(runtime, runtime.internal.chipZ ?? 1);
}

function flushMsPendingSoundEffects(runtime: MsAdvanceTickRuntime): void {
  if (runtime.internal.pendingSoundEffects === 0) {
    return;
  }
  runtime.soundEffects |= runtime.internal.pendingSoundEffects;
  runtime.internal.pendingSoundEffects = 0;
}

function finishMsTick(
  runtime: MsAdvanceTickRuntime,
  lastMove: EngineState["lastMove"] = runtime.state.engine.lastMove,
  overrideTimeOffset = runtime.timeOffset,
  includeFinalPhase = true,
): MsAdvanceTickResult {
  const activeCells = msAdvanceTickActiveChipCells(runtime);
  projectMsPortableToolState(runtime.internal, runtime.inventory);
  const nextState = updateEngine(
    {
      engine: {
        ...runtime.state.engine,
        inventory: runtime.inventory,
        lastMove,
        timer: {
          ...runtime.state.engine.timer,
          timeOffset: overrideTimeOffset,
        },
      },
      internal: runtime.internal,
    },
    activeCells,
    runtime.soundEffects,
    true,
    runtime.mapLayers,
  );
  if (runtime.debugRecorder && includeFinalPhase) {
    recordTurnDebugPhase(runtime.debugRecorder, TURN_DEBUG_PHASE.final, (phase) =>
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
    recordedReplayMove: runtime.recordedReplayMove,
  };
}

function recordMsTickPhase(
  runtime: MsAdvanceTickRuntime,
  phase: TurnDebugPhaseName,
  lastMove: EngineState["lastMove"] = runtime.state.engine.lastMove,
): void {
  if (!runtime.debugRecorder) {
    return;
  }
  recordTurnDebugPhase(runtime.debugRecorder, phase, (recordedPhase) =>
    projectMsDebugPhaseSnapshot(
      runtime.state,
      msAdvanceTickActiveChipCells(runtime),
      runtime.internal,
      runtime.inventory,
      runtime.nextTick,
      runtime.soundEffects,
      lastMove,
      recordedPhase,
    ),
  );
}

function recordMsTickPhaseWithInternal(
  runtime: MsAdvanceTickRuntime,
  phase: TurnDebugPhaseName,
  snapshotInternal: MsInternalState,
  lastMove: EngineState["lastMove"] = runtime.state.engine.lastMove,
  chipSlipCarryDir: number = MS_DIRECTION.none,
): void {
  if (!runtime.debugRecorder) {
    return;
  }
  const phaseCells = msAdvanceTickCellsForZ(runtime, snapshotInternal.chipZ ?? 1);
  recordTurnDebugPhase(runtime.debugRecorder, phase, (recordedPhase) =>
    projectMsDebugPhaseSnapshot(
      runtime.state,
      phaseCells,
      snapshotInternal,
      runtime.inventory,
      runtime.nextTick,
      runtime.soundEffects,
      lastMove,
      recordedPhase,
      chipSlipCarryDir,
    ),
  );
}

function msTickPhaseIsPlayable(runtime: MsAdvanceTickRuntime): boolean {
  return runtime.internal.chipStatus === "okay" && !runtime.internal.completed;
}

function maybeFinishMsTickEarly(
  runtime: MsAdvanceTickRuntime,
  lastMove: EngineState["lastMove"] = runtime.state.engine.lastMove,
): MsAdvanceTickResult | null {
  if (msTickPhaseIsPlayable(runtime)) {
    return null;
  }
  flushMsPendingSoundEffects(runtime);
  return finishMsTick(runtime, lastMove);
}

function runMsInitialHousekeepingPhase(runtime: MsAdvanceTickRuntime): number {
  runtime.inputLatchInternal.currentInput = latchCurrentMsInput(
    runtime.state.engine.replay.cursor,
    runtime.inputLatchInternal.currentInput,
    runtime.input.inputCode,
  );
  if (runtime.debugRecorder) {
    recordTurnDebugPhase(runtime.debugRecorder, TURN_DEBUG_PHASE.postInputLatch, (phase) =>
      projectMsDebugPhaseSnapshot(
        runtime.state,
        runtime.initialCells,
        runtime.inputLatchInternal,
        runtime.inventory,
        runtime.nextTick,
        runtime.soundEffects,
        runtime.state.engine.lastMove,
        phase,
      ),
    );
  }

  if ((runtime.nextTick & 3) === 0) {
    for (const creature of runtime.internal.creatures) {
      if (creature.turning) {
        creature.turning = false;
        creature.hasMoved = false;
        updateCreatureTile(msAdvanceTickCellsForZ(runtime, creature.z ?? 1), creature);
      }
    }
    runtime.internal.chipWait += 1;
    if (runtime.internal.chipWait > 3) {
      runtime.internal.chipWait = 3;
      if (runtime.internal.chipDir !== MS_DIRECTION.none) {
        runtime.internal.chipDir = MS_DIRECTION.south;
        updateChipTile(msAdvanceTickActiveChipCells(runtime), runtime.internal);
      }
    }
  }

  runtime.internal.currentInput = latchCurrentMsInput(
    runtime.state.engine.replay.cursor,
    runtime.internal.currentInput,
    runtime.input.inputCode,
  );
  const { modifierMask } = decodeRuntimeInputCode(runtime.internal.currentInput);
  if (
    msTickPhaseIsPlayable(runtime) &&
    (modifierMask & GAME_INPUT_MODIFIER_MASKS.action1) !== 0 &&
    primeMsToolDrop(runtime.internal, runtime.inventory, runtime.internal.chipPos, runtime.internal.chipZ ?? 1)
  ) {
    runtime.toolActionTriggeredThisTick = true;
  }
  recordMsTickPhase(runtime, TURN_DEBUG_PHASE.postInitialHousekeeping);
  return runtime.internal.currentInput;
}

function runMsCreatureMovementPhase(runtime: MsAdvanceTickRuntime): void {
  if (!msTickPhaseIsPlayable(runtime)) {
    return;
  }
  if (runtime.nextTick > 0 && (runtime.nextTick & 1) === 0) {
    runtime.internal.controllerDir = MS_DIRECTION.none;
  }
  runtime.soundEffects |= runCreatureMovements(
    runtime.state.engine,
    runtime.layerCellsByZ,
    runtime.internal,
    runtime.nextTick,
    runtime.state.engine.replay.stepping,
  );
  if (runtime.nextTick > 0 && (runtime.nextTick & 1) === 0) {
    recordMsTickPhase(runtime, TURN_DEBUG_PHASE.postCreatureMovement);
  }
}

function runMsChipFloorPhase(runtime: MsAdvanceTickRuntime): MsChipFloorPhaseState {
  if (msTickPhaseIsPlayable(runtime)) {
    const tickContext = createMsTickContext(runtime.state.engine, runtime.internal, runtime.inventory, runtime.layerCellsByZ);
    syncMsChipAirFloorMovement(
      {
        ...tickContext,
        canMoveBlockInto,
      },
      runtime.internal,
    );
    syncMsChipElevatorFloorMovement(
      {
        ...tickContext,
        canMoveBlockInto,
      },
      runtime.internal,
    );
  }

  const chipFloorMovementModeBeforeFloor = runtime.internal.floorMovement;
  const chipFloorMovementDirBeforeFloor = runtime.internal.floorMovementDir;
  const chipFloorMovementWasActive =
    msTickPhaseIsPlayable(runtime) &&
    runtime.nextTick > 0 &&
    (runtime.nextTick & 1) === 0 &&
    runtime.internal.floorMovement !== "none" &&
    runtime.internal.floorMovementDir !== MS_DIRECTION.none;

  if (runtime.nextTick > 0 && (runtime.nextTick & 1) === 0) {
    runtime.soundEffects |= runFloorMovement(
      createMsTickContext(runtime.state.engine, runtime.internal, runtime.inventory, runtime.layerCellsByZ),
      msAdvanceTickActiveChipCells(runtime),
    );
    recordMsTickPhaseWithInternal(
      runtime,
      TURN_DEBUG_PHASE.postChipFloorMovement,
      cloneInternalState(runtime.internal),
      runtime.state.engine.lastMove,
      chipFloorMovementWasActive && runtime.internal.floorMovement === "none"
        ? chipFloorMovementDirBeforeFloor
        : MS_DIRECTION.none,
    );
  }

  return {
    chipFloorMovementModeBeforeFloor,
    chipFloorMovementModeAfterFloor: runtime.internal.floorMovement,
    chipFloorMovementWasActive,
  };
}

function runMsCreatureFloorPhase(runtime: MsAdvanceTickRuntime): void {
  if (!msTickPhaseIsPlayable(runtime) || runtime.nextTick <= 0 || (runtime.nextTick & 1) !== 0) {
    return;
  }
  runtime.soundEffects |= runCreatureFloorMovements(runtime.state.engine, runtime.layerCellsByZ, runtime.internal, runtime.nextTick);
  recordMsTickPhase(runtime, TURN_DEBUG_PHASE.postBlockFloorMovement);
}

function resolveMsChipInputPhase(
  runtime: MsAdvanceTickRuntime,
  replayLastMoveInputCode: number,
): MsChipInputResolution {
  const replaySnapshot = {
    chipHasMovedBeforeChoose: runtime.internal.chipHasMoved,
    goalPosBeforeChoose: runtime.internal.goalPos,
    floorMovementBeforeChoose: runtime.internal.floorMovement,
    chipDirBeforeChoose: runtime.internal.chipDir,
    chipPos: runtime.internal.chipPos,
  };
  const manualChoice = msTickPhaseIsPlayable(runtime)
    ? chooseMsManualMovement(runtime.internal, runtime.nextTick, () =>
        chipMoveToGoalPos(msAdvanceTickActiveChipCells(runtime), runtime.internal, runtime.inventory),
      )
    : {
        consumedInputCode: GAME_INPUT_CODES.none,
        dir: MS_DIRECTION.none,
      };
  const recordedInputCode =
    runtime.toolActionTriggeredThisTick && manualChoice.consumedInputCode === GAME_INPUT_CODES.none
      ? replayLastMoveInputCode
      : manualChoice.consumedInputCode;
  runtime.recordedReplayMove = resolveMsRecordedReplayMoveAfterChoose(
    runtime.state.engine.replay.cursor,
    runtime.nextTick,
    recordedInputCode,
    replaySnapshot,
    runtime.toolActionTriggeredThisTick,
  );
  const chipPosBeforeManualMovement = runtime.internal.chipPos;
  const nextLastMove = resolveMsReplayLastMoveAfterChoose(
    {
      replayCursor: runtime.state.engine.replay.cursor,
      previousLastMove: runtime.state.engine.lastMove,
      currentTime: runtime.nextTick,
      engineTime: runtime.state.engine.timer.currentTime,
    },
    replayLastMoveInputCode,
    replaySnapshot,
    runtime.toolActionTriggeredThisTick,
  );

  return {
    chipPosBeforeManualMovement,
    manualDir: manualChoice.dir,
    nextLastMove,
  };
}

function runMsTimerPhase(
  runtime: MsAdvanceTickRuntime,
  nextLastMove: EngineState["lastMove"],
): MsAdvanceTickResult | null {
  if (!msTickPhaseIsPlayable(runtime)) {
    return null;
  }
  runtime.timeOffset = 0;
  if (runtime.state.engine.timer.timeLimit > 0 && runtime.nextTick >= runtime.state.engine.timer.timeLimit) {
    runtime.internal.chipStatus = "outoftime";
    runtime.soundEffects |= 1 << MS_SOUND.TimeOut;
    return {
      state: updateEngine(
        {
          engine: {
            ...runtime.state.engine,
            inventory: runtime.inventory,
            lastMove: nextLastMove,
            timer: {
              ...runtime.state.engine.timer,
              timeOffset: runtime.timeOffset,
            },
          },
          internal: runtime.internal,
        },
        msAdvanceTickActiveChipCells(runtime),
        runtime.soundEffects,
      ),
      recordedReplayMove: runtime.recordedReplayMove,
    };
  }
  if (
    runtime.state.engine.timer.timeLimit > 0 &&
    runtime.state.engine.timer.timeLimit > runtime.nextTick &&
    runtime.state.engine.timer.timeLimit - runtime.nextTick <= 15 * MS_TICKS_PER_SECOND &&
    runtime.nextTick % MS_TICKS_PER_SECOND === 0
  ) {
    runtime.soundEffects |= 1 << MS_SOUND.TimeLow;
  }
  return null;
}

function runMsManualMovementPhase(
  runtime: MsAdvanceTickRuntime,
  nextLastMove: EngineState["lastMove"],
  manualDir: number,
  chipPosBeforeManualMovement: number,
  chipFloorMovementWasActive: boolean,
  chipFloorMovementModeBeforeFloor: MsInternalState["floorMovement"],
  chipFloorMovementModeAfterFloor: MsInternalState["floorMovement"],
): MsAdvanceTickResult | null {
  recordMsTickPhaseWithInternal(runtime, TURN_DEBUG_PHASE.postChipInput, cloneInternalState(runtime.internal), nextLastMove);
  if (msTickPhaseIsPlayable(runtime)) {
    runtime.soundEffects |= runManualMovement(
      runtime.state.engine,
      msAdvanceTickActiveChipCells(runtime),
      runtime.internal,
      runtime.inventory,
      manualDir,
    );
  }
  if (!msTickPhaseIsPlayable(runtime)) {
    flushMsPendingSoundEffects(runtime);
    return finishMsTick(runtime, nextLastMove);
  }
  const carriedSlideExitThisTick =
    !chipFloorMovementWasActive &&
    chipFloorMovementModeAfterFloor === "slide" &&
    runtime.internal.floorMovement === "none" &&
    runtime.internal.chipPos !== chipPosBeforeManualMovement;
  recordMsTickPhaseWithInternal(
    runtime,
    TURN_DEBUG_PHASE.postChipMovement,
    cloneInternalState(runtime.internal),
    nextLastMove,
    ((chipFloorMovementWasActive &&
      chipFloorMovementModeBeforeFloor === "slide" &&
      chipFloorMovementModeAfterFloor === "slide" &&
      runtime.internal.floorMovement === "none") ||
      carriedSlideExitThisTick)
      ? runtime.internal.lastSlipDir
      : MS_DIRECTION.none,
  );
  return null;
}

function runMsCloneReleasePhase(
  runtime: MsAdvanceTickRuntime,
  nextLastMove: EngineState["lastMove"],
): MsAdvanceTickResult {
  forEachRuntimeLayer(runtime.mapLayers, (layerCells) => {
    runtime.soundEffects |= handleDeferredButtons(layerCells, runtime.internal);
  });
  resolvePendingCloners(runtime.initialCells, runtime.internal);
  createClones(runtime.internal);
  flushMsPendingSoundEffects(runtime);
  recordMsTickPhase(runtime, TURN_DEBUG_PHASE.postCloneRelease, nextLastMove);
  return finishMsTick(runtime, nextLastMove);
}

function advanceMsTick(
  state: MsGameState,
  input: GameRuntimeCommand,
  debugRecorder: TurnDebugPhaseRecorder<GameDebugPhaseSnapshot> | null = null,
): MsAdvanceTickResult {
  const runtime = createMsAdvanceTickRuntime(state, input, debugRecorder);

  if (
    runtime.state.engine.replay.cursor >= 0 &&
    runtime.state.engine.replay.cursor >= runtime.state.engine.replay.moveCount &&
    runtime.nextTick + runtime.state.engine.timer.timeOffset - 1 > runtime.state.engine.replay.bestTimeTicks
  ) {
    runtime.internal.replayDeadlineFailed = true;
    return finishMsTick(runtime, runtime.state.engine.lastMove, runtime.state.engine.timer.timeOffset, false);
  }

  let replayLastMoveInputCode = 0;
  let nextLastMove = runtime.state.engine.lastMove;
  let chipFloorPhaseState: MsChipFloorPhaseState = {
    chipFloorMovementModeBeforeFloor: runtime.internal.floorMovement,
    chipFloorMovementModeAfterFloor: runtime.internal.floorMovement,
    chipFloorMovementWasActive: false,
  };
  let chipPosBeforeManualMovement = runtime.internal.chipPos;
  let manualDir: number = MS_DIRECTION.none;
  const earlyResult = runTurnPhaseHandlers<MsAdvanceTickResult>([
    {
      name: TURN_PHASE.initialHousekeeping,
      run: () => {
        replayLastMoveInputCode = runMsInitialHousekeepingPhase(runtime);
        return null;
      },
    },
    {
      name: TURN_PHASE.creatureMovement,
      run: () => {
        runMsCreatureMovementPhase(runtime);
        nextLastMove = runtime.state.engine.lastMove;
        return maybeFinishMsTickEarly(runtime, nextLastMove);
      },
    },
    {
      name: TURN_PHASE.chipFloorMovement,
      run: () => {
        chipFloorPhaseState = runMsChipFloorPhase(runtime);
        nextLastMove = runtime.state.engine.lastMove;
        return maybeFinishMsTickEarly(runtime, nextLastMove);
      },
    },
    {
      name: TURN_PHASE.creatureFloorMovement,
      run: () => {
        runMsCreatureFloorPhase(runtime);
        nextLastMove = runtime.state.engine.lastMove;
        return maybeFinishMsTickEarly(runtime, nextLastMove);
      },
    },
    {
      name: TURN_PHASE.chipInputResolution,
      run: () => {
        ({ chipPosBeforeManualMovement, manualDir, nextLastMove } = resolveMsChipInputPhase(runtime, replayLastMoveInputCode));
        return null;
      },
    },
    {
      name: TURN_PHASE.timer,
      run: () => runMsTimerPhase(runtime, nextLastMove),
    },
    {
      name: TURN_PHASE.manualMovement,
      run: () =>
        runMsManualMovementPhase(
          runtime,
          nextLastMove,
          manualDir,
          chipPosBeforeManualMovement,
          chipFloorPhaseState.chipFloorMovementWasActive,
          chipFloorPhaseState.chipFloorMovementModeBeforeFloor,
          chipFloorPhaseState.chipFloorMovementModeAfterFloor,
        ),
    },
    {
      name: TURN_PHASE.cloneRelease,
      run: () => runMsCloneReleasePhase(runtime, nextLastMove),
    },
  ]);
  return earlyResult ?? runMsCloneReleasePhase(runtime, nextLastMove);
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
    state = advanceMsTick(state, input, createArrayTurnDebugPhaseRecorder(phases)).state;
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
      createArrayTurnDebugPhaseRecorder(phases),
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
