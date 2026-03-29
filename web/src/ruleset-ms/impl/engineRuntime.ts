import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import type {
  GameDebugPhaseSnapshot,
  GameDebugTrace,
} from "@game-core/api/debug";
import { cloneBowlingBallState, setBowlingBallMode, type BowlingBallState } from "@game-core/impl/bowlingBall";
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
import { ACTOR_INTERACTION_TARGET_KIND } from "@game-core/api/actorInteractions";
import { hasVerticalSupport } from "@game-core/api/verticalMovement";
import { advanceTimer, createInitialEngineTimer } from "@game-core/impl/timer";
import { mapHash } from "@game-core/impl/hash";
import {
  actorInventoryClearBoots,
  actorInventoryClearTools,
  actorInventoryHasBoot,
  actorInventoryHasKey,
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
import {
  cloneStatefulActorRuntimeStore,
  createStatefulActorRuntimeStore,
  type StatefulActorRuntimeEntry,
  type StatefulActorRuntimeStore,
} from "@game-core/impl/statefulActorRuntime";
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
  applyBlockedMsCreatureAttempt as applyBlockedMsCreatureAttemptWithContext,
  chooseMsCreatureDirection as chooseMsCreatureDirectionWithContext,
  type MsCreatureControllerContext,
} from "@ruleset-ms/impl/controllers";
import { projectMsActorInventoryOwner, type MsActorLocalInventoryState } from "@ruleset-ms/impl/actorCollections";
import {
  collectLevelConnections,
  collectLevelCreaturePositions,
  levelLayers,
  type MsConnection,
  type MsLevel,
} from "@ruleset-ms/api/level";
import {
  msActorClonerFamilyHooks,
  msActorEntryMask,
  msActorMovementStrategyId,
  msBlockMovementMask,
  msButtonAction,
  msChipMovementMask,
  msDoorKeyIndex,
  msExitMovementMask,
  msIceWallTurn,
  msIsOverlayFloorTile,
  msPreservesUnderlyingFloor,
  msRequiresReleaseToExit,
  msSlideDirection,
  msTileHasTag,
  msTileForcedFloorKind,
} from "@ruleset-ms/impl/catalog";
import {
  msActorArrivalOutcome,
  msActorCollisionOutcome,
  msActorHazardOutcome,
  msActorInteractionOutcome,
  msActorThiefOutcome,
} from "@ruleset-ms/impl/actorInteractions";
import { applyMsActorArrivalEffects, canMsActorEnterTile, msRuntimeActorArrivalOutcome } from "@ruleset-ms/impl/actorArrival";
import {
  applyMsMobExitFloorEffect,
  applyMsBlockedChipEnterEffect,
  applyMsTileActivationEffect,
  deferredMsTileActivationSound,
  hasMsTileActivation,
} from "@ruleset-ms/impl/tileEffects";
import { msBlockedMoveFloorImpactAction } from "@ruleset-ms/impl/floorImpactPolicy";
import {
  activateMsPortableTool,
  attachMsPortableToolToActor,
  clearMsToolInventory,
  cloneMsPortableTool,
  collectMsPortableItemsFromLayers,
  destroyMsPortableTool,
  detachMsPortableToolToMap,
  findMsPortableToolAttachedToActor,
  primedMsPortableToolItem,
  projectMsPortableToolState,
  queueMsToolInventoryReplacement,
  reconcileMsPortableToolProjection,
  settleMsPrimedToolDrop,
  type MsPortableToolStateStore,
} from "@ruleset-ms/impl/portableItems";
import {
  attachMsStatefulActorPortableBacking,
  cloneMsStatefulActorRuntimeForCloner,
  detachMsStatefulActorPortableBacking,
  destroyMsStatefulActorRuntime,
  findMsStatefulActorRuntime,
  seedMsStatefulActorRuntime,
  spawnMsBowlingBallStatefulActorFromPortable,
  type MsStatefulActorRuntimeEntry,
} from "@ruleset-ms/impl/statefulActors";
import { queryMsOccupancyTarget } from "@ruleset-ms/impl/occupancy";
import { applyMsChipEnterEffects } from "@ruleset-ms/impl/chipArrival";
import { applyMsPortableToolAction } from "@ruleset-ms/impl/portableToolActions";
import {
  moveMsChipDownOneLayer as moveMsChipDownOneLayerWithContext,
  moveMsChipPlanar as moveMsChipPlanarWithContext,
  moveMsChipUpOneLayer as moveMsChipUpOneLayerWithContext,
} from "@ruleset-ms/impl/chipMovement";
import {
  activateMsCloner,
  hasMsTrapConnection,
  isMsTrapOpen,
  springMsTrap,
} from "@ruleset-ms/impl/trapCloner";
import { MsNonChipFloorQueue, type MsActiveNonChipFloorEntry } from "@ruleset-ms/impl/nonChipFloorQueue";
import {
  moveMsCreatureDownOneLayer as moveMsCreatureDownOneLayerWithContext,
  moveMsCreaturePlanar as moveMsCreaturePlanarWithContext,
  moveMsCreatureUpOneLayer as moveMsCreatureUpOneLayerWithContext,
} from "@ruleset-ms/impl/creatureMovement";
import {
  applyMsCreatureCollisionAfterCompletedStep,
  applyMsCreatureCompletedStep,
  applyMsCreatureEnteredCell,
  applyMsCreatureFloorImpact,
} from "@ruleset-ms/impl/actorMovementLifecycle";
import {
  canStartMsChipMoveByStrategy,
  type MsBlockMovementStrategyContext,
  type MsChipMovementStrategyContext,
  type MsCreatureMovementStrategyContext,
  startMsBlockMoveByStrategy,
  startMsBlockUpMoveByStrategy,
  startMsChipDownMoveByStrategy,
  startMsChipMoveByStrategy,
  startMsChipUpMoveByStrategy,
  startMsCreatureDownMoveByStrategy,
  startMsCreatureMoveByStrategy,
  startMsCreatureUpMoveByStrategy,
} from "@ruleset-ms/impl/movementStrategies";
import {
  findMsBlockTeleportDestination,
  findMsCreatureTeleportDestination,
  resolveMsChipTeleportDestination,
} from "@ruleset-ms/impl/teleports";
import {
  canChipUseMsElevator,
  canNonChipUseMsElevator,
  resolveMsChipSupportBelow,
  resolveMsNonChipSupportBelow,
  resolveMsRuntimeActorSupportBelow,
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
import type {
  MsGameState,
  MsInternalState,
  MsPortableToolRuntimeState,
  MsRandomRuntimeState,
  MsRuntimeLayer,
  MsRuntimeState,
  MsSessionReplayOptions,
  MsStatefulActorRuntimeState,
  MsTickContext,
  MsTrackedBlock,
  MsTrackedCreature,
} from './engineTypes';
import {
  HIDDEN_WALL_REVEAL_TTL,
  MS_AIR_MOVEMENT_DIR,
  MS_DEBUG_SCHEMA_VERSION,
  MS_ELEVATOR_MOVEMENT_DIR,
  PUSH_BLOCK_PICKUP_REVEAL_TTL,
  RANDOM3_DIVISOR,
  RANDOM3_MASK,
  RANDOM4_DIVISOR,
  RANDOM4_MASK,
  UINT31_MASK,
} from './engineTypes';
import type { MsAdvanceTickRuntime } from './engineTick';
import {
  holdMsCreatureOnCloneMachine,
  projectMsRuntimeActorInventoryOwner,
  queryMsTargetOccupancy,
  resolveMsCreaturePreMoveCollision,
} from './engineActorRuntime';
import {
  activateMappedBowlingBallsOnForceFloors,
  canMoveCreatureWithOptions,
  createMsCreatureMovementContext,
  creatureAtPos,
  findVisibleTrackedBlock,
  isTrapButtonDown,
  upsertTrackedBlock,
} from './engineMovement';
export function normalizeRandomSeed(seed: number | undefined): bigint {
  return BigInt((seed ?? 0) & Number(UINT31_MASK));
}

export function rightDirection(dir: number): number {
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

export function nextRandomValue(value: bigint): bigint {
  return ((value * 1103515245n) + 12345n) & UINT31_MASK;
}

export function msRandomState(internal: MsInternalState): MsRandomRuntimeState {
  return internal.randomState;
}

export function msPortableToolState(internal: MsInternalState): MsPortableToolRuntimeState {
  return internal.portableTools;
}

export function msDetachedToolInventoryProjection(): Pick<EngineState["inventory"], "tools"> {
  return {
    tools: [0] as EngineState["inventory"]["tools"],
  };
}

export function tryActivateMsBowlingBallThrow(
  runtime: MsAdvanceTickRuntime,
  carried: MsPortableToolRuntimeState["portableItems"][number],
  dir: number,
): boolean {
  const z = runtime.internal.chipZ ?? 1;
  const cells = runtime.layerCellsByZ.get(z) ?? runtime.initialCells;
  const targetStep = advanceToCell(cells, runtime.internal.chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return false;
  }

  const targetOccupancy = queryMsTargetOccupancy(cells, runtime.internal, targetStep.pos, z);
  if (!carried.bowlingBallState) {
    return false;
  }
  const targetTop = cells[targetStep.pos]!.top.id;
  const targetTopState = cells[targetStep.pos]!.top.state;
  const targetBottom = cells[targetStep.pos]!.bottom.id;
  const targetBottomState = cells[targetStep.pos]!.bottom.state;

  const probeCreature: MsTrackedCreature = {
    serial: -1,
    id: MS_TILE.BowlingBall,
    dir,
    tdir: MS_DIRECTION.none,
    pos: runtime.internal.chipPos,
    z,
    hidden: false,
    moving: 0,
    frame: 0,
    cloning: false,
    released: runtime.internal.chipReleased,
    turning: false,
    hasMoved: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    sliding: false,
  };
  if (
    !canMoveCreatureWithOptions(
      cells,
      probeCreature,
      dir,
      false,
      false,
      runtime.internal,
      runtime.inventory,
      carried.bowlingBallState.localInventory,
    )
  ) {
    return false;
  }

  setBowlingBallMode(carried.bowlingBallState, "moving", dir);
  const actorSerial = runtime.internal.nextCreatureSerial;
  if (!activateMsPortableTool(msPortableToolState(runtime.internal), runtime.inventory, carried.serial, actorSerial)) {
    setBowlingBallMode(carried.bowlingBallState, "still", dir);
    return false;
  }

  const creature = spawnMsThrownBowlingBallCreature(
    runtime,
    carried.serial,
    carried.bowlingBallState,
    actorSerial,
    runtime.internal.chipPos,
    z,
    dir,
  );
  if (targetOccupancy.kind !== "empty") {
    resolveMsCreaturePreMoveCollision(
      cloneBoardCells(cells),
      cells,
      runtime.internal,
      runtime.inventory,
      creature,
      targetStep.pos,
      dir,
    );
    return true;
  }

  creature.pos = targetStep.pos;
  pushTile(cells, targetStep.pos, { id: MS_TILE.Empty, state: 0 });
  cells[targetStep.pos]!.top = {
    id: msCreatureTile(MS_TILE.BowlingBall, dir),
    state: 0,
  };
  settleMsSpawnedBowlingBallLanding(
    runtime,
    cells,
    creature,
    dir,
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
  );
  return true;
}

export function spawnMsThrownBowlingBallCreature(
  runtime: MsAdvanceTickRuntime,
  portableItemSerial: number,
  bowlingBallState: BowlingBallState,
  actorSerial: number,
  pos: number,
  z: number,
  dir: number,
): MsTrackedCreature {
  runtime.internal.nextCreatureSerial = actorSerial + 1;
  const creature: MsTrackedCreature = {
    serial: actorSerial,
    id: MS_TILE.BowlingBall,
    dir,
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
  };
  runtime.internal.creatures.push(creature);
  runtime.internal.creatureIndexBySerial.set(actorSerial, runtime.internal.creatures.length - 1);
  spawnMsBowlingBallStatefulActorFromPortable(
    runtime.internal.statefulActors,
    actorSerial,
    portableItemSerial,
    bowlingBallState,
  );
  return creature;
}

export function settleMsSpawnedBowlingBallLanding(
  runtime: MsAdvanceTickRuntime,
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  targetTop: number,
  targetTopState: number,
  targetBottom: number,
  targetBottomState: number,
): void {
  const context = createMsCreatureMovementContext(runtime.internal, runtime.inventory);
  const standingFloorWasTop = !isMsCreature(targetTop);
  const standingFloor = standingFloorWasTop ? targetTop : targetBottom;
  const standingFloorState = standingFloorWasTop ? targetTopState : targetBottomState;
  const landedPos = applyMsCreatureEnteredCell(
    context,
    cells,
    creature,
    creature.pos,
    dir,
    runtime.internal.chipPos,
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
    standingFloor,
    standingFloorState,
  );
  const floorImpact = applyMsCreatureFloorImpact(
    context,
    cells,
    landedPos,
    true,
    creature,
    context.arrivalOutcome(creature, standingFloor),
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
  );
  runtime.internal.pendingSoundEffects |= floorImpact.soundEffects;
  if (floorImpact.removed) {
    return;
  }

  runtime.internal.pendingSoundEffects |= applyMsCreatureCompletedStep(
    context,
    cells,
    landedPos,
    true,
    creature,
    landedPos,
    standingFloor,
  );
  applyMsCreatureCollisionAfterCompletedStep(cells, creature.pos, () => {
    runtime.internal.chipStatus = "collided";
  });
  runtime.internal.pendingSoundEffects |= context.applyArrivalEffects(cells, creature);
  if (
    !creature.hidden &&
    bottomTile(cells, creature.pos).id === MS_TILE.CloneMachine &&
    msActorClonerFamilyHooks(creature.id).entryBehavior === "occupy-and-hold"
  ) {
    holdMsCreatureOnCloneMachine(cells, runtime.internal, creature);
  }
}

export function advanceRandom(internal: MsInternalState): bigint {
  const randomState = msRandomState(internal);
  randomState.value = nextRandomValue(randomState.value);
  return randomState.value;
}

export function random4(internal: MsInternalState): number {
  return Number(advanceRandom(internal) >> 29n);
}

export function randomp3(internal: MsInternalState, array: number[]): void {
  const value = advanceRandom(internal);
  let index = Number(value >> 30n);
  [array[index], array[1]] = [array[1]!, array[index]!];
  index = Number((3n * (value & RANDOM3_MASK)) / RANDOM3_DIVISOR);
  [array[index], array[2]] = [array[2]!, array[index]!];
}

export function randomp4(internal: MsInternalState, array: number[]): void {
  const value = advanceRandom(internal);
  let index = Number(value >> 30n);
  [array[index], array[1]] = [array[1]!, array[index]!];
  index = Number((3n * (value & RANDOM4_MASK)) / RANDOM4_DIVISOR);
  [array[index], array[2]] = [array[2]!, array[index]!];
  index = Number((value >> 28n) & 3n);
  [array[index], array[3]] = [array[3]!, array[index]!];
}

export function isIceFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "ice";
}

export function isSlideFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "slide";
}

export function msForcedFloorBootIndex(floor: number): number | null {
  if (isIceFloor(floor)) {
    return 0;
  }
  if (isSlideFloor(floor)) {
    return 1;
  }
  return null;
}

export function msActorTreatsForcedFloorAsNormal(
  creature: Pick<MsTrackedCreature, "id" | "serial">,
  floor: number,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): boolean {
  const bootIndex = msForcedFloorBootIndex(floor);
  if (bootIndex === null) {
    return false;
  }

  return actorInventoryHasBoot(
    projectMsRuntimeActorInventoryOwner(creature.id, creature.serial, inventory, internal),
    bootIndex,
  );
}

export function isAirFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "air";
}

export function isElevatorFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "elevator";
}

export function slideDirection(floor: number, internal: MsInternalState): number {
  return msSlideDirection(
    floor,
    floor === MS_TILE.Slide_Random ? 1 << random4(internal) : MS_DIRECTION.none,
  );
}

export function iceWallTurn(floor: number, dir: number): number {
  return msIceWallTurn(floor, dir);
}

export function floorAt(cells: EngineMapCell[], pos: number): number {
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

export function floorTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
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

export function msLowerRuntimeCells(
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  z: number | undefined,
): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  if (currentZ <= 1) {
    return null;
  }

  return layerCellsByZ.get(currentZ - 1) ?? null;
}

export function msUpperRuntimeCells(
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  z: number | undefined,
): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  return layerCellsByZ.get(currentZ + 1) ?? null;
}

export function canLeaveFloor(cells: EngineMapCell[], pos: number, dir: number, released: boolean): boolean {
  const floor = cells[pos] ? bottomTileId(cells, pos) : MS_TILE.Empty;
  if ((msExitMovementMask(floor) & dir) === 0) {
    return false;
  }
  return !msRequiresReleaseToExit(floor) || released;
}

export function pushTile(cells: EngineMapCell[], pos: number, tile: EngineMapCell["top"]): void {
  const cell = cells[pos];
  if (!cell) {
    return;
  }

  if (
    cell.top.id === MS_TILE.Empty &&
    cell.bottom.id === MS_TILE.CloneMachine
  ) {
    cell.top = { ...tile };
    return;
  }

  pushBoardTile(cells, pos, tile);
}

export function popTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
  return popBoardTile(cells, pos, MS_TILE.Empty);
}

export function popExitedMsMobSourceTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
  const tile = popTile(cells, pos);
  applyMsMobExitFloorEffect(cells, pos);
  return tile;
}

export function placeStaticBlock(cells: EngineMapCell[], pos: number, state: number): void {
  const cell = boardCell(cells, pos);
  if (cell.top.id !== MS_TILE.Empty) {
    pushTile(cells, pos, { id: MS_TILE.Empty, state: 0 });
  }
  cell.top = {
    id: MS_TILE.Block_Static,
    state,
  };
}

export function cloneInventory(inventory: EngineState["inventory"]): EngineState["inventory"] {
  return {
    keys: [...inventory.keys] as EngineState["inventory"]["keys"],
    boots: [...inventory.boots] as EngineState["inventory"]["boots"],
    tools: [...inventory.tools] as EngineState["inventory"]["tools"],
    chipsNeeded: inventory.chipsNeeded,
  };
}

export function msRuntimeState(engine: EngineState): MsRuntimeState {
  const runtime = engine as EngineState & { msRuntimeState?: MsRuntimeState };
  if (!runtime.msRuntimeState) {
    runtime.msRuntimeState = {
      tileOverlays: [],
    };
  }
  return runtime.msRuntimeState;
}

export function clearMsTileOverlays(engine: EngineState): void {
  const runtime = msRuntimeState(engine);
  runtime.tileOverlays = runtime.tileOverlays
    .map((overlay) => ({ ...overlay, ttl: overlay.ttl - 1 }))
    .filter((overlay) => overlay.ttl > 0);
}

export function addMsTileOverlay(
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

export function createMsTickContext(
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

export function findPressedMsPermanentHiddenWallPos(cells: EngineMapCell[], chipPos: number, dir: number): number | null {
  const targetStep = advanceToCell(cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  return floorAt(cells, targetStep.pos) === MS_TILE.HiddenWall_Perm ? targetStep.pos : null;
}

export function isMsPushPickupRevealTile(id: number): boolean {
  return (
    id === MS_TILE.ICChip ||
    (id >= MS_TILE.Key_Red && id <= MS_TILE.Key_Green) ||
    (id >= MS_TILE.Boots_Ice && id <= MS_TILE.Boots_Water)
  );
}

export function findPushedMsBlockPickupRevealTileId(cells: EngineMapCell[], chipPos: number, dir: number): number | null {
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

export function runtimeMapLayers(map: EngineState["map"]): MsRuntimeLayer[] {
  return map.layers?.map((layer) => ({ z: layer.z, cells: layer.cells })) ?? [{ z: 1, cells: map.cells }];
}

export function cloneRuntimeMapLayers(map: EngineState["map"]): MsRuntimeLayer[] {
  return runtimeMapLayers(map).map((layer) => ({
    z: layer.z,
    cells: cloneBoardCells(layer.cells),
  }));
}

export function runtimeCellsForZ(layers: ReadonlyArray<MsRuntimeLayer>, z = 1): EngineMapCell[] {
  return layers.find((layer) => layer.z === z)?.cells ?? layers[0]!.cells;
}

export function runtimeLayerCellsByZ(layers: ReadonlyArray<MsRuntimeLayer>): Map<number, EngineMapCell[]> {
  return new Map<number, EngineMapCell[]>(layers.map((layer) => [layer.z, layer.cells]));
}

export function runtimeCellZ(cells: EngineMapCell[], pos: number): number {
  return cells[pos]?.position.z ?? cells[0]?.position.z ?? 1;
}

export function forEachRuntimeLayer(
  layers: ReadonlyArray<MsRuntimeLayer>,
  visit: (cells: EngineMapCell[], z: number) => void,
): void {
  for (const layer of layers) {
    visit(layer.cells, layer.z);
  }
}

export function createTrackedBlockState(pos: number, dir: number, z = 1): MsTrackedBlock {
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

export function cloneInternalState(internal: MsInternalState): MsInternalState {
  return {
    ...internal,
    creatures: internal.creatures.map((creature) => ({ ...creature })),
    creatureIndexBySerial: new Map(internal.creatureIndexBySerial),
    creatureSlipList: internal.creatureSlipList.map((entry) => ({ ...entry })),
    blocks: internal.blocks.map((block) => ({ ...block })),
    cloneSourceSerialByPosition: new Map(internal.cloneSourceSerialByPosition),
    traps: internal.traps.map((connection) => ({ ...connection })),
    cloners: internal.cloners.map((connection) => ({ ...connection })),
    pendingCloners: [...internal.pendingCloners],
    pendingSoundEffects: internal.pendingSoundEffects,
    lastSlipDir: internal.lastSlipDir,
    randomState: { ...internal.randomState },
    statefulActors: cloneStatefulActorRuntimeStore(internal.statefulActors),
    portableTools: {
      portableItems: internal.portableTools.portableItems.map((item) => ({
        ...item,
        state: { ...item.state },
      })),
      nextPortableItemSerial: internal.portableTools.nextPortableItemSerial,
      primedToolDrop: internal.portableTools.primedToolDrop ? { ...internal.portableTools.primedToolDrop } : null,
      pendingToolDropAfterSettle: internal.portableTools.pendingToolDropAfterSettle
        ? { ...internal.portableTools.pendingToolDropAfterSettle }
        : null,
    },
    goalPos: internal.goalPos,
    runtimeLayers: internal.runtimeLayers.map((layer) => ({
      z: layer.z,
      cells: layer.cells,
    })),
  };
}


export function statusName(internal: MsInternalState): EngineState["status"] {
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

export function updateEngine(
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
              initial: String(state.internal.randomState.initial),
              value: String(state.internal.randomState.value),
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

export function initializeBrokenFloors(cells: EngineMapCell[]): void {
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

export function updateChipTile(cells: EngineMapCell[], internal: MsInternalState): void {
  if (internal.chipStatus !== "okay") {
    return;
  }

  const chipBase = floorAt(cells, internal.chipPos) === MS_TILE.Water ? MS_TILE.Swimming_Chip : MS_TILE.Chip;
  replaceTopTile(cells, internal.chipPos, {
    id: msCreatureTile(chipBase, internal.chipDir),
    state: 0,
  });
}

export function msChipActsWallForMobs(internal: MsInternalState | null, pos: number, z: number): boolean {
  return (
    internal !== null &&
    internal.chipStatus === "okay" &&
    primedMsPortableToolItem(msPortableToolState(internal)) !== undefined &&
    internal.chipPos === pos &&
    (internal.chipZ ?? 1) === z
  );
}

export function refreshFloorMovement(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): void {
  const chipInventory = projectMsActorInventoryOwner(MS_TILE.Chip, inventory);
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

export function refreshFloorMovementFromEnteredTile(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  enteredFloor: number,
  enteredFloorState: number,
): void {
  const chipInventory = projectMsActorInventoryOwner(MS_TILE.Chip, inventory);
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
  let nextCreatureSerial = 1;
  const seededPositions = new Set<string>();
  const layerPositionKey = (pos: number, z: number) => `${z}:${pos}`;
  const cloneSourceSerialByPosition = new Map<string, number>();
  const statefulActors = createStatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>();

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
          serial: nextCreatureSerial,
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
        seedMsStatefulActorRuntime(
          statefulActors,
          nextCreatureSerial,
          creatureId,
        );
        nextCreatureSerial += 1;
      } else {
        cloneSourceSerialByPosition.set(layerPositionKey(pos, z), nextCreatureSerial);
        seedMsStatefulActorRuntime(
          statefulActors,
          nextCreatureSerial,
          creatureId,
        );
        nextCreatureSerial += 1;
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
    cloneSourceSerialByPosition,
    traps: collectLevelConnections(level, "traps"),
    cloners: collectLevelConnections(level, "cloners"),
    pendingCloners: [],
    pendingSoundEffects: 0,
    nextCreatureSerial,
    nextSlipOrder: 0,
    randomState: {
      initial: normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed),
      value: normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed),
    },
    lastSlipDir: MS_DIRECTION.none,
    statefulActors,
    portableTools: {
      portableItems: [],
      nextPortableItemSerial: 1,
      primedToolDrop: null,
      pendingToolDropAfterSettle: null,
    },
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
  internal.portableTools.portableItems = collectMsPortableItemsFromLayers(runtimeLayers);
  internal.portableTools.nextPortableItemSerial = internal.portableTools.portableItems.length + 1;

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
      springMsTrap({
        cells: layerCells,
        traps: internal.traps,
        buttonPos: connection.from,
        buttonZ: z,
        chipPos: internal.chipPos,
        chipZ: internal.chipZ,
        releaseChip: () => {
          internal.chipReleased = true;
        },
        findTrackedBlock: (pos, layerZ) => findVisibleTrackedBlock(internal, pos, layerZ),
        releaseStaticBlock: (pos) => upsertTrackedBlock(layerCells, internal, pos, MS_DIRECTION.none),
        findCreature: (pos, layerZ) => creatureAtPos(internal, pos, layerZ),
      });
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
  projectMsPortableToolState(msPortableToolState(internal), engine.inventory);

  const mapLayers = runtimeMapLayers(engine.map);
  activateMappedBowlingBallsOnForceFloors(runtimeLayerCellsByZ(mapLayers), internal, engine.inventory);
  projectMsPortableToolState(msPortableToolState(internal), engine.inventory);
  const activeCells = runtimeCellsForZ(mapLayers, chipZ);
  engine.map.cells = activeCells;

  return updateEngine({ engine, internal }, activeCells, 0, false, mapLayers);
}
