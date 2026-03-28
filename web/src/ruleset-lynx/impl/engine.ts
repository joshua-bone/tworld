import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import type { GameDebugPhaseSnapshot, GameDebugTrace } from "@game-core/api/debug";
import { findHiddenActorAtPosition, findVisibleActorAtPosition, storeActorInReusableHiddenSlot } from "@game-core/impl/actors";
import {
  addTopTileFlags,
  cloneBoardCells,
  hasBoardCell,
  hasTopTileFlags,
  promoteBottomTile,
  removeTopTileFlags,
  replaceTopTile,
  topTile,
  topTileIdOr,
} from "@game-core/impl/board";
import { findVisibleActorOnFlaggedTopCell } from "@game-core/impl/occupancy";
import {
  advanceToCell,
  advancePositionIfPossible,
  canAdvancePosition as canAdvanceLynxPosition,
  directionCode,
  directionName,
  isDiagonalInput,
  isDirectionalInput,
  isPositionInBounds as inBounds,
  normalizeCardinalDirection as normalizeDirection,
  nextPosition,
  reverseDirection as backDirection,
  roundedBoardPosition,
} from "@game-core/impl/grid";
import {
  createArrayTurnDebugPhaseRecorder,
  TURN_DEBUG_PHASE,
  TURN_PHASE,
  recordTurnDebugPhase,
  runTurnPhaseHandlers,
  type TurnDebugPhaseName,
  type TurnDebugPhaseRecorder,
} from "@game-core/api/turnPhases";
import {
  arrivalCompleted,
  blockedMovement,
  collided,
  collisionOccurred,
  completedArrival,
  movedMovement,
  movementDidSucceed,
  noArrival,
  noCollision,
  removedOnArrival,
  resolvedArrival,
  type ArrivalResult,
  type CollisionResult,
  type MovementAttemptResult,
} from "@game-core/api/movementOutcomes";
import { hasVerticalSupport } from "@game-core/api/verticalMovement";
import { advanceTimer, createInitialEngineTimer, syncTimerSecondsPlayed } from "@game-core/impl/timer";
import { mapHash } from "@game-core/impl/hash";
import { actorCollectionAllowsSlot, actorCollectsChips, actorThiefStealsBootsAndTools } from "@game-core/api/actorCapabilities";
import {
  actorInventoryClearBoots,
  actorInventoryCollectIndexedItem,
  actorInventoryHasBoot,
  actorInventoryUseKey,
  createNoActorLocalInventoryOwner,
  createKeysBootsToolsActorLocalInventoryOwner,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import { createReplayPlan, createRuntimeCommand, plannedReplayInput, recordManualMove, runtimeCommandName } from "@game-core/api/playback";
import { decodeRuntimeInputCode, GAME_INPUT_MODIFIER_MASKS, getGameInputNameFromCode } from "@game-core/api/command";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { createGameDebugTrace, createGameTrace } from "@game-core/impl/trace";
import { projectLynxDebugPhaseSnapshot } from "@ruleset-lynx/impl/debugProjection";
import {
  previewInputCodeForLynxChipMoveSelection,
  resolveLynxChipInputDirection,
  selectLynxChipMoveForTick,
  shouldSuppressLynxChipMoveSelectionForHeldTrapArrival,
  suppressLynxChipMoveSelectionForHeldTrapArrival,
  type LynxChipMoveSelection,
} from "@ruleset-lynx/impl/chipInput";
import {
  chooseLynxCreatureMoveForTick as chooseLynxCreatureMoveForTickWithContext,
  type LynxCreatureControllerContext,
} from "@ruleset-lynx/impl/controllers";
import {
  lynxChipTargetCellAllowsEntry,
  lynxChipTargetCellAllowsPush,
  lynxChipTargetCellStopsOnPush,
  probeLynxChipTargetCell,
} from "@ruleset-lynx/impl/chipMoveProbe";
import {
  canLynxChipUseElevator,
  chipShouldStartLynxAirMove,
  isValidLynxElevatorDestinationFloor,
  resolveLynxChipSupportBelow,
  resolveLynxNonChipSupportBelow,
  startLynxActorAirMovement,
  startLynxActorElevatorMovement,
  startLynxChipAirMovement,
  startLynxChipElevatorMovement,
  type LynxMoveKind,
} from "@ruleset-lynx/impl/verticalMovement";
import {
  clearLynxToolInventory,
  collectLynxPortableItemsFromLayers,
  primeLynxToolDrop,
  primedLynxPortableToolItem,
  projectLynxPortableToolState,
  queueLynxToolInventoryReplacement,
  reconcileLynxPortableToolProjection,
  settleLynxPrimedToolDrop,
  type LynxPortableItem,
  type LynxPortableToolStateStore,
} from "@ruleset-lynx/impl/portableItems";
import {
  resolveLynxTeleports as resolveLynxTeleportsWithContext,
  type LynxTeleportContext,
} from "@ruleset-lynx/impl/teleports";
import {
  activateLynxCloner as activateLynxClonerWithContext,
  findLynxTrapTarget as findLynxTrapTargetInLevel,
  springLynxTrap as springLynxTrapWithContext,
  type LynxTrapClonerContext,
} from "@ruleset-lynx/impl/trapCloner";
import {
  applyLynxHeldButtonReplayConsumption,
  type LynxChipTurnState,
  type LynxEndGameResult,
  type LynxEndGameState,
  type LynxHeldButtonResolution,
  type LynxPostMoveResolution,
} from "@ruleset-lynx/impl/turnState";
import {
  lynxActorEntryMask,
  lynxActorGlobalProgressKind,
  lynxActorHazardResponse,
  lynxActorItemCollectionKind,
  lynxActorLocalInventoryMode,
  lynxActorThiefHook,
  lynxArrivalAnimationKind,
  lynxBlockMovementMask,
  lynxButtonAction,
  lynxChipMoveSoundAction,
  lynxChipEnterAction,
  lynxChipMovementMask,
  lynxCreatureArrivalAction,
  lynxDoorKeyIndex,
  lynxExitMovementMask,
  lynxFixedSlideDirection,
  lynxIceWallTurn,
  lynxInventoryIndex,
  lynxInventorySlot,
  lynxRequiresReleaseToExit,
  lynxTileForcedFloorKind,
  lynxTileHasTag,
  lynxToggledWallTileId,
} from "@ruleset-lynx/impl/catalog";
import {
  MS_DIRECTION,
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_STATUS_FLAG,
  MS_TICKS_PER_SECOND,
  MS_TILE,
  isMsCreature,
  msCreatureDir,
  msCreatureId,
} from "@ruleset-ms/api/tiles";
import type { GameCommand, GameRequest, GameTrace } from "@game-core/api/types";
import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { collectLevelCreaturePositions, levelLayers } from "@ruleset-ms/api/level";
import type { GameRuntimeCommand } from "@game-core/api/types";
const LYNX_DEBUG_SCHEMA_VERSION = 2;
const LYNX_REPLAY_MOVE_TICK_MASK = 0x7fffff;
const HIDDEN_WALL_REVEAL_TTL = MS_TICKS_PER_SECOND / 2;
const BLUE_WALL_VISUAL_REVEAL_TTL = 0x7fff_ffff;
type LynxChipLocalInventoryProjection = Pick<EngineState["inventory"], "keys" | "boots" | "tools">;

export interface LynxInteractiveSessionState {
  level: LynxLevel;
  state: EngineState;
  lastInput: GameRuntimeCommand;
  recordedMoves: ReplayRecordedMove[];
  replayPlan: ReturnType<typeof createReplayPlan> | null;
  chipPos: number;
  chipZ?: number;
  chipDir: number;
  chipMoving: number;
  chipMoveKind?: LynxMoveKind;
  currentInputCode: number;
  queuedReplayInputCode: number;
  queuedChipInputCode: number;
  chipPushing: boolean;
  actors: LynxRuntimeActor[];
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
}

interface LynxAdvanceTickRuntime {
  session: LynxInteractiveSessionState;
  debugRecorder: TurnDebugPhaseRecorder<GameDebugPhaseSnapshot> | null;
  replayMode: boolean;
  carryCurrentInputAcrossTicks: boolean;
  state: EngineState;
  level: LynxLevel;
  replayPlan: ReturnType<typeof createReplayPlan> | null;
  runtimeInput: GameRuntimeCommand;
  scheduledInputCode: number | null;
  chipPos: number;
  chipZ: number;
  chipDir: number;
  chipMoving: number;
  chipMoveKind: LynxMoveKind;
  currentInputCode: number;
  queuedReplayInputCode: number;
  queuedChipInputCode: number;
  chipPushing: boolean;
  actors: LynxRuntimeActor[];
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
  chipArrivedOnHeldTrapThisTick: boolean;
  latchedChipMoveSelection: LynxChipMoveSelection | null;
  recordedReplayInputCode: number;
  nextTick: number;
}

function lynxChipInventoryOwner(inventory: LynxChipLocalInventoryProjection): ActorLocalInventoryOwner {
  return lynxActorLocalInventoryMode(MS_TILE.Chip) === "keys-boots-tools"
    ? createKeysBootsToolsActorLocalInventoryOwner("chip", inventory as ActorKeysBootsToolsInventory)
    : createNoActorLocalInventoryOwner("chip");
}

function applyLynxActorThiefHook(
  state: EngineState,
  actorId: number,
  inventoryOwner: ActorLocalInventoryOwner,
): boolean {
  if (!actorThiefStealsBootsAndTools(lynxActorThiefHook(actorId))) {
    return false;
  }
  actorInventoryClearBoots(inventoryOwner);
  clearLynxToolInventory(lynxRuntimeState(state), state.inventory);
  return true;
}

export interface LynxRuntimeActor {
  id: number;
  pos: number;
  z?: number;
  dir: number;
  intentDir: number;
  forcedDir: number;
  teleported: boolean;
  moving: number;
  frame: number;
  moveKind?: LynxMoveKind;
  ignoreIceFromAir?: boolean;
  hidden: boolean;
  pushed: boolean;
  deferPush: boolean;
  deferPushArmed: boolean;
  reversePending: boolean;
  dormant: boolean;
  animationReserved: boolean;
}

interface LynxAnimationState {
  pos: number;
  frame: number;
  tileId: number;
}

const LYNX_ANIMATION_TILE = {
  Water_Splash: 0x74,
  Bomb_Explosion: 0x75,
  Entity_Explosion: 0x76,
} as const;

function lynxAnimationTileId(kind: "water-splash" | "bomb-explosion" | "none"): number | null {
  switch (kind) {
    case "water-splash":
      return LYNX_ANIMATION_TILE.Water_Splash;
    case "bomb-explosion":
      return LYNX_ANIMATION_TILE.Bomb_Explosion;
    default:
      return null;
  }
}

interface LynxRuntimeState {
  toggleWallsPending: boolean;
  animations: LynxAnimationState[];
  tileOverlays: Array<{
    z: number;
    pos: number;
    kind: InteractiveGameTileOverlayKind;
    ttl: number;
  }>;
  primedToolDrop: LynxPortableToolStateStore["primedToolDrop"];
  chipTeleported: boolean;
  chipSlideToken: boolean;
  chipIgnoreIceFromAir?: boolean;
  couldntMove: boolean;
  trapReleaseCantMoveThisTick: boolean;
  lastRandomSlideDir: number;
  chipPos: number;
  chipZ: number;
  portableItems: LynxPortableItem[];
  nextPortableItemSerial: number;
}

interface LynxTickContext {
  state: EngineState;
  actors: LynxRuntimeActor[];
  chipPos: number;
  chipZ: number;
  lowerCells(z?: number): EngineMapCell[] | null;
  upperCells(z?: number): EngineMapCell[] | null;
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
  findVisibleActorAt(pos: number, z: number): LynxRuntimeActor | null;
}

interface LynxRuntimeLayer {
  z: number;
  cells: EngineMapCell[];
}

function stripCreaturesForInitialHash(cells: EngineMapCell[]): EngineMapCell[] {
  const stripped = cells.map((cell) => {
    const topIsCreature = isMsCreature(cell.top.id) || cell.top.id === MS_TILE.Block_Static;
    const bottomIsCreature = isMsCreature(cell.bottom.id) || cell.bottom.id === MS_TILE.Block_Static;

    if (!topIsCreature && !bottomIsCreature) {
      return {
        position: { ...cell.position },
        top: { ...cell.top },
        bottom: { ...cell.bottom },
      };
    }

    const topCreatureId = topIsCreature
      ? cell.top.id === MS_TILE.Block_Static
        ? MS_TILE.Block
        : msCreatureId(cell.top.id)
      : null;
    const bottomCreatureId = bottomIsCreature
      ? cell.bottom.id === MS_TILE.Block_Static
        ? MS_TILE.Block
        : msCreatureId(cell.bottom.id)
      : null;
    const shouldClaim = topCreatureId !== MS_TILE.Chip && bottomCreatureId !== MS_TILE.Chip;

    if (topIsCreature && bottomIsCreature) {
      return {
        position: { ...cell.position },
        top: { id: MS_TILE.Empty, state: shouldClaim ? LYNX_CELL_FLAG.Claimed : 0 },
        bottom: { id: MS_TILE.Empty, state: 0 },
      };
    }

    if (topIsCreature) {
      return {
        position: { ...cell.position },
        top: {
          id: cell.bottom.id,
          state: cell.bottom.state | (topCreatureId === MS_TILE.Chip ? 0 : LYNX_CELL_FLAG.Claimed),
        },
        bottom: { id: MS_TILE.Empty, state: 0 },
      };
    }

    if (bottomIsCreature) {
      return {
        position: { ...cell.position },
        top: {
          id: cell.top.id,
          state: cell.top.state | (bottomCreatureId === MS_TILE.Chip ? 0 : LYNX_CELL_FLAG.Claimed),
        },
        bottom: { id: MS_TILE.Empty, state: 0 },
      };
    }

    return {
      position: { ...cell.position },
      top: { ...cell.top },
      bottom: { ...cell.bottom },
    };
  });

  for (const cell of stripped) {
    if (lynxTileHasTag(cell.top.id, "trap")) {
      cell.top.state |= LYNX_CELL_FLAG.Beartrap;
    }
    if (lynxTileForcedFloorKind(cell.top.id) === "teleport") {
      cell.top.state |= LYNX_CELL_FLAG.Teleport;
    }
  }

  return stripped;
}

function findChipSeed(level: LynxLevel): { pos: number; z: number; dir: number } {
  for (const layer of levelLayers(level)) {
    for (const cell of layer.cells) {
      if (isMsCreature(cell.top.id) && msCreatureId(cell.top.id) === MS_TILE.Chip) {
        return { pos: cell.position.pos, z: layer.z, dir: msCreatureDir(cell.top.id) };
      }
      if (isMsCreature(cell.bottom.id) && msCreatureId(cell.bottom.id) === MS_TILE.Chip) {
        return { pos: cell.position.pos, z: layer.z, dir: msCreatureDir(cell.bottom.id) };
      }
    }
  }

  return { pos: 0, z: 1, dir: 0 };
}

function lynxRuntimeLayers(map: EngineState["map"]): LynxRuntimeLayer[] {
  return map.layers?.map((layer) => ({ z: layer.z, cells: layer.cells })) ?? [{ z: 1, cells: map.cells }];
}

function lynxCellsForZ(map: EngineState["map"], z = 1): EngineMapCell[] {
  return lynxRuntimeLayers(map).find((layer) => layer.z === z)?.cells ?? lynxRuntimeLayers(map)[0]!.cells;
}

function setLynxActiveLayer(state: EngineState, z = 1): EngineMapCell[] {
  const cells = lynxCellsForZ(state.map, z);
  state.map.cells = cells;
  return cells;
}

function withLynxLayer<T>(state: EngineState, z: number, run: () => T): T {
  const previousCells = state.map.cells;
  setLynxActiveLayer(state, z);
  try {
    return run();
  } finally {
    state.map.cells = previousCells;
  }
}

function activeLynxLayerZ(state: EngineState): number {
  return state.map.cells[0]?.position.z ?? state.map.layers?.[0]?.z ?? 1;
}

function isLynxAir(id: number): boolean {
  return lynxTileForcedFloorKind(id) === "air";
}

function isLynxElevator(id: number): boolean {
  return lynxTileForcedFloorKind(id) === "elevator";
}

function lynxLowerRuntimeCells(state: EngineState, z: number | undefined): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  if (currentZ <= 1) {
    return null;
  }
  return lynxCellsForZ(state.map, currentZ - 1);
}

function lynxUpperRuntimeCells(state: EngineState, z: number | undefined): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  const targetZ = currentZ + 1;
  const layers = lynxRuntimeLayers(state.map);
  return layers.some((layer) => layer.z === targetZ) ? lynxCellsForZ(state.map, targetZ) : null;
}

function isLynxVerticalMoveKind(moveKind: LynxMoveKind | undefined): boolean {
  return moveKind === "air" || moveKind === "elevator";
}

function parseLynxActors(level: LynxLevel): LynxRuntimeActor[] {
  const scanned: LynxRuntimeActor[] = [];
  const orderedCreaturePositions = new Set(
    collectLevelCreaturePositions(level).map(({ pos, z }) => `${z}:${pos}`),
  );

  for (const layer of levelLayers(level)) {
    for (const cell of layer.cells) {
      const tile = cell.top;
      if (tile.id === MS_TILE.Block_Static) {
        scanned.push({
          id: MS_TILE.Block,
          pos: cell.position.pos,
          z: layer.z,
          dir: 1,
          intentDir: 0,
          forcedDir: 0,
          teleported: false,
          moving: 0,
          frame: 0,
          moveKind: "planar",
          ignoreIceFromAir: false,
          hidden: false,
          pushed: false,
          deferPush: false,
          deferPushArmed: false,
          reversePending: false,
          dormant: !orderedCreaturePositions.has(`${layer.z}:${cell.position.pos}`),
          animationReserved: false,
        });
        continue;
      }

      if (!isMsCreature(tile.id)) {
        continue;
      }
      scanned.push({
        id: msCreatureId(tile.id),
        pos: cell.position.pos,
        z: layer.z,
        dir: msCreatureDir(tile.id),
        intentDir: 0,
        forcedDir: 0,
        teleported: false,
        moving: 0,
        frame: 0,
        moveKind: "planar",
        ignoreIceFromAir: false,
        hidden: false,
        pushed: false,
        deferPush: false,
        deferPushArmed: false,
        reversePending: false,
        dormant: false,
        animationReserved: false,
      });
    }
  }

  const chipIndex = scanned.findIndex((actor) => actor.id === MS_TILE.Chip);
  if (chipIndex > 0) {
    const chip = scanned[chipIndex]!;
    scanned[chipIndex] = scanned[0]!;
    scanned[0] = chip;
  }

  return scanned.filter((actor) => actor.id !== MS_TILE.Chip);
}

function normalizeRandomSeed(seed: number | undefined): number {
  return (seed ?? 362436069) & 0x7fffffff;
}

function scheduledInputForTick(commands: GameCommand[], tick: number): GameCommand | null {
  return commands.find((command) => command.tick === tick) ?? null;
}

function lynxRuntimeState(state: EngineState): LynxRuntimeState {
  const runtimeState = state as EngineState & { lynxRuntimeState?: LynxRuntimeState };
  if (!runtimeState.lynxRuntimeState) {
    runtimeState.lynxRuntimeState = {
      toggleWallsPending: false,
      animations: [],
      tileOverlays: [],
      primedToolDrop: null,
      chipTeleported: false,
      chipSlideToken: false,
      chipIgnoreIceFromAir: false,
      couldntMove: false,
      trapReleaseCantMoveThisTick: false,
      lastRandomSlideDir: directionCode(state.replay.initialRandomSlideDirection),
      chipPos: -1,
      chipZ: 1,
      portableItems: [],
      nextPortableItemSerial: 1,
    };
  }
  return runtimeState.lynxRuntimeState;
}

function setLynxRuntimeChipState(state: EngineState, chipPos: number, chipZ: number): void {
  const runtime = lynxRuntimeState(state);
  runtime.chipPos = chipPos;
  runtime.chipZ = chipZ;
}

function lynxChipActsWallForMobs(state: EngineState, pos: number, z: number): boolean {
  const runtime = lynxRuntimeState(state);
  return primedLynxPortableToolItem(runtime) !== undefined && runtime.chipPos === pos && runtime.chipZ === z;
}

function clearLynxAnimationAt(state: EngineState, actors: LynxRuntimeActor[], pos: number): boolean {
  const runtime = lynxRuntimeState(state);
  const index = runtime.animations.findIndex((animation) => animation.pos === pos);
  if (index < 0) {
    return false;
  }

  runtime.animations.splice(index, 1);
  removeTopTileFlags(state.map.cells, pos, LYNX_CELL_FLAG.Animated);
  releaseReservedAnimationActorAt(actors, pos);
  return true;
}

function clearLynxTileOverlays(state: EngineState): void {
  const runtime = lynxRuntimeState(state);
  runtime.tileOverlays = runtime.tileOverlays
    .map((overlay) => ({ ...overlay, ttl: overlay.ttl - 1 }))
    .filter((overlay) => overlay.ttl > 0);
}

function addLynxTileOverlay(
  state: EngineState,
  z: number,
  pos: number,
  kind: InteractiveGameTileOverlayKind,
  ttl = 2,
): void {
  const runtime = lynxRuntimeState(state);
  const existing = runtime.tileOverlays.find((overlay) => overlay.z === z && overlay.pos === pos && overlay.kind === kind);
  if (existing) {
    existing.ttl = ttl;
    return;
  }
  runtime.tileOverlays.push({ z, pos, kind, ttl });
}

function createLynxTickContext(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipZ: number,
): LynxTickContext {
  return {
    state,
    actors,
    chipPos,
    chipZ,
    lowerCells: (z) => lynxLowerRuntimeCells(state, z),
    upperCells: (z) => lynxUpperRuntimeCells(state, z),
    addTileOverlay: (z, pos, kind, ttl = 2) => addLynxTileOverlay(state, z, pos, kind, ttl),
    chipActsWallForMobs: (pos, z) => lynxChipActsWallForMobs(state, pos, z),
    findVisibleActorAt: (pos, z) => findLynxVisibleActorAt(actors, pos, z),
  };
}

function findPressedLynxPermanentHiddenWallPos(state: EngineState, chipPos: number, dir: number): number | null {
  const targetStep = advanceToCell(state.map.cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  if (hasTopTileFlags(state.map.cells, targetStep.pos, LYNX_CELL_FLAG.Claimed)) {
    return null;
  }

  return effectiveLynxTargetTileId(state, targetStep.cell.top.id) === MS_TILE.HiddenWall_Perm ? targetStep.pos : null;
}

function findSlappedLynxBlueWallRevealPos(state: EngineState, chipPos: number, dir: number): number | null {
  const targetStep = advanceToCell(state.map.cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  if (hasTopTileFlags(state.map.cells, targetStep.pos, LYNX_CELL_FLAG.Claimed)) {
    return null;
  }

  return effectiveLynxTargetTileId(state, targetStep.cell.top.id) === MS_TILE.BlueWall_Real ? targetStep.pos : null;
}

function releaseReservedAnimationActorAt(actors: LynxRuntimeActor[], pos: number): void {
  const actor = findHiddenActorAtPosition(actors, pos, (entry) => entry.animationReserved);
  if (!actor) {
    return;
  }
  actor.animationReserved = false;
}

function initialLynxAnimationFrame(state: EngineState): number {
  return (((state.timer.currentTime + 1) + state.replay.stepping) & 1) !== 0 ? 11 : 10;
}

function startLynxAnimation(state: EngineState, actors: LynxRuntimeActor[], pos: number, tileId: number): void {
  clearLynxAnimationAt(state, actors, pos);

  const cell = state.map.cells[pos];
  if (!cell) {
    return;
  }

  lynxRuntimeState(state).animations.push({
    pos,
    frame: initialLynxAnimationFrame(state),
    tileId,
  });
  addTopTileFlags(state.map.cells, pos, LYNX_CELL_FLAG.Animated);
}

function advanceLynxAnimations(state: EngineState, actors: LynxRuntimeActor[]): void {
  const runtime = lynxRuntimeState(state);

  for (let index = runtime.animations.length - 1; index >= 0; index -= 1) {
    const animation = runtime.animations[index]!;
    animation.frame -= 1;
    if (animation.frame >= 0) {
      continue;
    }

    removeTopTileFlags(state.map.cells, animation.pos, LYNX_CELL_FLAG.Animated);
    releaseReservedAnimationActorAt(actors, animation.pos);
    runtime.animations.splice(index, 1);
  }
}

function removeLynxActor(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  animationTileId: number = LYNX_ANIMATION_TILE.Entity_Explosion,
): void {
  if (actor.moving > 0) {
    if ((actor.moveKind ?? "planar") === "planar") {
      actor.pos = nextPosition(actor.pos, backDirection(actor.dir), MS_GRID_WIDTH);
    }
    actor.moving = 0;
  }

  if (actor.pushed) {
    actor.pushed = false;
    state.soundEffects &= ~(1 << LYNX_SOUND.BlockMoving);
  }

  actor.hidden = true;
  actor.frame = 0;
  actor.moveKind = "planar";
  actor.ignoreIceFromAir = false;
  actor.animationReserved = true;
  startLynxAnimation(state, actors, actor.pos, animationTileId);
}

function startLynxEndGame(
  state: EngineState,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
  result: LynxEndGameResult,
  animationTileId: number | null,
): LynxEndGameState {
  if (endGameTicksElapsed !== null) {
    return {
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  resetLynxFloorSounds(state);
  return {
    endGameTicksElapsed: 0,
    endGameResult: result,
    endGameAnimationTileId: animationTileId,
    endGameAnimationFrame: result === "failed" && animationTileId !== null ? initialLynxAnimationFrame(state) : null,
  };
}

function failLynxChip(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
  reason: "drowned" | "burned" | "bombed" | "outoftime" | "collided",
  collidedActor: LynxRuntimeActor | null = null,
  preserveCollidedActor = false,
): LynxEndGameState & { chipPos: number } {
  if (collidedActor && !collidedActor.hidden && !preserveCollidedActor) {
    removeTopTileFlags(state.map.cells, collidedActor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, collidedActor, LYNX_ANIMATION_TILE.Entity_Explosion);
  }

  let animationTileId: number = LYNX_ANIMATION_TILE.Entity_Explosion;
  switch (reason) {
    case "drowned":
      state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
      animationTileId = LYNX_ANIMATION_TILE.Water_Splash;
      break;
    case "bombed":
      state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
      animationTileId = LYNX_ANIMATION_TILE.Bomb_Explosion;
      break;
    case "burned":
    case "collided":
      state.soundEffects |= 1 << LYNX_SOUND.ChipLoses;
      break;
    case "outoftime":
      break;
  }

  return {
    chipPos,
    ...startLynxEndGame(
      state,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
      "failed",
      animationTileId,
    ),
  };
}

function finalizeLynxEndGame(
  state: EngineState,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
): Pick<LynxEndGameState, "endGameTicksElapsed" | "endGameResult"> {
  if (endGameTicksElapsed === null || endGameResult === null) {
    return { endGameTicksElapsed, endGameResult };
  }

  state.timer.timeOffset = endGameTicksElapsed <= 1 ? 0 : -(endGameTicksElapsed - 1);
  endGameTicksElapsed += 1;
  if (endGameTicksElapsed > 13) {
    state.status = endGameResult;
  }

  return {
    endGameTicksElapsed,
    endGameResult,
  };
}

function advanceLynxEndGameAnimationFrame(
  endGameResult: LynxEndGameResult | null,
  endGameAnimationFrame: number | null,
): number | null {
  if (endGameResult !== "failed" || endGameAnimationFrame === null) {
    return endGameAnimationFrame;
  }

  return endGameAnimationFrame > 0 ? endGameAnimationFrame - 1 : null;
}

function clearLynxCouldntMove(state: EngineState): void {
  lynxRuntimeState(state).couldntMove = false;
}

function addLynxCantMove(state: EngineState): void {
  const runtime = lynxRuntimeState(state);
  if (runtime.couldntMove) {
    return;
  }

  runtime.couldntMove = true;
  state.soundEffects |= 1 << LYNX_SOUND.CantMove;
}

function canLynxCreatureEnter(tileId: number, actorId: number, dir: number): boolean {
  const mask = lynxActorEntryMask(tileId, actorId);
  if ((mask & dir) === 0) {
    return false;
  }
  if (tileId === MS_TILE.Fire && lynxActorHazardResponse(actorId, "fire") === "deny") {
    return false;
  }
  return true;
}

function effectiveLynxTargetTileId(state: EngineState, tileId: number): number {
  if (!lynxRuntimeState(state).toggleWallsPending) {
    return tileId;
  }
  return lynxToggledWallTileId(tileId);
}

function probeLynxChipTargetCellForState(
  state: EngineState,
  pos: number,
  dir: number,
  claimedCell = false,
) {
  return probeLynxChipTargetCell(state, pos, dir, {
    claimedCell,
    toggleWallsPending: lynxRuntimeState(state).toggleWallsPending,
  });
}

function canLynxExitTile(state: EngineState, tileId: number, actorId: number, dir: number, releasing: boolean): boolean {
  if (lynxRequiresReleaseToExit(tileId)) {
    return releasing;
  }
  if ((lynxExitMovementMask(tileId) & dir) === 0) {
    return false;
  }
  if (isLynxSlide(tileId) && (actorId !== MS_TILE.Chip || !hasLynxBoots(state, MS_TILE.Boots_Slide))) {
    return getLynxSlideDirection(state, tileId, false) !== backDirection(dir);
  }
  return true;
}

function advanceLynxMainRandom4(state: EngineState): number {
  const current = BigInt(state.replay.randomState.main.value);
  const next = ((current * 1103515245n) + 12345n) & 0x7fffffffn;
  state.replay.randomState.main.value = String(next);
  return Number(next >> 29n);
}

function advanceLynxPrng(state: EngineState): number {
  let prng1 = state.replay.randomState.lynx.prng1 & 0xff;
  let prng2 = state.replay.randomState.lynx.prng2 & 0xff;
  let n = ((prng1 >> 2) - prng1) & 0xff;
  if ((prng1 & 0x02) === 0) {
    n = (n - 1) & 0xff;
  }
  prng1 = ((prng1 >> 1) | (prng2 & 0x80)) & 0xff;
  prng2 = ((prng2 << 1) | (n & 0x01)) & 0xff;
  state.replay.randomState.lynx.prng1 = prng1;
  state.replay.randomState.lynx.prng2 = prng2;
  return (prng1 ^ prng2) & 0xff;
}

function left(dir: number): number {
  switch (dir) {
    case 1:
      return 2;
    case 2:
      return 4;
    case 4:
      return 8;
    case 8:
      return 1;
    default:
      return dir;
  }
}

function right(dir: number): number {
  switch (dir) {
    case 1:
      return 8;
    case 8:
      return 4;
    case 4:
      return 2;
    case 2:
      return 1;
    default:
      return dir;
  }
}

function back(dir: number): number {
  switch (dir) {
    case 1:
      return 4;
    case 4:
      return 1;
    case 2:
      return 8;
    case 8:
      return 2;
    default:
      return dir;
  }
}

function updateLynxViewChip(state: EngineState): void {
  state.chip = {
    id: -1,
    layer: -1,
    dir: "none",
    position: roundedBoardPosition(state.view.x, state.view.y, MS_GRID_WIDTH, MS_GRID_HEIGHT, 8),
    state: 0,
    source: "view",
  };
}

function collectChipAtPosition(state: EngineState, actorId: number, pos: number): boolean {
  if (!hasBoardCell(state.map.cells, pos)) {
    return false;
  }

  if (topTile(state.map.cells, pos).id === MS_TILE.ICChip && actorCollectsChips(lynxActorGlobalProgressKind(actorId))) {
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.inventory.chipsNeeded = Math.max(0, state.inventory.chipsNeeded - 1);
    state.map.hash = mapHash(state.map.cells);
    return true;
  }

  return false;
}

function collectLynxItemAtPosition(state: EngineState, actorId: number, pos: number): number {
  const chipInventory = lynxChipInventoryOwner(state.inventory);
  const itemCollectionKind = lynxActorItemCollectionKind(actorId);
  if (collectChipAtPosition(state, actorId, pos)) {
    return 1 << LYNX_SOUND.IcCollected;
  }

  if (!hasBoardCell(state.map.cells, pos)) {
    return 0;
  }

  const tile = topTile(state.map.cells, pos);
  const inventorySlot = lynxInventorySlot(tile.id);
  const inventoryIndex = lynxInventoryIndex(tile.id);
  if (inventorySlot !== null && inventoryIndex !== null && actorCollectionAllowsSlot(itemCollectionKind, inventorySlot)) {
    if (inventorySlot === "tools") {
      queueLynxToolInventoryReplacement(lynxRuntimeState(state), state.inventory, tile.id, pos, activeLynxLayerZ(state));
    } else {
      actorInventoryCollectIndexedItem(chipInventory, inventorySlot, inventoryIndex);
    }
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.map.hash = mapHash(state.map.cells);
    return 1 << LYNX_SOUND.ItemCollected;
  }

  return 0;
}

function hasLynxBoots(state: EngineState, tileId: number): boolean {
  const chipInventory = lynxChipInventoryOwner(state.inventory);
  const inventorySlot = lynxInventorySlot(tileId);
  const inventoryIndex = lynxInventoryIndex(tileId);
  return inventorySlot === "boots" && inventoryIndex !== null ? actorInventoryHasBoot(chipInventory, inventoryIndex) : false;
}

function lynxChipMovementSpeed(state: EngineState, floorId: number, moveKind: LynxMoveKind = "planar"): number {
  let speed = 2;

  if (moveKind === "air" || moveKind === "elevator") {
    speed *= 2;
  } else if (isLynxSlide(floorId) && !hasLynxBoots(state, MS_TILE.Boots_Slide)) {
    speed *= 2;
  } else if (isLynxIce(floorId) && !hasLynxBoots(state, MS_TILE.Boots_Ice)) {
    speed *= 2;
  }

  return speed;
}

function canLynxChipEnterCell(state: EngineState, pos: number, dir: number): boolean {
  return lynxChipTargetCellAllowsEntry(probeLynxChipTargetCellForState(state, pos, dir));
}

function canLynxChipPushIntoClaimedCell(state: EngineState, pos: number, dir: number): boolean {
  return lynxChipTargetCellAllowsPush(probeLynxChipTargetCellForState(state, pos, dir, true));
}

function probeLynxChipMoveDirection(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  dir: number,
): { canMove: boolean; pushBlockPos: number | null } {
  if (!canLynxExitTile(state, topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), MS_TILE.Chip, dir, false)) {
    return { canMove: false, pushBlockPos: null };
  }
  const targetStep = advanceToCell(state.map.cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return { canMove: false, pushBlockPos: null };
  }
  const { pos: targetPos, cell: target } = targetStep;

  if (hasTopTileFlags(state.map.cells, targetPos, LYNX_CELL_FLAG.Claimed)) {
    const block = findClaimedLynxBlockOnActiveLayer(state, actors, targetPos);
    if (!block || block.hidden || block.moving > 0 || (block.deferPush && !lynxRuntimeState(state).chipTeleported)) {
      return { canMove: false, pushBlockPos: null };
    }
    const targetProbe = probeLynxChipTargetCellForState(state, targetPos, dir, true);
    if (!lynxChipTargetCellAllowsPush(targetProbe)) {
      return { canMove: false, pushBlockPos: null };
    }
    const canPush = canLynxCreatureStartMovement(state, actors, block, dir);
    if (lynxChipTargetCellStopsOnPush(targetProbe)) {
      return {
        canMove: false,
        pushBlockPos: canPush ? targetPos : null,
      };
    }
    return {
      canMove: canPush,
      pushBlockPos: canPush ? targetPos : null,
    };
  }

  return {
    canMove: canLynxChipEnterCell(state, targetPos, dir),
    pushBlockPos: null,
  };
}

function markPendingLynxChipPush(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  endGameTicksElapsed: number | null,
  inputCode: number,
): void {
  if (chipMoving !== 0 || endGameTicksElapsed !== null || !isDirectionalInput(inputCode)) {
    return;
  }

  const floorBeforeMove = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
  const forcedSlip =
    (isLynxSlide(floorBeforeMove) && !hasLynxBoots(state, MS_TILE.Boots_Slide)) ||
    (isLynxIce(floorBeforeMove) && !hasLynxBoots(state, MS_TILE.Boots_Ice));

  if (forcedSlip || !isDiagonalInput(inputCode)) {
    return;
  }

  if (isDiagonalInput(inputCode)) {
    if ((chipDir & inputCode) === 0) {
      const horizontalDir = inputCode & (2 | 8);
      if (horizontalDir !== 0) {
        const horizontalProbe = probeLynxChipMoveDirection(state, actors, chipPos, horizontalDir);
        const verticalDir = inputCode & (1 | 4);
        const verticalProbe =
          verticalDir !== 0 ? probeLynxChipMoveDirection(state, actors, chipPos, verticalDir) : { canMove: false, pushBlockPos: null };
        const horizontalBlock =
          horizontalProbe.pushBlockPos !== null
            ? findLynxBlockActor(actors, horizontalProbe.pushBlockPos, activeLynxLayerZ(state))
            : null;
        if ((!horizontalProbe.canMove || horizontalBlock?.dormant) && horizontalProbe.pushBlockPos !== null) {
          queuePendingLynxBlockPush(state, actors, horizontalProbe.pushBlockPos, horizontalDir);
        }
        const slappedBlueWallPos =
          !horizontalProbe.canMove && verticalProbe.canMove
            ? findSlappedLynxBlueWallRevealPos(state, chipPos, horizontalDir)
            : null;
        if (slappedBlueWallPos !== null) {
          addLynxTileOverlay(
            state,
            activeLynxLayerZ(state),
            slappedBlueWallPos,
            "blue-wall-reveal",
            BLUE_WALL_VISUAL_REVEAL_TTL,
          );
        }
      }
      return;
    }

    if (!forcedSlip && !canLynxExitTile(state, floorBeforeMove, MS_TILE.Chip, inputCode, false)) {
      return;
    }

    const sameDir = chipDir;
    const otherDir = inputCode ^ chipDir;
    const sameProbe = probeLynxChipMoveDirection(state, actors, chipPos, sameDir);
    const otherProbe = probeLynxChipMoveDirection(state, actors, chipPos, otherDir);
    if (sameProbe.canMove && otherProbe.pushBlockPos !== null) {
      queuePendingLynxBlockPush(state, actors, otherProbe.pushBlockPos, otherDir);
    }
    const slappedBlueWallPos = sameProbe.canMove ? findSlappedLynxBlueWallRevealPos(state, chipPos, otherDir) : null;
    if (slappedBlueWallPos !== null) {
      addLynxTileOverlay(
        state,
        activeLynxLayerZ(state),
        slappedBlueWallPos,
        "blue-wall-reveal",
        BLUE_WALL_VISUAL_REVEAL_TTL,
      );
    }
    return;
  }
}

function queuePendingLynxBlockPush(
  state: EngineState,
  actors: LynxRuntimeActor[],
  targetPos: number,
  dir: number,
): void {
  const block = findLynxBlockActor(actors, targetPos, activeLynxLayerZ(state));
  if (!block || block.hidden || block.moving > 0 || (block.deferPush && !lynxRuntimeState(state).chipTeleported)) {
    return;
  }

  block.dormant = false;
  block.intentDir = dir;
  block.dir = dir;
  block.pushed = true;
}

function pendingLynxChipPushInputCode(
  state: EngineState,
  chipDir: number,
  chipMoving: number,
  endGameTicksElapsed: number | null,
  queuedChipInputCode: number,
  queuedReplayInputCode: number,
  currentInputCode: number,
): number {
  if (chipMoving !== 0 || endGameTicksElapsed !== null) {
    return 0;
  }

  if (lynxRuntimeState(state).chipTeleported) {
    return chipDir;
  }

  return queuedChipInputCode || queuedReplayInputCode || currentInputCode;
}

function previewLynxChipPushRequest(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  inputCode: number,
): void {
  if (!isDirectionalInput(inputCode) || isDiagonalInput(inputCode)) {
    return;
  }

  const probe = probeLynxChipMoveDirection(state, actors, chipPos, inputCode);
  if (probe.pushBlockPos !== null) {
    queuePendingLynxBlockPush(state, actors, probe.pushBlockPos, inputCode);
  }
}

function shouldPreviewLynxForcedSlidePush(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  inputCode: number,
): boolean {
  if (!isDirectionalInput(inputCode) || isDiagonalInput(inputCode) || !canAdvanceLynxPosition(chipPos, inputCode, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
    return false;
  }

  const targetStep = advanceToCell(state.map.cells, chipPos, inputCode, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return false;
  }
  const { pos: targetPos } = targetStep;

  const block = findLynxBlockActor(actors, targetPos, activeLynxLayerZ(state));
  return !!block && !block.hidden && block.dormant;
}

function resolveLynxButtonEffects(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], pos: number, tileId: number): number {
  switch (lynxButtonAction(tileId)) {
    case "turn-tanks":
      queueLynxTankReversals(state, actors);
      return 1 << LYNX_SOUND.ButtonPushed;
    case "toggle-walls":
      lynxRuntimeState(state).toggleWallsPending = !lynxRuntimeState(state).toggleWallsPending;
      return 1 << LYNX_SOUND.ButtonPushed;
    case "activate-cloner":
      return activateLynxCloner(state, level, actors, pos) ? 1 << LYNX_SOUND.ButtonPushed : 0;
    case "spring-trap":
      return 1 << LYNX_SOUND.ButtonPushed;
    default:
      return 0;
  }
}

function resolveLynxChipInputForCurrentState(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  inputCode: number,
): number {
  return resolveLynxChipInputDirection(chipDir, inputCode, {
    probeMove: (dir) => {
      const probe = probeLynxChipMoveDirection(state, actors, chipPos, dir);
      if (probe.pushBlockPos !== null) {
        queuePendingLynxBlockPush(state, actors, probe.pushBlockPos, dir);
      }
      return probe;
    },
    isDormantBlockAt: (pos) => {
      const block = findLynxBlockActor(actors, pos, activeLynxLayerZ(state));
      return !!block && !block.hidden && block.dormant;
    },
  });
}

function resolveLynxCreatureArrivalEffects(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  pos: number,
  tileId: number,
): number {
  switch (lynxChipEnterAction(tileId)) {
    case "trap":
      return 1 << LYNX_SOUND.TrapEntered;
    case "button":
      return resolveLynxButtonEffects(state, level, actors, pos, tileId);
    default:
      return 0;
  }
}

function revealLynxHiddenWall(state: EngineState, pos: number): boolean {
  const cell = state.map.cells[pos];
  if (!cell) {
    return false;
  }
  if (cell.top.id !== MS_TILE.HiddenWall_Temp && cell.top.id !== MS_TILE.BlueWall_Real) {
    return false;
  }

  replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
  state.map.hash = mapHash(state.map.cells);
  return true;
}

function canLynxChipEnterAfterPushingBlock(
  state: EngineState,
  targetPos: number,
  dir: number,
  targetEntryProbe: ReturnType<typeof probeLynxChipTargetCellForState>,
): boolean {
  if (lynxChipTargetCellStopsOnPush(targetEntryProbe)) {
    revealLynxHiddenWall(state, targetPos);
    return false;
  }

  if (revealLynxHiddenWall(state, targetPos)) {
    return false;
  }

  return lynxChipTargetCellAllowsEntry(probeLynxChipTargetCellForState(state, targetPos, dir));
}

function resolveLynxChipArrival(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  pos: number,
): ArrivalResult {
  const chipInventory = lynxChipInventoryOwner(state.inventory);
  const cell = state.map.cells[pos];
  if (!cell) {
    return noArrival();
  }

  const keyIndex = lynxDoorKeyIndex(cell.top.id);
  if (keyIndex !== null && actorInventoryUseKey(chipInventory, keyIndex, { consume: keyIndex !== 3 })) {
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.map.hash = mapHash(state.map.cells);
    return resolvedArrival(1 << LYNX_SOUND.DoorOpened);
  }

  switch (lynxChipEnterAction(cell.top.id)) {
    case "open-socket":
      if (state.inventory.chipsNeeded === 0) {
        promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
        state.map.hash = mapHash(state.map.cells);
        return resolvedArrival(1 << LYNX_SOUND.SocketOpened);
      }
      break;
    case "clear-floor":
      replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Empty });
      state.map.hash = mapHash(state.map.cells);
      return resolvedArrival(1 << LYNX_SOUND.TileEmptied);
    case "popup-wall":
      replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
      state.map.hash = mapHash(state.map.cells);
      return resolvedArrival(1 << LYNX_SOUND.WallCreated);
    case "steal-boots":
      return applyLynxActorThiefHook(state, MS_TILE.Chip, chipInventory)
        ? resolvedArrival(1 << LYNX_SOUND.BootsStolen)
        : noArrival();
    case "button":
      return resolvedArrival(resolveLynxButtonEffects(state, level, actors, pos, cell.top.id));
    case "trap":
      return resolvedArrival(1 << LYNX_SOUND.TrapEntered);
    case "exit":
      return completedArrival(1 << LYNX_SOUND.ChipWins);
  }

  return noArrival();
}

function resolveCompletedLynxChipMove(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
): LynxEndGameState & { chipPos: number; chipDir: number } {
  clearLynxCouldntMove(state);
  const floorAfterMove = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);

  switch (lynxChipEnterAction(floorAfterMove)) {
    case "water-death":
      if (!hasLynxBoots(state, MS_TILE.Boots_Water)) {
        return {
          chipDir,
          ...failLynxChip(
            state,
            actors,
            chipPos,
            chipDir,
            0,
            endGameTicksElapsed,
            endGameResult,
            endGameAnimationTileId,
            endGameAnimationFrame,
            "drowned",
          ),
        };
      }
      break;
    case "fire-death":
      if (!hasLynxBoots(state, MS_TILE.Boots_Fire)) {
        return {
          chipDir,
          ...failLynxChip(
            state,
            actors,
            chipPos,
            chipDir,
            0,
            endGameTicksElapsed,
            endGameResult,
            endGameAnimationTileId,
            endGameAnimationFrame,
            "burned",
          ),
        };
      }
      break;
    case "explode-bomb":
      promoteBottomTile(state.map.cells, chipPos, MS_TILE.Empty);
      state.map.hash = mapHash(state.map.cells);
      return {
        chipDir,
        ...failLynxChip(
          state,
          actors,
          chipPos,
          chipDir,
          0,
          endGameTicksElapsed,
          endGameResult,
          endGameAnimationTileId,
          endGameAnimationFrame,
          "bombed",
        ),
      };
  }

  const arrival = resolveLynxChipArrival(state, level, actors, chipPos);
  state.soundEffects |= arrival.soundEffects;
  if (arrivalCompleted(arrival) && endGameTicksElapsed === null) {
    const endGame = startLynxEndGame(
      state,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
      "completed",
      null,
    );
    endGameTicksElapsed = endGame.endGameTicksElapsed;
    endGameResult = endGame.endGameResult;
    endGameAnimationTileId = endGame.endGameAnimationTileId;
    endGameAnimationFrame = endGame.endGameAnimationFrame;
  }
  state.soundEffects |= collectLynxItemAtPosition(state, MS_TILE.Chip, chipPos);
  const resolvedFloorAfterMove = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
  if (lynxButtonAction(floorAfterMove) === "spring-trap") {
    springLynxTrap(state, level, actors, chipPos);
  }
  if (isLynxIce(resolvedFloorAfterMove)) {
    if (chipMoveKind === "air") {
      lynxRuntimeState(state).chipIgnoreIceFromAir = true;
    } else {
      chipDir = applyLynxIceWallTurn(chipDir, resolvedFloorAfterMove);
    }
  }

  return {
    chipPos,
    chipDir,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  };
}

export const LYNX_SOUND = {
  ChipLoses: 0,
  ChipWins: 1,
  TimeOut: 2,
  TimeLow: 3,
  Derezz: 4,
  CantMove: 5,
  IcCollected: 6,
  ItemCollected: 7,
  BootsStolen: 8,
  Teleporting: 9,
  DoorOpened: 10,
  SocketOpened: 11,
  ButtonPushed: 12,
  TileEmptied: 13,
  WallCreated: 14,
  TrapEntered: 15,
  BombExplodes: 16,
  WaterSplash: 17,
  BlockMoving: 18,
  SkatingForward: 19,
  SkatingTurn: 20,
  Sliding: 21,
  SlideWalking: 22,
  IceWalking: 23,
  WaterWalking: 24,
  FireWalking: 25,
} as const;

const LYNX_ONE_SHOT_MASK = (1 << 18) - 1;
export const LYNX_FLOOR_SOUND_MASK =
  (1 << LYNX_SOUND.SkatingForward) |
  (1 << LYNX_SOUND.SkatingTurn) |
  (1 << LYNX_SOUND.Sliding) |
  (1 << LYNX_SOUND.SlideWalking) |
  (1 << LYNX_SOUND.IceWalking) |
  (1 << LYNX_SOUND.WaterWalking) |
  (1 << LYNX_SOUND.FireWalking);

function resetLynxFloorSounds(state: EngineState): void {
  state.soundEffects &= ~LYNX_FLOOR_SOUND_MASK;
}

function toggleLynxWalls(state: EngineState): void {
  for (const layer of state.map.layers ?? [{ z: state.map.cells[0]?.position.z ?? 1, cells: state.map.cells }]) {
    for (const cell of layer.cells) {
      if (lynxTileHasTag(cell.top.id, "toggleable")) {
        cell.top.id = lynxToggledWallTileId(cell.top.id);
      }
      if (lynxTileHasTag(cell.bottom.id, "toggleable")) {
        cell.bottom.id = lynxToggledWallTileId(cell.bottom.id);
      }
    }
  }
}

function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
}

function isLynxSlide(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "slide";
}

function getLynxSlideDirection(state: EngineState, floorId: number, advance: boolean): number {
  const fixedDir = lynxFixedSlideDirection(floorId);
  if (fixedDir !== 0) {
    return fixedDir;
  }
  if (floorId !== MS_TILE.Slide_Random) {
    return 0;
  }
  const runtime = lynxRuntimeState(state);
  if (advance) {
    runtime.lastRandomSlideDir = right(runtime.lastRandomSlideDir || 1);
  }
  return runtime.lastRandomSlideDir || 1;
}

function applyLynxIceWallTurn(dir: number, floorId: number): number {
  return lynxIceWallTurn(floorId, dir);
}

function getLynxChipForcedMove(
  context: LynxTickContext,
  floorId: number,
  chipDir: number,
): {
  dir: number;
  discardInput: boolean;
  moveKind?: "air" | "elevator";
} {
  const runtime = lynxRuntimeState(context.state);
  if (chipShouldStartLynxAirMove(context, floorId)) {
    return { dir: 0, discardInput: true, moveKind: "air" };
  }
  if (
    isLynxElevator(floorId) &&
    canLynxChipUseElevator(
      context,
      chipDir,
      (pushDir, targetZ) => {
        const blockingActor = context.findVisibleActorAt(context.chipPos, targetZ);
        if (!blockingActor) {
          return false;
        }
        return withLynxLayer(context.state, targetZ, () =>
          canLynxCreatureStartMovement(context.state, context.actors, blockingActor as LynxRuntimeActor, pushDir),
        );
      },
    )
  ) {
    return { dir: 0, discardInput: true, moveKind: "elevator" };
  }
  // Native Lynx does not apply forced-floor carry on the opening tick.
  if (context.state.timer.currentTime < 0) {
    return { dir: 0, discardInput: false };
  }
  if (runtime.chipTeleported) {
    runtime.chipTeleported = false;
    return { dir: chipDir, discardInput: true };
  }
  if (isLynxSlide(floorId)) {
    return hasLynxBoots(context.state, MS_TILE.Boots_Slide)
      ? { dir: 0, discardInput: false }
      : { dir: getLynxSlideDirection(context.state, floorId, true), discardInput: !runtime.chipSlideToken };
  }
  if (isLynxIce(floorId)) {
    if (runtime.chipIgnoreIceFromAir) {
      return { dir: 0, discardInput: false };
    }
    return hasLynxBoots(context.state, MS_TILE.Boots_Ice)
      ? { dir: 0, discardInput: false }
      : { dir: chipDir, discardInput: true };
  }
  return { dir: 0, discardInput: false };
}

function forcedLynxActorDirection(state: EngineState, actor: LynxRuntimeActor, floorId: number, currentTime: number): number {
  if (currentTime === 0 && !isLynxAir(floorId)) {
    return 0;
  }
  if (isLynxSlide(floorId)) {
    return getLynxSlideDirection(state, floorId, true);
  }
  if (isLynxIce(floorId)) {
    if (actor.ignoreIceFromAir) {
      return 0;
    }
    return actor.dir;
  }
  return 0;
}

function updateLynxChipStartMovementState(state: EngineState, floorId: number, chosenInputCode: number): void {
  const runtime = lynxRuntimeState(state);

  if (!isLynxIce(floorId) || chosenInputCode !== 0) {
    runtime.chipIgnoreIceFromAir = false;
  }

  if (!hasLynxBoots(state, MS_TILE.Boots_Slide)) {
    if (isLynxSlide(floorId) && chosenInputCode === 0) {
      runtime.chipSlideToken = true;
    } else if (!isLynxIce(floorId) || hasLynxBoots(state, MS_TILE.Boots_Ice)) {
      runtime.chipSlideToken = false;
    }
  }
}

function turnLynxChipAroundOnBlockedIce(state: EngineState, floorId: number, attemptedDir: number): number {
  if (!isLynxIce(floorId) || hasLynxBoots(state, MS_TILE.Boots_Ice)) {
    return attemptedDir;
  }

  return applyLynxIceWallTurn(backDirection(attemptedDir), floorId);
}

function updateLynxViewFromMovement(
  state: EngineState,
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  chipMoveKind: LynxMoveKind = "planar",
): void {
  let viewX = (chipPos % MS_GRID_WIDTH) * 8;
  let viewY = Math.floor(chipPos / MS_GRID_WIDTH) * 8;

  if (chipMoving > 0 && chipMoveKind === "planar") {
    switch (chipDir) {
      case 1:
        viewY += chipMoving;
        break;
      case 2:
        viewX += chipMoving;
        break;
      case 4:
        viewY -= chipMoving;
        break;
      case 8:
        viewX -= chipMoving;
        break;
      default:
        break;
    }
  }

  state.view = { x: viewX, y: viewY };
  updateLynxViewChip(state);
}

function canLynxChipExitTeleportThroughBlock(
  state: EngineState,
  actors: LynxRuntimeActor[],
  exitPos: number,
  dir: number,
): boolean {
  const block = findLynxBlockActor(actors, exitPos, activeLynxLayerZ(state));
  if (!block || block.hidden || block.moving > 0 || (block.deferPush && !lynxRuntimeState(state).chipTeleported)) {
    return false;
  }
  return canLynxCreatureStartMovement(state, actors, block, dir) && canLynxChipEnterCell(state, exitPos, dir);
}

function createLynxTeleportContext(state: EngineState, actors: LynxRuntimeActor[]): LynxTeleportContext {
  return {
    state,
    actors,
    activeLayerZ: () => activeLynxLayerZ(state),
    withLayer: (z, run) => withLynxLayer(state, z, run),
    chipActsWallForMobs: (pos, z) => lynxChipActsWallForMobs(state, pos, z),
    canChipEnter: (pos, dir) => canLynxChipEnterCell(state, pos, dir),
    canChipExitTeleportThroughBlock: (exitPos, dir) => canLynxChipExitTeleportThroughBlock(state, actors, exitPos, dir),
    canCreatureEnter: (tileId, actorId, dir) => canLynxCreatureEnter(tileId, actorId, dir),
    effectiveTargetTileId: (tileId) => effectiveLynxTargetTileId(state, tileId),
    markChipTeleported: () => {
      lynxRuntimeState(state).chipTeleported = true;
      state.soundEffects |= 1 << LYNX_SOUND.Teleporting;
    },
    settleChipTeleportDrop: (originPos, originZ) =>
      settleLynxPrimedToolDrop(
        state,
        lynxRuntimeState(state),
        state.inventory,
        originPos,
        originZ,
        (layerZ, run) => withLynxLayer(state, layerZ, run),
      ),
  };
}

function resolveLynxTeleports(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
): number {
  return resolveLynxTeleportsWithContext(createLynxTeleportContext(state, actors), chipPos, chipDir, chipMoving);
}

function resolveLynxPostChipMovement(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
): LynxPostMoveResolution {
  let chipArrivedThisTick = false;
  if (chipMoving > 0) {
    const floor = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
    const speed = lynxChipMovementSpeed(state, floor, chipMoveKind);

    chipMoving = Math.max(0, chipMoving - speed);
    if (chipMoving === 0) {
      chipArrivedThisTick = true;
      const completed = resolveCompletedLynxChipMove(
        state,
        level,
        actors,
        chipPos,
        chipDir,
        chipMoveKind,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      );
      chipPos = completed.chipPos;
      chipDir = completed.chipDir;
      chipMoveKind = "planar";
      endGameTicksElapsed = completed.endGameTicksElapsed;
      endGameResult = completed.endGameResult;
      endGameAnimationTileId = completed.endGameAnimationTileId;
      endGameAnimationFrame = completed.endGameAnimationFrame;
    }
  }

  if (
    !chipArrivedThisTick &&
    chipMoving === 0 &&
    lynxButtonAction(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty)) === "spring-trap"
  ) {
    springLynxTrap(state, level, actors, chipPos);
  }

  chipPos = resolveLynxTeleports(state, actors, chipPos, chipDir, chipMoving);
  clearDeferredLynxBlockPushes(actors);
  state.map.hash = mapHash(state.map.cells);

  return {
    chipPos,
    chipDir,
    chipMoving,
    chipMoveKind,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  };
}

function finalizeLynxTickBookkeeping(
  state: EngineState,
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
): Pick<LynxEndGameState, "endGameTicksElapsed" | "endGameResult"> {
  state.timer = advanceTimer(state.timer, 1, MS_TICKS_PER_SECOND);
  updateLynxViewFromMovement(state, chipPos, chipDir, chipMoving, chipMoveKind);
  const displayFloor = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
  if (lynxTileHasTag(displayFloor, "hint") && chipMoving === 0) {
    state.statusFlags |= MS_STATUS_FLAG.ShowHint;
  } else {
    state.statusFlags &= ~MS_STATUS_FLAG.ShowHint;
  }

  if (chipMoving > 0) {
    resetLynxFloorSounds(state);
    switch (
      lynxChipMoveSoundAction(displayFloor, {
        hasFireBoots: hasLynxBoots(state, MS_TILE.Boots_Fire),
        hasWaterBoots: hasLynxBoots(state, MS_TILE.Boots_Water),
        hasIceBoots: hasLynxBoots(state, MS_TILE.Boots_Ice),
        hasSlideBoots: hasLynxBoots(state, MS_TILE.Boots_Slide),
      })
    ) {
      case "fire-walk":
        state.soundEffects |= 1 << LYNX_SOUND.FireWalking;
        break;
      case "water-walk":
        state.soundEffects |= 1 << LYNX_SOUND.WaterWalking;
        break;
      case "ice-walk":
        state.soundEffects |= 1 << LYNX_SOUND.IceWalking;
        break;
      case "skate-forward":
        state.soundEffects |= 1 << LYNX_SOUND.SkatingForward;
        break;
      case "skate-turn":
        state.soundEffects |= 1 << LYNX_SOUND.SkatingTurn;
        break;
      case "slide-walk":
        state.soundEffects |= 1 << LYNX_SOUND.SlideWalking;
        break;
      case "slide":
        state.soundEffects |= 1 << LYNX_SOUND.Sliding;
        break;
    }
  }

  const finalizedEndGame = finalizeLynxEndGame(state, endGameTicksElapsed, endGameResult);
  state.timer = syncTimerSecondsPlayed(state.timer, MS_TICKS_PER_SECOND);
  state.map.hash = mapHash(state.map.cells);
  return finalizedEndGame;
}

function canLynxCreatureStartMovement(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  dir: number,
  releasing = false,
  clearAnimations = false,
): boolean {
  const floorFrom = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
  if (!canLynxExitTile(state, floorFrom, actor.id, dir, releasing)) {
    return false;
  }
  const targetStep = advanceToCell(state.map.cells, actor.pos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return false;
  }
  const { pos: targetPos, cell: target } = targetStep;
  if (lynxChipActsWallForMobs(state, targetPos, actor.z ?? activeLynxLayerZ(state))) {
    return false;
  }
  if (
    (target.top.state & LYNX_CELL_FLAG.Claimed) !== 0 ||
    !canLynxCreatureEnter(effectiveLynxTargetTileId(state, target.top.id), actor.id, dir)
  ) {
    return false;
  }

  if (clearAnimations && (target.top.state & LYNX_CELL_FLAG.Animated) !== 0) {
    clearLynxAnimationAt(state, actors, targetPos);
  }

  return true;
}

function createLynxCreatureControllerContext(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  currentTime: number,
  stepping: number,
): LynxCreatureControllerContext {
  return {
    chipPos,
    currentTime,
    stepping,
    withLayer: (z, run) => withLynxLayer(state, z, run),
    floorAt: (pos) => topTileIdOr(state.map.cells, pos, MS_TILE.Empty),
    canStart: (actor, dir) => canLynxCreatureStartMovement(state, actors, actor as LynxRuntimeActor, dir, false, true),
    chooseBlobDirection: () => {
      const clockwise = [1, 8, 4, 2];
      return clockwise[advanceLynxMainRandom4(state)] ?? 0;
    },
    chooseWalkerRandomDirection: (dir) => [dir, right(dir), back(dir), left(dir)][advanceLynxPrng(state) & 3] ?? dir,
    slideDirection: (floorId) => getLynxSlideDirection(state, floorId, true),
  };
}

function chooseLynxCreatureMoveForTick(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  chipPos: number,
  currentTime: number,
  stepping: number,
): void {
  chooseLynxCreatureMoveForTickWithContext(
    createLynxCreatureControllerContext(state, actors, chipPos, currentTime, stepping),
    actor,
  );
}

function startLynxCreatureMovement(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  dir: number,
  releasing = false,
): MovementAttemptResult {
  actor.dir = dir;
  const floorFrom = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);

  const targetPos = nextPosition(actor.pos, dir, MS_GRID_WIDTH);
  if (!canLynxCreatureStartMovement(state, actors, actor, dir, releasing, true)) {
    if (isLynxIce(floorFrom)) {
      actor.dir = applyLynxIceWallTurn(backDirection(dir), floorFrom);
    }
    return blockedMovement();
  }

  const target = state.map.cells[targetPos]!;
  if ((target.top.state & LYNX_CELL_FLAG.Animated) !== 0) {
    clearLynxAnimationAt(state, actors, targetPos);
  }

  if (actor.id === MS_TILE.Block) {
    actor.dormant = false;
  }

  removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
  actor.pos = targetPos;
  actor.moving = 8;
  actor.frame = 4;
  actor.moveKind = "planar";
  actor.ignoreIceFromAir = false;
  addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
  if (actor.pushed) {
    state.soundEffects |= 1 << LYNX_SOUND.BlockMoving;
  }
  return movedMovement();
}

function finishLynxActorMovement(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
): ArrivalResult {
  const cell = state.map.cells[actor.pos];
  if (!cell) {
    return noArrival();
  }

  const moveKind = actor.moveKind ?? "planar";
  actor.moveKind = "planar";
  actor.ignoreIceFromAir = false;
  if (isLynxIce(cell.top.id) && moveKind !== "air" && moveKind !== "elevator") {
    actor.dir = applyLynxIceWallTurn(actor.dir, cell.top.id);
  } else if (isLynxIce(cell.top.id) && (moveKind === "air" || moveKind === "elevator")) {
    actor.ignoreIceFromAir = true;
  }

  const arrivalAction = lynxCreatureArrivalAction(cell.top.id, actor.id);
  const arrivalAnimationTileId = lynxAnimationTileId(lynxArrivalAnimationKind(cell.top.id, actor.id));

  if (actor.id === MS_TILE.Block) {
    if (arrivalAction === "block-water") {
      replaceTopTile(state.map.cells, actor.pos, { ...cell.top, id: MS_TILE.Dirt });
      removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      removeLynxActor(state, actors, actor, arrivalAnimationTileId ?? LYNX_ANIMATION_TILE.Water_Splash);
      state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
      const arrival = removedOnArrival(1 << LYNX_SOUND.WaterSplash);
      state.map.hash = mapHash(state.map.cells);
      return arrival;
    } else if (arrivalAction === "block-bomb") {
      promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
      removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      removeLynxActor(state, actors, actor, arrivalAnimationTileId ?? LYNX_ANIMATION_TILE.Bomb_Explosion);
      state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
      const arrival = removedOnArrival(1 << LYNX_SOUND.BombExplodes);
      state.map.hash = mapHash(state.map.cells);
      return arrival;
    } else if (arrivalAction === "clear-key-blue") {
      promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
      addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    }
    actor.deferPush = false;
    actor.deferPushArmed = false;
    const soundEffects = resolveLynxCreatureArrivalEffects(state, level, actors, actor.pos, cell.top.id);
    state.soundEffects |= soundEffects;
    state.map.hash = mapHash(state.map.cells);
    return soundEffects === 0 ? noArrival() : resolvedArrival(soundEffects);
  }

  if (arrivalAction === "creature-water") {
    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, actor, arrivalAnimationTileId ?? LYNX_ANIMATION_TILE.Water_Splash);
    state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
    const arrival = removedOnArrival(1 << LYNX_SOUND.WaterSplash);
    state.map.hash = mapHash(state.map.cells);
    return arrival;
  }

  if (arrivalAction === "creature-bomb") {
    promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, actor, arrivalAnimationTileId ?? LYNX_ANIMATION_TILE.Bomb_Explosion);
    state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
    const arrival = removedOnArrival(1 << LYNX_SOUND.BombExplodes);
    state.map.hash = mapHash(state.map.cells);
    return arrival;
  }

  if (arrivalAction === "clear-key-blue") {
    promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
    addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    state.map.hash = mapHash(state.map.cells);
  }

  const soundEffects = resolveLynxCreatureArrivalEffects(state, level, actors, actor.pos, cell.top.id);
  state.soundEffects |= soundEffects;
  return soundEffects === 0 ? noArrival() : resolvedArrival(soundEffects);
}

function advanceLynxCreature(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  currentTime: number,
  chipPos = -1,
  chipZ = activeLynxLayerZ(state),
): void {
  const tickContext = createLynxTickContext(state, actors, chipPos, chipZ);
  withLynxLayer(state, actor.z ?? 1, () => {
    if (actor.hidden) {
      return;
    }

    if (actor.moving <= 0) {
      const floorBeforeMove = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
      if (isLynxAir(floorBeforeMove)) {
        const targetZ = Math.max(1, (actor.z ?? 1) - 1);
        const lowerCells = tickContext.lowerCells(actor.z);
        if (!hasVerticalSupport(resolveLynxNonChipSupportBelow(tickContext, lowerCells, actor.pos, targetZ, actor.z ?? 1))) {
          if (!startLynxActorAirMovement(state, actor, { cellsForZ: (z) => lynxCellsForZ(state.map, z) })) {
            return;
          }
        } else {
          actor.moveKind = "planar";
          actor.ignoreIceFromAir = false;
        }
      }

      if (actor.moving <= 0 && isLynxElevator(floorBeforeMove)) {
        if (
          startLynxActorElevatorMovement(
            tickContext,
            actor,
            { cellsForZ: (z) => lynxCellsForZ(state.map, z) },
          )
        ) {
          // Vertical move started; skip planar movement selection.
        } else {
          actor.moveKind = "planar";
        }
      }

      if (actor.moving <= 0) {
        const moveDir = actor.intentDir || actor.forcedDir || forcedLynxActorDirection(state, actor, floorBeforeMove, currentTime);
        actor.intentDir = 0;
        actor.forcedDir = 0;
        if (moveDir === 0 || !movementDidSucceed(startLynxCreatureMovement(state, actors, actor, moveDir))) {
          return;
        }
      }
    }

    const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
    let speed = actor.id === MS_TILE.Blob ? 1 : 2;
    if ((actor.moveKind ?? "planar") === "air" || (actor.moveKind ?? "planar") === "elevator" || isLynxSlide(floor) || isLynxIce(floor)) {
      speed *= 2;
    }
    actor.moving = Math.max(0, actor.moving - speed);
    actor.frame = Math.trunc(actor.moving / 2);
    if (actor.moving === 0) {
      finishLynxActorMovement(state, level, actors, actor);
    }
  });
}

function clearFinishedPushedBlocks(state: EngineState, actors: LynxRuntimeActor[]): void {
  for (const actor of actors) {
    if (!actor.pushed) {
      continue;
    }
    if (actor.hidden || actor.moving <= 0) {
      actor.pushed = false;
      state.soundEffects &= ~(1 << LYNX_SOUND.BlockMoving);
    }
  }
}

function clearDeferredLynxBlockPushes(actors: LynxRuntimeActor[]): void {
  for (const actor of actors) {
    if (!actor.deferPush) {
      continue;
    }
    if (actor.hidden) {
      actor.deferPush = false;
      actor.deferPushArmed = false;
      continue;
    }
    if (actor.moving > 0) {
      continue;
    }
    if (actor.deferPushArmed) {
      actor.deferPushArmed = false;
    } else {
      actor.deferPush = false;
      actor.deferPushArmed = false;
    }
  }
}

function findLynxBlockActor(actors: LynxRuntimeActor[], pos: number, z = 1): LynxRuntimeActor | null {
  return findVisibleActorAtPosition(actors, pos, (actor) => actor.id === MS_TILE.Block && (actor.z ?? 1) === z) ?? null;
}

function findLynxVisibleActorAt(actors: LynxRuntimeActor[], pos: number, z = 1): LynxRuntimeActor | null {
  return findVisibleActorAtPosition(actors, pos, (actor) => (actor.z ?? 1) === z) ?? null;
}

function detectLynxChipCollision(actors: LynxRuntimeActor[], chipPos: number, chipZ: number): {
  result: CollisionResult;
  actor: LynxRuntimeActor | null;
} {
  const actor = findLynxVisibleActorAt(actors, chipPos, chipZ);
  if (!actor) {
    return {
      result: noCollision(),
      actor: null,
    };
  }

  return {
    result: collided(),
    actor,
  };
}

function findClaimedLynxBlockOnActiveLayer(state: EngineState, actors: LynxRuntimeActor[], pos: number): LynxRuntimeActor | null {
  const activeZ = activeLynxLayerZ(state);
  return (
    findVisibleActorOnFlaggedTopCell(
      state.map.cells,
      actors,
      pos,
      LYNX_CELL_FLAG.Claimed,
      (actor) => actor.id === MS_TILE.Block && (actor.z ?? 1) === activeZ,
    ) ?? null
  );
}

function resolveLynxChipCollision(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
): {
  chipPos: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
  if (endGameTicksElapsed !== null) {
    return {
      chipPos,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  const collision = detectLynxChipCollision(actors, chipPos, activeLynxLayerZ(state));
  if (!collisionOccurred(collision.result)) {
    return {
      chipPos,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  const preserveCollidedActor = isLynxVerticalMoveKind(chipMoveKind) || isLynxVerticalMoveKind(collision.actor?.moveKind);
  return failLynxChip(
    state,
    actors,
    chipPos,
    chipDir,
    chipMoving,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
    "collided",
    collision.actor,
    preserveCollidedActor,
  );
}

function allocateLynxActorSlot(actors: LynxRuntimeActor[], actor: LynxRuntimeActor): LynxRuntimeActor {
  return storeActorInReusableHiddenSlot(actors, actor, (entry) => !entry.animationReserved);
}

function createLynxClonerSnapshot(sourceActor: LynxRuntimeActor, z: number): LynxRuntimeActor {
  return {
    ...sourceActor,
    z,
    intentDir: 0,
    forcedDir: 0,
    teleported: false,
    moving: 0,
    frame: 0,
    moveKind: "planar",
    ignoreIceFromAir: false,
    hidden: true,
    pushed: false,
    deferPush: false,
    deferPushArmed: false,
    animationReserved: false,
  };
}

function createLynxTrapClonerContext(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
): LynxTrapClonerContext<LynxRuntimeActor> {
  return {
    state,
    level,
    actors,
    activeLayerZ: () => activeLynxLayerZ(state),
    withLayer: (z, run) => withLynxLayer(state, z, run),
    findVisibleActorAt: (pos, z) => findLynxVisibleActorAt(actors, pos, z),
    buildCloneSnapshot: (sourceActor, z) => createLynxClonerSnapshot(sourceActor, z),
    allocateCloneSlot: (snapshot) => allocateLynxActorSlot(actors, snapshot),
    startCreatureMovement: (actor, dir, releasing) => startLynxCreatureMovement(state, actors, actor, dir, releasing),
    advanceCreature: (actor, currentTime) => advanceLynxCreature(state, level, actors, actor, currentTime),
    currentTime: state.timer.currentTime,
  };
}

function findLynxTrapTarget(level: LynxLevel, buttonPos: number, z = 1): number | null {
  return findLynxTrapTargetInLevel(level, buttonPos, z);
}

function queueLynxTankReversals(state: EngineState, actors: LynxRuntimeActor[]): void {
  for (const actor of actors) {
    if (actor.hidden || actor.id !== MS_TILE.Tank) {
      continue;
    }
    withLynxLayer(state, actor.z ?? 1, () => {
      const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
      if (lynxTileHasTag(floor, "cloner") || isLynxIce(floor)) {
        return;
      }
      actor.reversePending = !actor.reversePending;
    });
  }
}

function applyPendingLynxTankReversals(actors: LynxRuntimeActor[]): void {
  for (const actor of actors) {
    if (actor.hidden || !actor.reversePending) {
      continue;
    }
    actor.reversePending = false;
    if (actor.moving <= 0) {
      actor.dir = backDirection(actor.dir);
    }
  }
}

function runLynxInitialHousekeeping(state: EngineState, actors: LynxRuntimeActor[]): void {
  clearFinishedPushedBlocks(state, actors);
  applyPendingLynxTankReversals(actors);
  clearLynxTileOverlays(state);

  const runtime = lynxRuntimeState(state);
  runtime.trapReleaseCantMoveThisTick = false;
  if (runtime.toggleWallsPending) {
    toggleLynxWalls(state);
    runtime.toggleWallsPending = false;
  }
}

function tryPushLynxBlock(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  pos: number,
  dir: number,
): boolean {
  const block = findLynxBlockActor(actors, pos, activeLynxLayerZ(state));
  if (!block || block.moving > 0 || (block.deferPush && !lynxRuntimeState(state).chipTeleported)) {
    return false;
  }

  const wasHidden = block.hidden;
  const wasDormant = block.dormant;
  block.hidden = false;
  block.dormant = false;
  if (!movementDidSucceed(startLynxCreatureMovement(state, actors, block, dir))) {
    block.dir = dir;
    block.hidden = wasHidden;
    block.dormant = wasDormant;
    return false;
  }

  block.pushed = true;
  advanceLynxCreature(state, level, actors, block, state.timer.currentTime + 1);
  if (block.pushed) {
    state.soundEffects |= 1 << LYNX_SOUND.BlockMoving;
  }
  return true;
}

function skipsDormantLynxActorAdvance(state: EngineState, actor: LynxRuntimeActor, currentTime: number): boolean {
  if (!actor.dormant || actor.moving > 0 || actor.intentDir !== 0 || actor.teleported) {
    return false;
  }

  return withLynxLayer(state, actor.z ?? 1, () => {
    const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
    return (
      (currentTime === 0 && !isLynxAir(floor) && !isLynxElevator(floor)) ||
      (!isLynxSlide(floor) && !isLynxIce(floor) && !isLynxAir(floor) && !isLynxElevator(floor))
    );
  });
}

function activateLynxCloner(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], buttonPos: number): boolean {
  return activateLynxClonerWithContext(createLynxTrapClonerContext(state, level, actors), buttonPos);
}

function springLynxTrap(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], buttonPos: number): boolean {
  return springLynxTrapWithContext(createLynxTrapClonerContext(state, level, actors), buttonPos);
}

function advanceLynxChipTrapRelease(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
): {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
  if (!lynxTileHasTag(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), "trap") || chipDir === 0) {
    return {
      chipPos,
      chipDir,
      chipMoving,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  if (chipMoving <= 0) {
    if (!canAdvanceLynxPosition(chipPos, chipDir, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
      lynxRuntimeState(state).trapReleaseCantMoveThisTick = true;
      addLynxCantMove(state);
      return {
        chipPos,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      };
    }
    const targetPos = nextPosition(chipPos, chipDir, MS_GRID_WIDTH);
    const target = state.map.cells[targetPos];
    const targetBlock =
      target === undefined
        ? null
        : findVisibleActorOnFlaggedTopCell(state.map.cells, actors, targetPos, LYNX_CELL_FLAG.Claimed, (actor) => actor.id === MS_TILE.Block) ??
          null;
    const targetEntryProbe =
      targetBlock !== null ? probeLynxChipTargetCellForState(state, targetPos, chipDir, true) : probeLynxChipTargetCellForState(state, targetPos, chipDir);
    const pushedBlock =
      targetBlock && lynxChipTargetCellAllowsPush(targetEntryProbe)
        ? tryPushLynxBlock(state, level, actors, targetPos, chipDir)
        : false;
    const canEnterTarget =
      !!target &&
      (targetBlock
        ? pushedBlock && canLynxChipEnterAfterPushingBlock(state, targetPos, chipDir, targetEntryProbe)
        : revealLynxHiddenWall(state, targetPos)
          ? false
          : lynxChipTargetCellAllowsEntry(targetEntryProbe));

    if (!canEnterTarget) {
      lynxRuntimeState(state).trapReleaseCantMoveThisTick = true;
      addLynxCantMove(state);
      return {
        chipPos,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      };
    }

    settleLynxPrimedToolDrop(
      state,
      lynxRuntimeState(state),
      state.inventory,
      chipPos,
      activeLynxLayerZ(state),
      (layerZ, run) => withLynxLayer(state, layerZ, run),
    );
    chipPos = targetPos;
    chipMoving = 8;
  }

  const floor = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
  const speed = lynxChipMovementSpeed(state, floor);

  chipMoving = Math.max(0, chipMoving - speed);
  if (chipMoving === 0) {
    const completed = resolveCompletedLynxChipMove(
      state,
      level,
      actors,
      chipPos,
      chipDir,
      "planar",
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    );
    chipPos = completed.chipPos;
    chipDir = completed.chipDir;
    endGameTicksElapsed = completed.endGameTicksElapsed;
    endGameResult = completed.endGameResult;
    endGameAnimationTileId = completed.endGameAnimationTileId;
    endGameAnimationFrame = completed.endGameAnimationFrame;
  }

  return {
    chipPos,
    chipDir,
    chipMoving,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  };
}

function springLynxHeldBrownButton(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  buttonPos: number,
  chipState: LynxChipTurnState,
  replayInputCode = 0,
): LynxHeldButtonResolution {
  let nextChipPos = chipState.chipPos;
  let nextChipDir = chipState.chipDir;
  let nextChipMoving = chipState.chipMoving;
  let nextEndGameTicksElapsed = chipState.endGameTicksElapsed;
  let nextEndGameResult = chipState.endGameResult;
  let nextEndGameAnimationTileId = chipState.endGameAnimationTileId;
  let nextEndGameAnimationFrame = chipState.endGameAnimationFrame;
  let consumedReplayInput = false;
  let deferredChipInputCode = 0;
  let chipArrivedOnTrapThisTick = false;

  const trapPos = findLynxTrapTarget(level, buttonPos, activeLynxLayerZ(state));
  springLynxTrap(state, level, actors, buttonPos);
  if (trapPos === nextChipPos && lynxTileHasTag(topTileIdOr(state.map.cells, nextChipPos, MS_TILE.Empty), "trap")) {
    if (isDirectionalInput(replayInputCode) && nextChipMoving <= 0) {
      deferredChipInputCode = resolveLynxChipInputForCurrentState(state, actors, nextChipPos, nextChipDir, replayInputCode);
      consumedReplayInput = true;
    }
    const releaseStartPos = nextChipPos;
    const releaseStartMoving = nextChipMoving;
    const released = advanceLynxChipTrapRelease(
      state,
      level,
      actors,
      nextChipPos,
      nextChipDir,
      nextChipMoving,
      nextEndGameTicksElapsed,
      nextEndGameResult,
      nextEndGameAnimationTileId,
      nextEndGameAnimationFrame,
    );
    nextChipPos = released.chipPos;
    nextChipDir = released.chipDir;
    nextChipMoving = released.chipMoving;
    nextEndGameTicksElapsed = released.endGameTicksElapsed;
    nextEndGameResult = released.endGameResult;
    nextEndGameAnimationTileId = released.endGameAnimationTileId;
    nextEndGameAnimationFrame = released.endGameAnimationFrame;
    chipArrivedOnTrapThisTick =
      releaseStartMoving > 0 &&
      nextChipPos === releaseStartPos &&
      nextChipMoving === 0 &&
      lynxTileHasTag(topTileIdOr(state.map.cells, nextChipPos, MS_TILE.Empty), "trap");
    const releaseStarted = nextChipPos !== releaseStartPos || (releaseStartMoving <= 0 && nextChipMoving > 0);
    if (releaseStarted) {
      deferredChipInputCode = 0;
    }
  }

  return {
    chipPos: nextChipPos,
    chipDir: nextChipDir,
    chipMoving: nextChipMoving,
    endGameTicksElapsed: nextEndGameTicksElapsed,
    endGameResult: nextEndGameResult,
    endGameAnimationTileId: nextEndGameAnimationTileId,
    endGameAnimationFrame: nextEndGameAnimationFrame,
    consumedReplayInput,
    deferredChipInputCode,
    chipArrivedOnTrapThisTick,
  };
}

function springLynxSandbagHeldBrownButtons(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipState: LynxChipTurnState,
  replayInputCode = 0,
): LynxHeldButtonResolution {
  let nextChipPos = chipState.chipPos;
  let nextChipDir = chipState.chipDir;
  let nextChipMoving = chipState.chipMoving;
  let nextEndGameTicksElapsed = chipState.endGameTicksElapsed;
  let nextEndGameResult = chipState.endGameResult;
  let nextEndGameAnimationTileId = chipState.endGameAnimationTileId;
  let nextEndGameAnimationFrame = chipState.endGameAnimationFrame;
  let consumedReplayInput = false;
  let deferredChipInputCode = 0;
  let chipArrivedOnTrapThisTick = false;

  for (const layer of lynxRuntimeLayers(state.map)) {
    withLynxLayer(state, layer.z, () => {
      for (const cell of state.map.cells) {
        if (cell.top.id !== MS_TILE.Sandbag || cell.bottom.id !== MS_TILE.Button_Brown) {
          continue;
        }

        const heldButton = springLynxHeldBrownButton(
          state,
          level,
          actors,
          cell.position.pos,
          {
            chipPos: nextChipPos,
            chipDir: nextChipDir,
            chipMoving: nextChipMoving,
            endGameTicksElapsed: nextEndGameTicksElapsed,
            endGameResult: nextEndGameResult,
            endGameAnimationTileId: nextEndGameAnimationTileId,
            endGameAnimationFrame: nextEndGameAnimationFrame,
          },
          replayInputCode,
        );
        nextChipPos = heldButton.chipPos;
        nextChipDir = heldButton.chipDir;
        nextChipMoving = heldButton.chipMoving;
        nextEndGameTicksElapsed = heldButton.endGameTicksElapsed;
        nextEndGameResult = heldButton.endGameResult;
        nextEndGameAnimationTileId = heldButton.endGameAnimationTileId;
        nextEndGameAnimationFrame = heldButton.endGameAnimationFrame;
        chipArrivedOnTrapThisTick ||= heldButton.chipArrivedOnTrapThisTick;
        if (heldButton.consumedReplayInput) {
          consumedReplayInput = true;
          if (heldButton.deferredChipInputCode !== 0) {
            deferredChipInputCode = heldButton.deferredChipInputCode;
          }
        }
      }
    });
  }

  return {
    chipPos: nextChipPos,
    chipDir: nextChipDir,
    chipMoving: nextChipMoving,
    endGameTicksElapsed: nextEndGameTicksElapsed,
    endGameResult: nextEndGameResult,
    endGameAnimationTileId: nextEndGameAnimationTileId,
    endGameAnimationFrame: nextEndGameAnimationFrame,
    consumedReplayInput,
    deferredChipInputCode,
    chipArrivedOnTrapThisTick,
  };
}

export function initializeLynxEngineState(
  request: GameRequest,
  level: LynxLevel,
  replay:
    | (Pick<ReplaySolutionPayload, "randomSeed" | "stepping" | "randomSlideDirection"> & {
        moveCount?: number;
        bestTimeTicks?: number;
      })
    | null = null,
): EngineState {
  const chipSeed = findChipSeed(level);
  const layers = levelLayers(level).map((layer) => ({
    z: layer.z,
    cells: stripCreaturesForInitialHash(cloneBoardCells(layer.cells)),
  }));
  const cells = lynxCellsForZ(
    {
      hash: "",
      creaturesHash: "",
      creatureCount: 0,
      cells: layers[0]?.cells ?? stripCreaturesForInitialHash(cloneBoardCells(level.cells)),
      layers,
    },
    chipSeed.z,
  );
  const chipPos = chipSeed.pos;
  const initialStatusFlags =
    (level.statusFlags & ~MS_STATUS_FLAG.ShowHint) |
    (lynxTileHasTag(topTileIdOr(cells, chipPos, MS_TILE.Empty), "hint") ? MS_STATUS_FLAG.ShowHint : 0);
  const randomSeed = normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed);

  const state: EngineState = {
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
      initialRandomSlideDirection: directionName(replay?.randomSlideDirection ?? 1),
      randomState: {
        main: {
          initial: String(randomSeed),
          value: String(randomSeed),
          shared: false,
        },
        lynx: {
          prng1: 0,
          prng2: 0,
        },
      },
    },
    chip: {
      id: -1,
      layer: -1,
      dir: "none",
      position: roundedBoardPosition((chipPos % MS_GRID_WIDTH) * 8, Math.floor(chipPos / MS_GRID_HEIGHT) * 8, MS_GRID_WIDTH, MS_GRID_HEIGHT, 8),
      state: 0,
      source: "view",
    },
    actors: [],
    map: {
      hash: mapHash(cells),
      creaturesHash: "14650fb0739d0383",
      creatureCount: 0,
      cells,
      layers,
    },
    view: {
      x: (chipPos % MS_GRID_WIDTH) * 8,
      y: Math.floor(chipPos / MS_GRID_HEIGHT) * 8,
    },
    soundEffects: 0,
    statusFlags: initialStatusFlags,
    lastMove: { code: 0, name: "none" },
  };

  const runtime = lynxRuntimeState(state);
  runtime.portableItems = collectLynxPortableItemsFromLayers(lynxRuntimeLayers(state.map));
  runtime.nextPortableItemSerial = runtime.portableItems.length + 1;
  projectLynxPortableToolState(runtime, state.inventory);
  setLynxRuntimeChipState(state, chipPos, chipSeed.z);
  return state;
}

function createLynxInteractiveToken(
  request: GameRequest,
  level: LynxLevel,
  replay:
    | (Pick<ReplaySolutionPayload, "moves" | "modifierMasks" | "randomSeed" | "randomSlideDirection" | "stepping" | "flags"> & {
        moveCount?: number;
        bestTimeTicks?: number;
      })
    | null = null,
): LynxInteractiveSessionState {
  const chipSeed = findChipSeed(level);
  return {
    level,
    state: initializeLynxEngineState(request, level, replay),
    lastInput: createRuntimeCommand(0, -1),
    recordedMoves: replay
      ? replay.moves.map((move, index) => ({
          ...move,
          modifierMask: replay.modifierMasks?.[index] ?? 0,
        }))
      : [],
    replayPlan: replay ? createReplayPlan(replay) : null,
    chipPos: chipSeed.pos,
    chipZ: chipSeed.z,
    chipDir: chipSeed.dir,
    chipMoving: 0,
    chipMoveKind: "planar",
    currentInputCode: 0,
    queuedReplayInputCode: 0,
    queuedChipInputCode: 0,
    chipPushing: false,
    actors: parseLynxActors(level),
    endGameTicksElapsed: null,
    endGameResult: null,
    endGameAnimationTileId: null,
    endGameAnimationFrame: null,
  };
}

function recordLynxReplayMove(
  recordedMoves: ReplayRecordedMove[],
  currentTime: number,
  replayCursor: number,
  moveCode: number,
): ReplayRecordedMove[] {
  return recordManualMove(recordedMoves, currentTime, replayCursor, moveCode);
}

function createLynxAdvanceTickRuntime(
  session: LynxInteractiveSessionState,
  scheduledInputCode: number | null,
  debugRecorder: TurnDebugPhaseRecorder<GameDebugPhaseSnapshot> | null,
): LynxAdvanceTickRuntime {
  const replayMode = session.replayPlan !== null;
  const carryCurrentInputAcrossTicks = replayMode;
  const state = session.state;
  const level = session.level;
  setLynxActiveLayer(state, session.chipZ ?? 1);
  let replayPlan = session.replayPlan;
  let runtimeInput =
    scheduledInputCode === null
      ? createRuntimeCommand(0, state.timer.currentTime + 1)
      : createRuntimeCommand(scheduledInputCode, state.timer.currentTime + 1);
  if (replayPlan) {
    const replayTick = plannedReplayInput(replayPlan, state.timer.currentTime + 1);
    replayPlan = replayTick.plan;
    runtimeInput = replayTick.input;
    scheduledInputCode = runtimeInput.inputCode === 0 ? null : runtimeInput.inputCode;
  }

  const runtime: LynxAdvanceTickRuntime = {
    session,
    debugRecorder,
    replayMode,
    carryCurrentInputAcrossTicks,
    state,
    level,
    replayPlan,
    runtimeInput,
    scheduledInputCode,
    chipPos: session.chipPos,
    chipZ: session.chipZ ?? 1,
    chipDir: session.chipDir,
    chipMoving: session.chipMoving,
    chipMoveKind: session.chipMoveKind ?? "planar",
    currentInputCode: carryCurrentInputAcrossTicks ? session.currentInputCode : 0,
    queuedReplayInputCode: session.queuedReplayInputCode,
    queuedChipInputCode: session.queuedChipInputCode,
    chipPushing: false,
    actors: session.actors,
    endGameTicksElapsed: session.endGameTicksElapsed,
    endGameResult: session.endGameResult,
    endGameAnimationTileId: session.endGameAnimationTileId,
    endGameAnimationFrame: session.endGameAnimationFrame,
    chipArrivedOnHeldTrapThisTick: false,
    latchedChipMoveSelection: null,
    recordedReplayInputCode: 0,
    nextTick: state.timer.currentTime + 1,
  };

  reconcileLynxPortableToolProjection(lynxRuntimeState(state), state.inventory);
  setLynxRuntimeChipState(state, runtime.chipPos, runtime.chipZ);
  return runtime;
}

function currentLynxTickContext(runtime: LynxAdvanceTickRuntime): LynxTickContext {
  return createLynxTickContext(runtime.state, runtime.actors, runtime.chipPos, runtime.chipZ);
}

function recordLynxTickPhase(
  runtime: LynxAdvanceTickRuntime,
  phase: TurnDebugPhaseName,
  phaseInputCode: number,
): void {
  if (!runtime.debugRecorder) {
    return;
  }
  recordTurnDebugPhase(runtime.debugRecorder, phase, (recordedPhase) =>
    projectLynxDebugPhaseSnapshot(
      runtime.state,
      runtime.actors,
      runtime.chipPos,
      runtime.chipDir,
      runtime.chipMoving,
      phaseInputCode,
      runtime.nextTick,
      recordedPhase,
    ),
  );
}

function currentLynxHeldButtonChipState(runtime: LynxAdvanceTickRuntime): LynxChipTurnState {
  return {
    chipPos: runtime.chipPos,
    chipDir: runtime.chipDir,
    chipMoving: runtime.chipMoving,
    endGameTicksElapsed: runtime.endGameTicksElapsed,
    endGameResult: runtime.endGameResult,
    endGameAnimationTileId: runtime.endGameAnimationTileId,
    endGameAnimationFrame: runtime.endGameAnimationFrame,
  };
}

function applyLynxHeldButtonResolutionToRuntime(
  runtime: LynxAdvanceTickRuntime,
  resolution: LynxHeldButtonResolution,
): void {
  runtime.chipPos = resolution.chipPos;
  runtime.chipDir = resolution.chipDir;
  runtime.chipMoving = resolution.chipMoving;
  runtime.endGameTicksElapsed = resolution.endGameTicksElapsed;
  runtime.endGameResult = resolution.endGameResult;
  runtime.endGameAnimationTileId = resolution.endGameAnimationTileId;
  runtime.endGameAnimationFrame = resolution.endGameAnimationFrame;
  runtime.chipArrivedOnHeldTrapThisTick ||= resolution.chipArrivedOnTrapThisTick;

  const replayUpdate = applyLynxHeldButtonReplayConsumption(
    {
      replayMode: runtime.replayMode,
      currentInputCode: runtime.currentInputCode,
      queuedReplayInputCode: runtime.queuedReplayInputCode,
      queuedChipInputCode: runtime.queuedChipInputCode,
      recordedReplayInputCode: runtime.recordedReplayInputCode,
    },
    resolution,
  );
  runtime.currentInputCode = replayUpdate.currentInputCode;
  runtime.queuedReplayInputCode = replayUpdate.queuedReplayInputCode;
  runtime.queuedChipInputCode = replayUpdate.queuedChipInputCode;
  runtime.recordedReplayInputCode = replayUpdate.recordedReplayInputCode;

  if (replayUpdate.consumedLastMoveCode !== null) {
    runtime.state.lastMove = {
      code: replayUpdate.consumedLastMoveCode,
      name: runtimeCommandName(replayUpdate.consumedLastMoveCode),
    };
  }
}

function buildLynxChipMoveSelection(runtime: LynxAdvanceTickRuntime): LynxChipMoveSelection {
  const floorBeforeMove = topTileIdOr(runtime.state.map.cells, runtime.chipPos, MS_TILE.Empty);
  return selectLynxChipMoveForTick({
    chipPos: runtime.chipPos,
    chipZ: runtime.chipZ,
    chipDir: runtime.chipDir,
    chipMoving: runtime.chipMoving,
    endGameTicksElapsed: runtime.endGameTicksElapsed,
    floorBeforeMove,
    currentInputCode: runtime.currentInputCode,
    queuedReplayInputCode: runtime.queuedReplayInputCode,
    queuedChipInputCode: runtime.queuedChipInputCode,
    forcedMove:
      runtime.chipMoving === 0 && runtime.endGameTicksElapsed === null
        ? getLynxChipForcedMove(currentLynxTickContext(runtime), floorBeforeMove, runtime.chipDir)
        : { dir: 0, discardInput: false },
    resolveInputDirection: (inputCode) =>
      resolveLynxChipInputForCurrentState(
        runtime.state,
        runtime.actors,
        runtime.chipPos,
        runtime.chipDir,
        inputCode,
      ),
  });
}

function shouldSuppressLynxChipMoveSelectionForRuntime(runtime: LynxAdvanceTickRuntime): boolean {
  return shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(
    runtime.chipMoving,
    runtime.chipArrivedOnHeldTrapThisTick,
    lynxTileHasTag(topTileIdOr(runtime.state.map.cells, runtime.chipPos, MS_TILE.Empty), "trap"),
  );
}

function resolveLynxChipMoveSelectionForRuntime(runtime: LynxAdvanceTickRuntime): LynxChipMoveSelection {
  const selection =
    runtime.latchedChipMoveSelection &&
    runtime.chipPos === runtime.latchedChipMoveSelection.chipPos &&
    runtime.chipZ === runtime.latchedChipMoveSelection.chipZ &&
    runtime.chipDir === runtime.latchedChipMoveSelection.chipDir &&
    runtime.chipMoving === runtime.latchedChipMoveSelection.chipMoving &&
    runtime.endGameTicksElapsed === runtime.latchedChipMoveSelection.endGameTicksElapsed
      ? runtime.latchedChipMoveSelection
      : buildLynxChipMoveSelection(runtime);
  return shouldSuppressLynxChipMoveSelectionForRuntime(runtime)
    ? suppressLynxChipMoveSelectionForHeldTrapArrival(selection)
    : selection;
}

function finishLynxInteractiveTick(runtime: LynxAdvanceTickRuntime): LynxInteractiveSessionState {
  setLynxRuntimeChipState(runtime.state, runtime.chipPos, runtime.chipZ);

  return {
    level: runtime.level,
    state: runtime.state,
    lastInput: runtime.runtimeInput,
    recordedMoves: recordLynxReplayMove(
      runtime.session.recordedMoves,
      runtime.state.timer.currentTime,
      runtime.state.replay.cursor,
      runtime.recordedReplayInputCode,
    ),
    replayPlan: runtime.replayPlan,
    chipPos: runtime.chipPos,
    chipZ: runtime.chipZ,
    chipDir: runtime.chipDir,
    chipMoving: runtime.chipMoving,
    chipMoveKind: runtime.chipMoveKind,
    currentInputCode: runtime.carryCurrentInputAcrossTicks ? runtime.currentInputCode : 0,
    queuedReplayInputCode: runtime.queuedReplayInputCode,
    queuedChipInputCode: runtime.queuedChipInputCode,
    chipPushing: runtime.chipPushing,
    actors: runtime.actors,
    endGameTicksElapsed: runtime.endGameTicksElapsed,
    endGameResult: runtime.endGameResult,
    endGameAnimationTileId: runtime.endGameAnimationTileId,
    endGameAnimationFrame: runtime.endGameAnimationFrame,
  };
}

function runLynxInitialHousekeepingPhase(runtime: LynxAdvanceTickRuntime): void {
  if (runtime.scheduledInputCode !== null) {
    runtime.currentInputCode = runtime.scheduledInputCode;
  }
  recordLynxTickPhase(runtime, TURN_DEBUG_PHASE.postInputLatch, runtime.currentInputCode);
  runtime.state.soundEffects &= ~LYNX_ONE_SHOT_MASK;
  runLynxInitialHousekeeping(runtime.state, runtime.actors);
  runtime.endGameAnimationFrame = advanceLynxEndGameAnimationFrame(
    runtime.endGameResult,
    runtime.endGameAnimationFrame,
  );
  if (
    runtime.endGameTicksElapsed === null &&
    runtime.state.timer.timeLimit > 0 &&
    runtime.state.timer.currentTime >= runtime.state.timer.timeLimit
  ) {
    const timedOut = failLynxChip(
      runtime.state,
      runtime.actors,
      runtime.chipPos,
      runtime.chipDir,
      runtime.chipMoving,
      runtime.endGameTicksElapsed,
      runtime.endGameResult,
      runtime.endGameAnimationTileId,
      runtime.endGameAnimationFrame,
      "outoftime",
    );
    runtime.chipPos = timedOut.chipPos;
    runtime.chipMoving = 0;
    runtime.endGameTicksElapsed = timedOut.endGameTicksElapsed;
    runtime.endGameResult = timedOut.endGameResult;
    runtime.endGameAnimationTileId = timedOut.endGameAnimationTileId;
    runtime.endGameAnimationFrame = timedOut.endGameAnimationFrame;
  }
  advanceLynxAnimations(runtime.state, runtime.actors);
  if (runtime.replayMode && runtime.scheduledInputCode !== null) {
    runtime.state.replay.cursor += 1;
  }
  const { modifierMask } = decodeRuntimeInputCode(runtime.runtimeInput.inputCode);
  if (
    runtime.endGameTicksElapsed === null &&
    (modifierMask & GAME_INPUT_MODIFIER_MASKS.action1) !== 0 &&
    primeLynxToolDrop(lynxRuntimeState(runtime.state), runtime.state.inventory, runtime.chipPos, runtime.chipZ)
  ) {
    if (runtime.replayMode) {
      runtime.state.lastMove = {
        code: runtime.runtimeInput.inputCode,
        name: runtimeCommandName(runtime.runtimeInput.inputCode),
      };
    } else {
      runtime.recordedReplayInputCode = runtime.runtimeInput.inputCode;
    }
  }
  recordLynxTickPhase(runtime, TURN_DEBUG_PHASE.postInitialHousekeeping, runtime.currentInputCode);
}

function runLynxCreatureIntentPhase(runtime: LynxAdvanceTickRuntime): void {
  for (let index = runtime.actors.length - 1; index >= 0; index -= 1) {
    const actor = runtime.actors[index]!;
    if (actor.hidden || actor.moving > 0 || actor.dormant) {
      continue;
    }
    chooseLynxCreatureMoveForTick(
      runtime.state,
      runtime.actors,
      actor,
      runtime.chipPos,
      runtime.nextTick,
      runtime.state.replay.stepping,
    );
  }

  markPendingLynxChipPush(
    runtime.state,
    runtime.actors,
    runtime.chipPos,
    runtime.chipDir,
    runtime.chipMoving,
    runtime.endGameTicksElapsed,
    pendingLynxChipPushInputCode(
      runtime.state,
      runtime.chipDir,
      runtime.chipMoving,
      runtime.endGameTicksElapsed,
      runtime.queuedChipInputCode,
      runtime.queuedReplayInputCode,
      runtime.currentInputCode,
    ),
  );

  runtime.latchedChipMoveSelection =
    runtime.chipMoving === 0 &&
    !lynxTileHasTag(topTileIdOr(runtime.state.map.cells, runtime.chipPos, MS_TILE.Empty), "trap")
      ? buildLynxChipMoveSelection(runtime)
      : null;

  if (runtime.latchedChipMoveSelection) {
    const previewInputCode = previewInputCodeForLynxChipMoveSelection(
      runtime.latchedChipMoveSelection,
      isLynxSlide,
      (inputCode) => shouldPreviewLynxForcedSlidePush(runtime.state, runtime.actors, runtime.chipPos, inputCode),
    );
    previewLynxChipPushRequest(runtime.state, runtime.actors, runtime.chipPos, previewInputCode);
  }

  if (
    runtime.replayMode &&
    runtime.latchedChipMoveSelection &&
    runtime.latchedChipMoveSelection.requestedInputCode !== 0 &&
    runtime.queuedReplayInputCode === 0
  ) {
    runtime.state.lastMove = {
      code: runtime.latchedChipMoveSelection.rawRequestedInputCode,
      name: runtimeCommandName(runtime.latchedChipMoveSelection.rawRequestedInputCode),
    };
  }

  const chipOnBeartrapBeforeCreatureMovement =
    runtime.chipMoving === 0 &&
    lynxTileHasTag(topTileIdOr(runtime.state.map.cells, runtime.chipPos, MS_TILE.Empty), "trap");
  const chipHasPreCreatureMoveQueued =
    (runtime.latchedChipMoveSelection !== null && runtime.latchedChipMoveSelection.startInputCode !== 0) ||
    (chipOnBeartrapBeforeCreatureMovement &&
      (runtime.queuedChipInputCode !== 0 ||
        runtime.queuedReplayInputCode !== 0 ||
        runtime.currentInputCode !== 0));
  if (!chipHasPreCreatureMoveQueued) {
    clearLynxCouldntMove(runtime.state);
  }

  recordLynxTickPhase(runtime, TURN_DEBUG_PHASE.postCreatureIntent, 0);
}

function runLynxCreatureMovementPhase(runtime: LynxAdvanceTickRuntime): void {
  for (let index = runtime.actors.length - 1; index >= 0; index -= 1) {
    const actor = runtime.actors[index]!;
    if (!skipsDormantLynxActorAdvance(runtime.state, actor, runtime.nextTick)) {
      advanceLynxCreature(
        runtime.state,
        runtime.level,
        runtime.actors,
        actor,
        runtime.nextTick,
        runtime.chipPos,
        runtime.chipZ,
      );
    }
    actor.intentDir = 0;
    actor.forcedDir = 0;
    withLynxLayer(runtime.state, actor.z ?? 1, () => {
      if (
        actor.hidden ||
        actor.moving > 0 ||
        lynxButtonAction(topTileIdOr(runtime.state.map.cells, actor.pos, MS_TILE.Empty)) !== "spring-trap"
      ) {
        return;
      }
      applyLynxHeldButtonResolutionToRuntime(
        runtime,
        springLynxHeldBrownButton(
          runtime.state,
          runtime.level,
          runtime.actors,
          actor.pos,
          currentLynxHeldButtonChipState(runtime),
          runtime.replayMode ? runtime.currentInputCode : 0,
        ),
      );
    });
  }

  applyLynxHeldButtonResolutionToRuntime(
    runtime,
    springLynxSandbagHeldBrownButtons(
      runtime.state,
      runtime.level,
      runtime.actors,
      currentLynxHeldButtonChipState(runtime),
      runtime.replayMode ? runtime.currentInputCode : 0,
    ),
  );

  const collision = resolveLynxChipCollision(
    runtime.state,
    runtime.actors,
    runtime.chipPos,
    runtime.chipDir,
    runtime.chipMoving,
    runtime.chipMoveKind,
    runtime.endGameTicksElapsed,
    runtime.endGameResult,
    runtime.endGameAnimationTileId,
    runtime.endGameAnimationFrame,
  );
  runtime.chipPos = collision.chipPos;
  runtime.chipMoving = collision.endGameTicksElapsed !== null ? 0 : runtime.chipMoving;
  runtime.endGameTicksElapsed = collision.endGameTicksElapsed;
  runtime.endGameResult = collision.endGameResult;
  runtime.endGameAnimationTileId = collision.endGameAnimationTileId;
  runtime.endGameAnimationFrame = collision.endGameAnimationFrame;

  recordLynxTickPhase(runtime, TURN_DEBUG_PHASE.postCreatureMovement, 0);
}

function runLynxChipMovementPhase(runtime: LynxAdvanceTickRuntime): void {
  const chipMoveSelection = resolveLynxChipMoveSelectionForRuntime(runtime);
  const floorBeforeMove = chipMoveSelection.floorBeforeMove;
  const heldButtonConsumedReplayInput = runtime.queuedReplayInputCode !== 0;
  const rawRequestedInputCode = chipMoveSelection.rawRequestedInputCode;
  if (runtime.chipMoving === 0 && !shouldSuppressLynxChipMoveSelectionForRuntime(runtime)) {
    runtime.currentInputCode = 0;
    runtime.queuedReplayInputCode = 0;
  }
  const requestedInputCode = chipMoveSelection.requestedInputCode;
  if (runtime.replayMode && requestedInputCode !== 0 && !heldButtonConsumedReplayInput) {
    runtime.state.lastMove = {
      code: rawRequestedInputCode,
      name: runtimeCommandName(rawRequestedInputCode),
    };
  } else if (!runtime.replayMode && requestedInputCode !== 0 && !heldButtonConsumedReplayInput) {
    runtime.recordedReplayInputCode = rawRequestedInputCode;
  }
  const chosenInputCode = chipMoveSelection.chosenInputCode;
  runtime.queuedChipInputCode = 0;
  const startInputCode = chipMoveSelection.startInputCode;

  if (
    startInputCode === 0 &&
    !chipMoveSelection.startAirMove &&
    !chipMoveSelection.startElevatorMove &&
    runtime.chipMoving === 0
  ) {
    if (!lynxRuntimeState(runtime.state).trapReleaseCantMoveThisTick) {
      clearLynxCouldntMove(runtime.state);
    }
    resetLynxFloorSounds(runtime.state);
  }

  if (runtime.chipMoving === 0 && chipMoveSelection.startAirMove) {
    settleLynxPrimedToolDrop(
      runtime.state,
      lynxRuntimeState(runtime.state),
      runtime.state.inventory,
      runtime.chipPos,
      runtime.chipZ,
      (layerZ, run) => withLynxLayer(runtime.state, layerZ, run),
    );
    const airborne = startLynxChipAirMovement(
      {
        setActiveLayer: (z) => {
          setLynxActiveLayer(runtime.state, z);
        },
        cellsForZ: (z) => lynxCellsForZ(runtime.state.map, z),
      },
      runtime.chipPos,
      runtime.chipZ,
    );
    runtime.chipPos = airborne.chipPos;
    runtime.chipZ = airborne.chipZ;
    runtime.chipMoving = airborne.chipMoving;
    runtime.chipMoveKind = airborne.chipMoveKind;
    clearLynxCouldntMove(runtime.state);
    return;
  }

  if (runtime.chipMoving === 0 && chipMoveSelection.startElevatorMove) {
    settleLynxPrimedToolDrop(
      runtime.state,
      lynxRuntimeState(runtime.state),
      runtime.state.inventory,
      runtime.chipPos,
      runtime.chipZ,
      (layerZ, run) => withLynxLayer(runtime.state, layerZ, run),
    );
    const elevated = startLynxChipElevatorMovement(
      currentLynxTickContext(runtime),
      runtime.chipDir,
      {
        setActiveLayer: (z) => {
          setLynxActiveLayer(runtime.state, z);
        },
      },
      (pushDir, targetZ) =>
        withLynxLayer(runtime.state, targetZ, () =>
          tryPushLynxBlock(runtime.state, runtime.level, runtime.actors, runtime.chipPos, pushDir),
        ),
    );
    runtime.chipPos = elevated.chipPos;
    runtime.chipZ = elevated.chipZ;
    runtime.chipMoving = elevated.chipMoving;
    runtime.chipMoveKind = elevated.chipMoveKind;
    if (elevated.chipMoving > 0) {
      clearLynxCouldntMove(runtime.state);
    }
    return;
  }

  if (runtime.chipMoving !== 0 || startInputCode === 0) {
    return;
  }

  updateLynxChipStartMovementState(runtime.state, floorBeforeMove, chosenInputCode);
  if (!canLynxExitTile(runtime.state, floorBeforeMove, MS_TILE.Chip, startInputCode, false)) {
    runtime.chipPushing = true;
    runtime.chipDir = turnLynxChipAroundOnBlockedIce(runtime.state, floorBeforeMove, startInputCode);
    addLynxCantMove(runtime.state);
    return;
  }

  if (!canAdvanceLynxPosition(runtime.chipPos, startInputCode, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
    runtime.chipPushing = true;
    runtime.chipDir = turnLynxChipAroundOnBlockedIce(runtime.state, floorBeforeMove, startInputCode);
    addLynxCantMove(runtime.state);
    return;
  }

  const targetPos = nextPosition(runtime.chipPos, startInputCode, MS_GRID_WIDTH);
  const target = runtime.state.map.cells[targetPos];
  const targetBlock =
    target === undefined ? null : findClaimedLynxBlockOnActiveLayer(runtime.state, runtime.actors, targetPos);
  const targetEntryProbe =
    targetBlock !== null
      ? probeLynxChipTargetCellForState(runtime.state, targetPos, startInputCode, true)
      : probeLynxChipTargetCellForState(runtime.state, targetPos, startInputCode);
  const pushedBlock =
    targetBlock && lynxChipTargetCellAllowsPush(targetEntryProbe)
      ? tryPushLynxBlock(runtime.state, runtime.level, runtime.actors, targetPos, startInputCode)
      : false;
  const pressedPermanentHiddenWallPos =
    targetBlock === null ? findPressedLynxPermanentHiddenWallPos(runtime.state, runtime.chipPos, startInputCode) : null;
  const canEnterTarget =
    !!target &&
    (targetBlock
      ? pushedBlock &&
        canLynxChipEnterAfterPushingBlock(runtime.state, targetPos, startInputCode, targetEntryProbe)
      : revealLynxHiddenWall(runtime.state, targetPos)
        ? false
        : lynxChipTargetCellAllowsEntry(targetEntryProbe));
  if (targetBlock && (pushedBlock || !canEnterTarget)) {
    runtime.chipPushing = true;
  }
  if (canEnterTarget) {
    clearLynxCouldntMove(runtime.state);
    settleLynxPrimedToolDrop(
      runtime.state,
      lynxRuntimeState(runtime.state),
      runtime.state.inventory,
      runtime.chipPos,
      runtime.chipZ,
      (layerZ, run) => withLynxLayer(runtime.state, layerZ, run),
    );
    runtime.chipDir = startInputCode;
    runtime.chipPos = targetPos;
    runtime.chipMoving = 8;
    runtime.chipMoveKind = "planar";
    return;
  }

  if (pressedPermanentHiddenWallPos !== null) {
    addLynxTileOverlay(
      runtime.state,
      runtime.chipZ,
      pressedPermanentHiddenWallPos,
      "hidden-wall-reveal",
      HIDDEN_WALL_REVEAL_TTL,
    );
  }
  runtime.chipPushing = true;
  runtime.chipDir = turnLynxChipAroundOnBlockedIce(runtime.state, floorBeforeMove, startInputCode);
  addLynxCantMove(runtime.state);
}

function runLynxPostMoveResolutionPhase(runtime: LynxAdvanceTickRuntime): void {
  const postMove = resolveLynxPostChipMovement(
    runtime.state,
    runtime.level,
    runtime.actors,
    runtime.chipPos,
    runtime.chipDir,
    runtime.chipMoving,
    runtime.chipMoveKind,
    runtime.endGameTicksElapsed,
    runtime.endGameResult,
    runtime.endGameAnimationTileId,
    runtime.endGameAnimationFrame,
  );
  runtime.chipPos = postMove.chipPos;
  runtime.chipDir = postMove.chipDir;
  runtime.chipMoving = postMove.chipMoving;
  runtime.chipMoveKind = postMove.chipMoveKind;
  runtime.endGameTicksElapsed = postMove.endGameTicksElapsed;
  runtime.endGameResult = postMove.endGameResult;
  runtime.endGameAnimationTileId = postMove.endGameAnimationTileId;
  runtime.endGameAnimationFrame = postMove.endGameAnimationFrame;
  recordLynxTickPhase(runtime, TURN_DEBUG_PHASE.postTeleportResolution, 0);
}

function runLynxFinalizePhase(runtime: LynxAdvanceTickRuntime): void {
  const finalizedEndGame = finalizeLynxTickBookkeeping(
    runtime.state,
    runtime.chipPos,
    runtime.chipDir,
    runtime.chipMoving,
    runtime.chipMoveKind,
    runtime.endGameTicksElapsed,
    runtime.endGameResult,
  );
  runtime.endGameTicksElapsed = finalizedEndGame.endGameTicksElapsed;
  runtime.endGameResult = finalizedEndGame.endGameResult;
  recordLynxTickPhase(runtime, TURN_DEBUG_PHASE.postPutwallResolution, 0);
  recordLynxTickPhase(runtime, TURN_DEBUG_PHASE.final, 0);
}

function advanceLynxInteractiveTick(
  session: LynxInteractiveSessionState,
  scheduledInputCode: number | null,
  debugRecorder: TurnDebugPhaseRecorder<GameDebugPhaseSnapshot> | null = null,
): LynxInteractiveSessionState {
  const runtime = createLynxAdvanceTickRuntime(session, scheduledInputCode, debugRecorder);

  runTurnPhaseHandlers<void>([
    {
      name: TURN_PHASE.initialHousekeeping,
      run: () => {
        runLynxInitialHousekeepingPhase(runtime);
        return null;
      },
    },
    {
      name: TURN_PHASE.creatureIntent,
      run: () => {
        runLynxCreatureIntentPhase(runtime);
        return null;
      },
    },
    {
      name: TURN_PHASE.creatureMovement,
      run: () => {
        runLynxCreatureMovementPhase(runtime);
        return null;
      },
    },
    {
      name: TURN_PHASE.chipMovement,
      run: () => {
        runLynxChipMovementPhase(runtime);
        return null;
      },
    },
    {
      name: TURN_PHASE.postMoveResolution,
      run: () => {
        runLynxPostMoveResolutionPhase(runtime);
        return null;
      },
    },
    {
      name: TURN_PHASE.finalize,
      run: () => {
        runLynxFinalizePhase(runtime);
        return null;
      },
    },
  ]);

  return finishLynxInteractiveTick(runtime);
}

export function createLynxInteractiveSession(request: GameRequest, level: LynxLevel): LynxInteractiveSessionState {
  return createLynxInteractiveToken(request, level, null);
}

export function createLynxReplaySession(
  request: GameRequest,
  level: LynxLevel,
  replay: ReplaySolutionPayload,
): LynxInteractiveSessionState {
  return createLynxInteractiveToken(request, level, {
    ...replay,
    moveCount: replay.moves.length,
    bestTimeTicks: replayBestTimeTicks(replay),
  });
}

function replayBestTimeTicks(replay: ReplaySolutionPayload): number | undefined {
  const replayWithBestTime = replay as ReplaySolutionPayload & {
    bestTimeTicks?: number;
  };
  return typeof replayWithBestTime.bestTimeTicks === "number" ? replayWithBestTime.bestTimeTicks : undefined;
}

export function advanceLynxInteractiveSession(
  session: LynxInteractiveSessionState,
  inputCode: number,
): LynxInteractiveSessionState {
  return advanceLynxInteractiveTick(session, inputCode === 0 ? null : inputCode);
}

function runLynxTrace(
  request: GameRequest,
  level: LynxLevel,
  commands: GameCommand[],
  maxTicks: number,
  replay: (ReplaySolutionPayload & { bestTimeTicks: number }) | null = null,
): GameTrace {
  let token = createLynxInteractiveToken(request, level, replay);
  token.state.map.hash = mapHash(token.state.map.cells);
  const initialState = engineStateToSnapshot(token.state, "initial", createRuntimeCommand(0, -1));
  if (maxTicks === 0) {
    return createGameTrace({
      request,
      scheduledInputs: replay ? [] : commands,
      initialState,
      steps: [],
      result: {
        status: token.state.status,
        finalTick: token.state.timer.tick,
      },
    });
  }

  const steps: GameTrace["steps"] = [];

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const scheduled = scheduledInputForTick(commands, tick);
    token = advanceLynxInteractiveTick(token, scheduled ? scheduled.inputCode : null);

    steps.push(
      engineStateToSnapshot(
        token.state,
        "tick",
        createRuntimeCommand(scheduled?.inputCode ?? 0, scheduled ? scheduled.tick : -1),
      ),
    );
    if (token.state.status !== "playing") {
      break;
    }
  }

  return createGameTrace({
    request,
    scheduledInputs: replay ? [] : commands,
    initialState,
    steps,
    result: {
      status: token.state.status,
      finalTick: token.state.timer.tick,
    },
  });
}

export function runLynxInputTrace(
  request: GameRequest,
  level: LynxLevel,
  commands: GameCommand[],
  maxTicks: number,
): GameTrace {
  return runLynxTrace(request, level, commands, maxTicks, null);
}

export function runLynxReplayTrace(
  request: GameRequest,
  level: LynxLevel,
  replay: ReplaySolutionPayload & { bestTimeTicks: number },
  maxTicks: number,
): GameTrace {
  const commands: GameCommand[] = replay.moves.map((move) => ({
    // Native replay actions store `when` in a 23-bit bitfield.
    tick: move.when & LYNX_REPLAY_MOVE_TICK_MASK,
    inputCode: move.dir,
    inputName: getGameInputNameFromCode(move.dir) ?? "none",
  }));
  return runLynxTrace(request, level, commands, maxTicks, replay);
}

export function runLynxInputTraceDebug(
  request: GameRequest,
  level: LynxLevel,
  commands: GameCommand[],
  maxTicks: number,
): GameDebugTrace {
  return runLynxReplayTraceDebugInternal(request, level, commands, maxTicks, null, 0, maxTicks);
}

export function runLynxReplayTraceDebug(
  request: GameRequest,
  level: LynxLevel,
  replay: ReplaySolutionPayload & { bestTimeTicks: number },
  maxTicks: number,
): GameDebugTrace {
  return runLynxReplayTraceDebugWindow(request, level, replay, maxTicks, 0, maxTicks);
}

export function runLynxReplayTraceDebugWindow(
  request: GameRequest,
  level: LynxLevel,
  replay: ReplaySolutionPayload & { bestTimeTicks: number },
  maxTicks: number,
  windowStart: number,
  windowEndExclusive: number,
): GameDebugTrace {
  const commands: GameCommand[] = replay.moves.map((move) => ({
    tick: move.when & LYNX_REPLAY_MOVE_TICK_MASK,
    inputCode: move.dir,
    inputName: getGameInputNameFromCode(move.dir) ?? "none",
  }));
  return runLynxReplayTraceDebugInternal(request, level, commands, maxTicks, replay, windowStart, windowEndExclusive);
}

function runLynxReplayTraceDebugInternal(
  request: GameRequest,
  level: LynxLevel,
  commands: GameCommand[],
  maxTicks: number,
  replay: (ReplaySolutionPayload & { bestTimeTicks: number }) | null,
  windowStart: number,
  windowEndExclusive: number,
): GameDebugTrace {
  let token = createLynxInteractiveToken(request, level, replay);
  token.state.map.hash = mapHash(token.state.map.cells);
  const initialState = engineStateToSnapshot(token.state, "initial", createRuntimeCommand(0, -1));
  const initialDebugState = projectLynxDebugPhaseSnapshot(
    token.state,
    token.actors,
    token.chipPos,
    token.chipDir,
    token.chipMoving,
    0,
    0,
    TURN_DEBUG_PHASE.initial,
  );
  const includeStep = (tick: number) => tick >= windowStart && tick < windowEndExclusive;

  if (maxTicks === 0) {
    return createGameDebugTrace({
      request,
      debugSchemaVersion: LYNX_DEBUG_SCHEMA_VERSION,
      scheduledInputs: replay ? [] : commands,
      initialState,
      initialDebugState,
      steps: [],
      result: {
        status: token.state.status,
        finalTick: token.state.timer.tick,
      },
    });
  }

  const steps: GameDebugTrace["steps"] = [];

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const scheduled = scheduledInputForTick(commands, tick);
    const phases: GameDebugPhaseSnapshot[] = [];
    token = advanceLynxInteractiveTick(
      token,
      scheduled ? scheduled.inputCode : null,
      createArrayTurnDebugPhaseRecorder(phases),
    );

    if (includeStep(tick)) {
      steps.push({
        ...engineStateToSnapshot(
          token.state,
          "tick",
          createRuntimeCommand(scheduled?.inputCode ?? 0, scheduled ? scheduled.tick : -1),
        ),
        phases,
      });
    }
    if (token.state.status !== "playing") {
      break;
    }
  }

  return createGameDebugTrace({
    request,
    debugSchemaVersion: LYNX_DEBUG_SCHEMA_VERSION,
    scheduledInputs: replay ? [] : commands,
    initialState,
    initialDebugState,
    steps,
    result: {
      status: token.state.status,
      finalTick: token.state.timer.tick,
    },
  });
}
