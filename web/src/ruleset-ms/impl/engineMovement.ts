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
  ChipMoveOptions,
  MsInternalState,
  MsRuntimeLayer,
  MsTickContext,
  MsTrackedBlock,
  MsTrackedCreature,
} from './engineTypes';
import {
  HIDDEN_WALL_REVEAL_TTL,
  MS_AIR_MOVEMENT_DIR,
  MS_ELEVATOR_MOVEMENT_DIR,
  PUSH_BLOCK_PICKUP_REVEAL_TTL,
} from './engineTypes';
import {
  applyMsChipCollisionOutcome,
  applyMsActorThiefHook,
  cloneMsPortableBackedActorForCloner,
  destroyMsPortableBackedActorRuntime,
  destroyMsTrackedCreature,
  holdMsCreatureOnCloneMachine,
  maybeRevertPortableBackedCreatureOnBlockedMove,
  msInteractionTargetFromOccupancy,
  msPortableBackedActorItemSerial,
  msRuntimeActorEntry,
  projectMsRuntimeActorInventoryOwner,
  queryMsTargetOccupancy,
  removeMsCollisionTarget,
  removeMsTargetRuntimeActor,
  resolveMsCreaturePreMoveCollision,
  revealMsBallisticBlockedEnter,
  syncMsPortableBackedActorStateToPortableItem,
} from './engineActorRuntime';
import {
  addMsTileOverlay,
  canLeaveFloor,
  createMsTickContext,
  findPressedMsPermanentHiddenWallPos,
  findPushedMsBlockPickupRevealTileId,
  floorAt,
  floorTile,
  forEachRuntimeLayer,
  iceWallTurn,
  isAirFloor,
  isElevatorFloor,
  isIceFloor,
  isMsPushPickupRevealTile,
  isSlideFloor,
  msActorTreatsForcedFloorAsNormal,
  msChipActsWallForMobs,
  msLowerRuntimeCells,
  msPortableToolState,
  msRandomState,
  msRuntimeState,
  msUpperRuntimeCells,
  placeStaticBlock,
  popExitedMsMobSourceTile,
  popTile,
  pushTile,
  randomp3,
  randomp4,
  refreshFloorMovement,
  refreshFloorMovementFromEnteredTile,
  rightDirection,
  runtimeCellZ,
  runtimeCellsForZ,
  runtimeLayerCellsByZ,
  slideDirection,
  statusName,
  updateChipTile,
  updateEngine,
} from './engineRuntime';
import { emitMsQueueTrace } from './engineQueueTrace';
export function canMoveChip(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
  options: ChipMoveOptions = {},
): boolean {
  const chipInventory = projectMsActorInventoryOwner(MS_TILE.Chip, inventory);
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
  const targetOccupancy = queryMsTargetOccupancy(cells, internal, to);
  if (
    (targetOccupancy.kind === "runtime-actor" || targetOccupancy.kind === "chip") &&
    msActorInteractionOutcome(MS_TILE.Chip, msInteractionTargetFromOccupancy(targetOccupancy, dir)).denyMove
  ) {
    return false;
  }
  if (targetOccupancy.kind === "runtime-actor" || targetOccupancy.kind === "chip") {
    const targetId = msCreatureId(cells[to]!.top.id);
    if (targetId === MS_TILE.Block) {
      return false;
    } else if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      return false;
    }
  }
  if (applyMsBlockedChipEnterEffect(cells, to, exposeWalls)) {
    return false;
  }
  if (targetOccupancy.kind === "static-block") {
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

export function canMoveCreature(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  internal: MsInternalState | null = null,
  inventory: EngineState["inventory"] | null = null,
): boolean {
  return canMoveCreatureWithOptions(cells, creature, dir, false, false, internal, inventory);
}

export function canMoveCreatureWithOptions(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  ignoreFireCheck: boolean,
  cloneCantBlock = false,
  internal: MsInternalState | null = null,
  inventory: EngineState["inventory"] | null = null,
  localInventory: MsActorLocalInventoryState = null,
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
  const targetOccupancy = internal ? queryMsTargetOccupancy(cells, internal, to, creature.z ?? 1) : null;
  const targetInteraction =
    targetOccupancy && internal
      ? msActorInteractionOutcome(creature.id, msInteractionTargetFromOccupancy(targetOccupancy, dir))
      : null;
  const removesTarget = Boolean(targetInteraction?.removeTargetActor || targetInteraction?.consumeTarget);
  if (targetInteraction?.denyMove) {
    return false;
  }
  if (targetOccupancy?.kind === "portable-item" || targetOccupancy?.kind === "static-block") {
    return removesTarget;
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
      if (removesTarget) {
        return true;
      }
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
    if (removesTarget) {
      return true;
    }
  }
  if ((msActorEntryMask(floor, creature.id) & dir) === 0) {
    return false;
  }
  if (internal && inventory) {
    const inventoryOwner = projectMsRuntimeActorInventoryOwner(
      creature.id,
      creature.serial,
      inventory,
      internal,
      localInventory,
    );
    if (!canMsActorEnterTile(floor, creature.id, inventory, inventoryOwner)) {
      return false;
    }
  }
  if (!ignoreFireCheck && msActorHazardOutcome(floor, creature.id) === "deny-entry") {
    return false;
  }
  if (
    cells[to]!.bottom.id === MS_TILE.CloneMachine &&
    msActorClonerFamilyHooks(creature.id).entryBehavior === "none"
  ) {
    return false;
  }

  return true;
}

export function canMoveBlockInto(
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

  const targetOccupancy = internal ? queryMsTargetOccupancy(cells, internal, to) : null;
  if (targetOccupancy?.kind === "chip") {
    return true;
  }
  if (targetOccupancy?.kind === "portable-item") {
    return !msActorInteractionOutcome(MS_TILE.Block, msInteractionTargetFromOccupancy(targetOccupancy)).denyMove;
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

export function moveBlock(
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
  switch (msActorArrivalOutcome(targetTop, MS_TILE.Block)) {
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
    landingPos = findMsBlockTeleportDestination({
      cells,
      start: nextPos,
      dir,
      occupiedOriginPos: pos,
      canExit: (exitPos) => canMoveBlockInto(cells, exitPos, dir, pos, internal),
    });
  }

  placeStaticBlock(cells, landingPos, movedTile.state);
  if (oldWasCloneMachine) {
    cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }

  const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(MS_TILE.Block, targetCreatureId));

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
      const buttonSoundEffects = resolveButtonFloorEffects(cells, internal, null, landingPos, landedButtonFloor);
      internal.pendingSoundEffects |= buttonSoundEffects;
    }
  }

  return movedMovement();
}

export function moveBlockOnce(
  cells: EngineMapCell[],
  internal: MsInternalState,
  pos: number,
  dir: number,
  deferButtons: boolean,
  preserveSourceTile: boolean,
  occupiedOriginPos = -1,
): MovementAttemptResult {
  return startMsBlockMoveByStrategy(
    msActorMovementStrategyId(MS_TILE.Block),
    createMsBlockMovementStrategyDispatchContext(),
    cells,
    internal,
    pos,
    dir,
    deferButtons,
    preserveSourceTile,
    occupiedOriginPos,
  );
}

export function pushBlock(
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
  const moveResult = moveBlockOnce(cells, internal, pos, dir, deferButtons, false, occupiedOriginPos);
  if (!movementDidSucceed(moveResult) && trackedBlock && !trackedBlock.hidden && !teleportPush) {
    const standingFloor = bottomTileIdOr(cells, pos, MS_TILE.Empty);
    if (standingFloor !== MS_TILE.Beartrap && standingFloor !== MS_TILE.CloneMachine && trackedBlock.floorMovement === "none") {
      trackedBlock.dir = dir;
    }
  }
  return movementDidSucceed(moveResult);
}

export function advanceCloneMachineBlock(cells: EngineMapCell[], internal: MsInternalState, pos: number, dir: number): boolean {
  return movementDidSucceed(moveBlockOnce(cells, internal, pos, dir, false, true));
}

export function creatureAtPos(internal: MsInternalState, pos: number, z = 1): MsTrackedCreature | undefined {
  return internal.creatures.find((creature) => !creature.hidden && creature.pos === pos && (creature.z ?? 1) === z);
}

export function isTrapButtonDown(cells: EngineMapCell[], pos: number): boolean {
  return pos >= 0 && pos < cells.length && topTileId(cells, pos) !== MS_TILE.Button_Brown;
}

export function resolveButtonFloorEffects(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"] | null,
  buttonPos: number,
  floor: number,
  inMidMove: MsTrackedCreature | null = null,
  buttonZ = inMidMove?.z ?? internal.chipZ ?? 1,
): number {
  return applyMsTileActivationEffect(
    {
      turnTanks: (activeCreature) => turnTanks(cells, internal, activeCreature ?? null),
      toggleWalls: () => {
        toggleWalls(internal.runtimeLayers);
      },
      activateCloner: (activationButtonPos, activationButtonZ) => {
        activateMsCloner({
          cells,
          cloners: internal.cloners,
          buttonPos: activationButtonPos,
          buttonZ: activationButtonZ,
          moveBlockSource: (sourcePos, sourceDir, sourceIsCloneMachine) => {
            if (sourceIsCloneMachine) {
              advanceCloneMachineBlock(cells, internal, sourcePos, sourceDir);
            } else {
              moveBlockOnce(cells, internal, sourcePos, sourceDir, false, false);
            }
          },
          canCloneCreatureMove: (sourcePos, sourceId, sourceDir) =>
            canMoveCreatureWithOptions(
              cells,
              {
                serial:
                  creatureAtPos(internal, sourcePos, buttonZ)?.serial ??
                  internal.cloneSourceSerialByPosition.get(`${buttonZ}:${sourcePos}`) ??
                  -1,
                id: sourceId,
                dir: sourceDir,
                tdir: MS_DIRECTION.none,
                pos: sourcePos,
                z: buttonZ,
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
              inventory,
            ),
          spawnCreatureClone: (sourcePos, sourceId, sourceDir, z, cloneFamilyRuntime) => {
            const clonedCreatureSerial = internal.nextCreatureSerial;
            const sourceCreature = creatureAtPos(internal, sourcePos, z);
            const sourceSerial = sourceCreature?.serial ?? internal.cloneSourceSerialByPosition.get(`${z}:${sourcePos}`);
            internal.creatures.push({
              serial: clonedCreatureSerial,
              id: sourceId,
              dir: sourceDir,
              tdir: MS_DIRECTION.none,
              pos: sourcePos,
              z,
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
            internal.creatureIndexBySerial.set(clonedCreatureSerial, internal.creatures.length - 1);
            if (cloneFamilyRuntime && typeof sourceSerial === "number") {
              cloneMsPortableBackedActorForCloner(internal, sourceSerial, clonedCreatureSerial);
            }
            internal.nextCreatureSerial = clonedCreatureSerial + 1;
          },
        });
      },
      springTrap: (activationButtonPos, activationButtonZ) => {
        springMsTrap({
          cells,
          traps: internal.traps,
          buttonPos: activationButtonPos,
          buttonZ: activationButtonZ,
          chipPos: internal.chipPos,
          chipZ: internal.chipZ,
          releaseChip: () => {
            internal.chipReleased = true;
          },
          findTrackedBlock: (pos, layerZ) => findVisibleTrackedBlock(internal, pos, layerZ),
          releaseStaticBlock: (pos) => upsertTrackedBlock(cells, internal, pos, MS_DIRECTION.none),
          findCreature: (pos, layerZ) => creatureAtPos(internal, pos, layerZ),
        });
      },
      buttonPushedSound: 1 << MS_SOUND.ButtonPushed,
    },
    buttonPos,
    floor,
    buttonZ,
    inMidMove,
  );
}

export function floorHasMsButtonAction(floor: number): boolean {
  return hasMsTileActivation(floor);
}

export function resolveDeferredOrImmediateButtonLandingEffects(
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
    return deferredMsTileActivationSound(floor, 1 << MS_SOUND.ButtonPushed);
  }

  return resolveButtonFloorEffects(cells, internal, null, pos, floor, actor, buttonZ);
}

export function handleDeferredButtons(cells: EngineMapCell[], internal: MsInternalState): number {
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
      soundEffects |= resolveButtonFloorEffects(
        cells,
        internal,
        null,
        cell.position.pos,
        floor,
        null,
        runtimeCellZ(cells, cell.position.pos),
      );
    }
  }

  return soundEffects;
}

export function resetButtons(cells: EngineMapCell[]): void {
  for (const cell of cells) {
    removeTopTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown);
    removeBottomTileFlags(cells, cell.position.pos, MS_FLOOR_STATE.ButtonDown);
  }
}

export function updateCreatureTile(cells: EngineMapCell[], creature: MsTrackedCreature): void {
  updateCreatureTileWithForce(cells, creature, false);
}

export function updateCreatureTileWithForce(cells: EngineMapCell[], creature: MsTrackedCreature, force: boolean): void {
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

export function creatureIndexForSerial(internal: MsInternalState, serial: number): number {
  return internal.creatureIndexBySerial.get(serial) ?? -1;
}

export function creatureForSerial(internal: MsInternalState, serial: number): MsTrackedCreature | undefined {
  const creatureIndex = creatureIndexForSerial(internal, serial);
  return creatureIndex >= 0 ? internal.creatures[creatureIndex] : undefined;
}

export function findCreatureSlipIndex(internal: MsInternalState, serial: number): number {
  return internal.creatureSlipList.findIndex((entry) => entry.serial === serial);
}

export function reserveNextSlipOrder(internal: MsInternalState): number {
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

export function clearCreatureFloorMovement(creature: MsTrackedCreature, internal: MsInternalState): void {
  creature.floorMovement = "none";
  creature.floorMovementDir = MS_DIRECTION.none;
  creature.sliding = false;

  const slipIndex = findCreatureSlipIndex(internal, creature.serial);
  if (slipIndex >= 0) {
    internal.creatureSlipList.splice(slipIndex, 1);
  }
}

export function clearBlockFloorMovement(block: MsTrackedBlock): void {
  block.floorMovement = "none";
  block.floorMovementDir = MS_DIRECTION.none;
  block.sliding = false;
  block.slideDelayPending = false;
  block.slipOrder = -1;
}

export function moveCreatureSlipEntryToEnd(internal: MsInternalState, serial: number): void {
  const slipIndex = findCreatureSlipIndex(internal, serial);
  if (slipIndex < 0) {
    return;
  }
  internal.creatureSlipList[slipIndex]!.slipOrder = reserveNextSlipOrder(internal);
}

export function refreshCreatureSlidingFlag(creature: MsTrackedCreature): void {
  creature.sliding =
    creature.floorMovementDir !== MS_DIRECTION.none &&
    (creature.floorMovement === "ice" || creature.floorMovement === "slide" || creature.floorMovement === "teleport");
}

export function syncMsCreatureAirFloorMovement(context: MsTickContext, creature: MsTrackedCreature): void {
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
      resolveMsRuntimeActorSupportBelow(
        context,
        lowerCells,
        creature.id,
        null,
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

export function syncMsCreatureElevatorFloorMovement(context: MsTickContext, creature: MsTrackedCreature): void {
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

export function syncCreatureFloorMovement(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): boolean {
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
  } else if (isIceFloor(floor) && !msActorTreatsForcedFloorAsNormal(creature, floor, internal, inventory)) {
    movement = "ice";
    movementDir = iceWallTurn(floor, creature.dir);
  } else if (isSlideFloor(floor) && !msActorTreatsForcedFloorAsNormal(creature, floor, internal, inventory)) {
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

export function restartCreatureFloorMovementAfterBlockedAttempt(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  originalDir: number,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
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
  } else if (isIceFloor(floor) && !msActorTreatsForcedFloorAsNormal(creature, floor, internal, inventory)) {
    movement = "ice";
    movementDir = originalDir;
  } else if (isSlideFloor(floor) && !msActorTreatsForcedFloorAsNormal(creature, floor, internal, inventory)) {
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

export function findVisibleTrackedBlock(internal: MsInternalState, pos: number, z = 1): MsTrackedBlock | undefined {
  return internal.blocks.find((block) => !block.hidden && block.pos === pos && (block.z ?? 1) === z);
}

export function hideTrackedBlockAtPos(internal: MsInternalState, pos: number, dir: number, z = 1): MsTrackedBlock {
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

export function upsertTrackedBlock(cells: EngineMapCell[], internal: MsInternalState, pos: number, dir: number): MsTrackedBlock {
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

export function activateBlockSlipOrder(block: MsTrackedBlock, internal: MsInternalState, requeue: boolean): void {
  if (block.hidden || block.floorMovement === "none" || block.floorMovementDir === MS_DIRECTION.none) {
    block.slipOrder = -1;
    return;
  }

  if (requeue || block.slipOrder < 0) {
    block.slipOrder = reserveNextSlipOrder(internal);
  }
}

export function syncMsBlockAirFloorMovement(context: MsTickContext, block: MsTrackedBlock): void {
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

export function syncMsBlockElevatorFloorMovement(context: MsTickContext, block: MsTrackedBlock): void {
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

export function refreshBlockFloorMovement(cells: EngineMapCell[], block: MsTrackedBlock, internal: MsInternalState): void {
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

export function restartBlockFloorMovementAfterBlockedAttempt(
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

export function restartBlockFloorMovementAfterRetrySuccess(
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

export function setBlockFloorMovementAfterSuccessfulMove(
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

export function updateBlockReleaseAfterMove(
  cells: EngineMapCell[],
  internal: MsInternalState,
  block: MsTrackedBlock,
  sourcePos: number,
  targetTop: number,
  landingPos: number,
): void {
  if (targetTop === MS_TILE.Beartrap) {
    block.released = isMsTrapOpen({
      cells,
      traps: internal.traps,
      trapPos: landingPos,
      skipButtonPos: sourcePos,
      z: block.z ?? runtimeCellZ(cells, landingPos),
    });
    return;
  }

  if (cells[landingPos]!.bottom.id === MS_TILE.Beartrap) {
    block.released = hasMsTrapConnection(internal.traps, landingPos, block.z ?? runtimeCellZ(cells, landingPos));
    return;
  }

  block.released = false;
}

export function turnTanks(cells: EngineMapCell[], internal: MsInternalState, inMidMove: MsTrackedCreature | null = null): void {
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

export function toggleWalls(layers: ReadonlyArray<MsRuntimeLayer>): void {
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

export function resolveCreatureFloorEffects(cells: EngineMapCell[], creature: MsTrackedCreature, internal: MsInternalState): number {
  const floor = bottomTileId(cells, creature.pos);
  return resolveButtonFloorEffects(cells, internal, null, creature.pos, floor, creature);
}

export function resolveChipFloorEffects(cells: EngineMapCell[], internal: MsInternalState): number {
  const floor = bottomTileId(cells, internal.chipPos);
  return resolveButtonFloorEffects(cells, internal, null, internal.chipPos, floor);
}

export function activateMappedBowlingBallsOnForceFloors(
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): void {
  for (const item of internal.portableTools.portableItems) {
    if (
      item.family !== "bowling-ball" ||
      item.state.mode !== "map" ||
      !item.bowlingBallState ||
      item.bowlingBallState.mode !== "still"
    ) {
      continue;
    }

    const cells = layerCellsByZ.get(item.state.z);
    if (!cells || cells[item.state.pos]?.top.id !== item.tileId) {
      continue;
    }

    const floor = bottomTile(cells, item.state.pos).id;
    if (!isSlideFloor(floor)) {
      continue;
    }

    const dir = slideDirection(floor, internal);
    if (dir === MS_DIRECTION.none) {
      continue;
    }

    const pos = item.state.pos;
    const z = item.state.z;
    setBowlingBallMode(item.bowlingBallState, "moving", dir);
    const actorSerial = internal.nextCreatureSerial;
    if (!activateMsPortableTool(msPortableToolState(internal), inventory, item.serial, actorSerial)) {
      setBowlingBallMode(item.bowlingBallState, "still", dir);
      continue;
    }

    internal.nextCreatureSerial = actorSerial + 1;
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
    internal.creatures.push(creature);
    internal.creatureIndexBySerial.set(actorSerial, internal.creatures.length - 1);
    spawnMsBowlingBallStatefulActorFromPortable(
      internal.statefulActors,
      actorSerial,
      item.serial,
      item.bowlingBallState,
    );
    cells[pos]!.top = {
      id: msCreatureTile(MS_TILE.BowlingBall, dir),
      state: 0,
    };
    syncCreatureFloorMovement(cells, creature, internal, inventory);
  }
}

export function createMsCreatureMovementContext(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  syncVerticalFloorMovement: (creature: MsTrackedCreature) => void = () => {},
) {
  return {
    pushTile,
    popTile,
    applyMobExitFloorEffect: (cells: EngineMapCell[], pos: number) => applyMsMobExitFloorEffect(cells, pos),
    updateCreatureTile: (cells: EngineMapCell[], creature: MsTrackedCreature) => updateCreatureTile(cells, creature),
    handlePreMoveCollision: (
      sourceCells: EngineMapCell[],
      targetCells: EngineMapCell[],
      creature: MsTrackedCreature,
      nextPos: number,
      dir: number,
    ) => resolveMsCreaturePreMoveCollision(sourceCells, targetCells, internal, inventory, creature, nextPos, dir),
    resolveButtonFloorEffects: (cells: EngineMapCell[], pos: number, floor: number, creature: MsTrackedCreature) =>
      resolveButtonFloorEffects(cells, internal, inventory, pos, floor, creature),
    isTrapOpen: (cells: EngineMapCell[], trapPos: number, skipButtonPos: number, z: number) =>
      isMsTrapOpen({ cells, traps: internal.traps, trapPos, skipButtonPos, z }),
    hasTrapConnection: (pos: number, z: number) => hasMsTrapConnection(internal.traps, pos, z),
    chipActsWallForMobs: (pos: number, z: number) => msChipActsWallForMobs(internal, pos, z),
    arrivalOutcome: (creature: MsTrackedCreature, floorId: number) =>
      msRuntimeActorArrivalOutcome(
        floorId,
        creature.id,
        projectMsRuntimeActorInventoryOwner(creature.id, creature.serial, inventory, internal),
      ),
    runtimeCellZ,
    clearCreatureFloorMovement: (creature: MsTrackedCreature) => {
      clearCreatureFloorMovement(creature, internal);
    },
    syncCreatureFloorMovement: (cells: EngineMapCell[], creature: MsTrackedCreature) => {
      syncCreatureFloorMovement(cells, creature, internal, inventory);
    },
    syncVerticalFloorMovement,
    applyArrivalEffects: (cells: EngineMapCell[], creature: MsTrackedCreature) =>
      applyMsActorArrivalEffects(cells, creature.id, creature.pos, {
        inventory,
        inventoryOwner: projectMsRuntimeActorInventoryOwner(creature.id, creature.serial, inventory, internal),
        runtimeEntry: msRuntimeActorEntry(internal, creature.serial),
      }),
    removeStatefulActor: (creature: MsTrackedCreature) => {
      destroyMsPortableBackedActorRuntime(internal, inventory, creature.serial);
    },
    findTeleportDestination: (
      cells: EngineMapCell[],
      start: number,
      dir: number,
      occupiedOriginPos: number | undefined,
      creature: MsTrackedCreature,
    ) =>
      findMsCreatureTeleportDestination({
        cells,
        start,
        dir,
        occupiedOriginPos,
        canExit: (destination) =>
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
            inventory,
          ),
      }),
  };
}

export function createMsChipMovementStrategyContext(): MsChipMovementStrategyContext<
  MsInternalState,
  EngineState["inventory"],
  MsTickContext
> {
  return {
    canStartMove: canMoveChip,
    startMove: (moveCells, moveInternal, moveInventory, moveDir) =>
      moveMsChipPlanarWithContext(createMsChipMovementContext(moveInternal, moveInventory), moveCells, moveDir),
    startDownMove: (sourceCells, targetCells, moveInternal, moveInventory) =>
      moveMsChipDownOneLayerWithContext(
        createMsChipMovementContext(moveInternal, moveInventory),
        sourceCells,
        targetCells,
      ),
    startUpMove: (sourceCells, targetCells, moveInternal, moveInventory) =>
      moveMsChipUpOneLayerWithContext(
        createMsChipMovementContext(moveInternal, moveInventory),
        sourceCells,
        targetCells,
      ),
    runForcedMove: (tickContext, moveCells) => runFloorMovement(tickContext, moveCells),
  };
}

export function createMsCreatureMovementStrategyDispatchContext(
  inventory: EngineState["inventory"],
): MsCreatureMovementStrategyContext<
  MsTrackedCreature,
  MsInternalState
> {
  return {
    canStartMove: (moveCells, moveCreature, moveDir, moveInternal) =>
      canMoveCreature(moveCells, moveCreature, moveDir, moveInternal, inventory),
    startMove: (moveCells, moveCreature, moveDir, moveInternal) =>
      moveMsCreaturePlanarWithContext(
        createMsCreatureMovementContext(moveInternal, inventory),
        moveCells,
        moveCreature,
        moveDir,
        () => applyMsChipCollisionOutcome(moveInternal, msActorCollisionOutcome(moveCreature.id, MS_TILE.Chip)),
      ),
    startDownMove: (_engine, moveSourceCells, moveTargetCells, _layerCellsByZ, moveCreature, moveInternal) =>
      moveMsCreatureDownOneLayerWithContext(
        createMsCreatureMovementContext(moveInternal, inventory),
        moveSourceCells,
        moveTargetCells,
        moveCreature,
        () => applyMsChipCollisionOutcome(moveInternal, msActorCollisionOutcome(moveCreature.id, MS_TILE.Chip)),
      ),
    startUpMove: (moveEngine, moveSourceCells, moveTargetCells, moveLayerCellsByZ, moveCreature, moveInternal) => {
      const tickContext = createMsTickContext(moveEngine, moveInternal, moveEngine.inventory, moveLayerCellsByZ);
      return moveMsCreatureUpOneLayerWithContext(
        createMsCreatureMovementContext(moveInternal, inventory, (trackedCreature) => {
          syncMsCreatureAirFloorMovement(tickContext, trackedCreature);
          syncMsCreatureElevatorFloorMovement(tickContext, trackedCreature);
        }),
        moveSourceCells,
        moveTargetCells,
        moveCreature,
        () => applyMsChipCollisionOutcome(moveInternal, msActorCollisionOutcome(moveCreature.id, MS_TILE.Chip)),
        isValidElevatorDestinationFloor,
      );
    },
  };
}

export function createMsBlockMovementStrategyDispatchContext(): MsBlockMovementStrategyContext<
  MsTrackedBlock,
  MsInternalState
> {
  return {
    canStartMove: (moveCells, moveInternal, movePos, moveDir) =>
      canMoveBlockInto(
        moveCells,
        nextPosition(movePos, moveDir, MS_GRID_WIDTH),
        moveDir,
        -1,
        moveInternal,
      ),
    startMove: moveBlock,
    startUpMove: (engine, sourceCells, targetCells, moveLayerCellsByZ, block, moveInternal) =>
      moveBlockUpOneLayer(engine, sourceCells, targetCells, moveLayerCellsByZ, block, moveInternal),
  };
}

export function moveCreatureOnce(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): MovementAttemptResult {
  const result = startMsCreatureMoveByStrategy(
    msActorMovementStrategyId(creature.id),
    createMsCreatureMovementStrategyDispatchContext(inventory),
    cells,
    creature,
    dir,
    internal,
  );
  if (
    result.status === "moved" &&
    !creature.hidden &&
    bottomTile(cells, creature.pos).id === MS_TILE.CloneMachine &&
    msActorClonerFamilyHooks(creature.id).entryBehavior === "occupy-and-hold"
  ) {
    holdMsCreatureOnCloneMachine(cells, internal, creature);
  }
  return result;
}

export function moveCreatureDownOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): MovementAttemptResult {
  return startMsCreatureDownMoveByStrategy(
    msActorMovementStrategyId(creature.id),
    createMsCreatureMovementStrategyDispatchContext(inventory),
    engine,
    sourceCells,
    targetCells,
    layerCellsByZ,
    creature,
    internal,
  );
}

export function moveCreatureUpOneLayer(
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: MsTrackedCreature,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): MovementAttemptResult {
  return startMsCreatureUpMoveByStrategy(
    msActorMovementStrategyId(creature.id),
    createMsCreatureMovementStrategyDispatchContext(inventory),
    engine,
    sourceCells,
    targetCells,
    layerCellsByZ,
    creature,
    internal,
  );
}

export function chooseCreatureDirection(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  currentTime: number,
  stepping: number,
): number {
  const context: MsCreatureControllerContext = {
    currentTime,
    stepping,
    chipPos: internal.chipPos,
    floorAt: (pos) => floorAt(cells, pos),
    getControllerDir: () => internal.controllerDir,
    setControllerDir: (dir) => {
      internal.controllerDir = dir;
    },
    canMove: (candidate, dir) => canMoveCreature(cells, candidate as MsTrackedCreature, dir, internal, inventory),
    updateCreatureTile: (candidate) => updateCreatureTile(cells, candidate as MsTrackedCreature),
    randomize3: (array) => randomp3(internal, array),
    randomize4: (array) => randomp4(internal, array),
  };

  return chooseMsCreatureDirectionWithContext(context, creature);
}

export function resolvePendingCloners(cells: EngineMapCell[], internal: MsInternalState): void {
  internal.pendingCloners = [];
}

export function createClones(internal: MsInternalState): void {
  for (const creature of internal.creatures) {
    creature.cloning = false;
  }
}

export function syncMsNonChipVerticalFloorMovements(tickContext: MsTickContext, internal: MsInternalState): void {
  for (const creature of internal.creatures) {
    syncMsCreatureAirFloorMovement(tickContext, creature);
    syncMsCreatureElevatorFloorMovement(tickContext, creature);
  }
  for (const block of internal.blocks) {
    syncMsBlockAirFloorMovement(tickContext, block);
    syncMsBlockElevatorFloorMovement(tickContext, block);
  }
}

export function processMsCreatureFloorQueueEntry(
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
          resolveMsRuntimeActorSupportBelow(
            tickContext,
            lowerCells,
            creature.id,
            null,
            creature.pos,
            creature.z ?? 1,
            runtimeCellZ(lowerCells, creature.pos),
          ),
        )
      ) {
        clearCreatureFloorMovement(creature, internal);
      } else {
        soundEffects |= moveCreatureDownOneLayer(
          engine,
          creatureCells,
          lowerCells,
          layerCellsByZ,
          creature,
          internal,
          engine.inventory,
        ).soundEffects;
        refreshCreatureSlidingFlag(creature);
        moved = true;
      }
    } else if (creature.floorMovement === "elevator") {
      const upperCells = msUpperRuntimeCells(layerCellsByZ, creature.z);
      if (upperCells) {
        const elevated = moveCreatureUpOneLayer(
          engine,
          creatureCells,
          upperCells,
          layerCellsByZ,
          creature,
          internal,
          engine.inventory,
        );
        soundEffects |= elevated.soundEffects;
        if (movementDidSucceed(elevated)) {
          refreshCreatureSlidingFlag(creature);
          moved = true;
        }
      }
    } else if (canMoveCreature(creatureCells, creature, originalDir, internal, engine.inventory)) {
      soundEffects |= moveCreatureOnce(creatureCells, creature, originalDir, internal, engine.inventory).soundEffects;
      refreshCreatureSlidingFlag(creature);
      moved = true;
    } else if (creature.floorMovement === "ice") {
      retriedAfterBlock = true;
      const turnedDir = iceWallTurn(creatureCells[creature.pos]!.bottom.id, backDirection(originalDir));
      if (turnedDir !== MS_DIRECTION.none && canMoveCreature(creatureCells, creature, turnedDir, internal, engine.inventory)) {
        soundEffects |= moveCreatureOnce(creatureCells, creature, turnedDir, internal, engine.inventory).soundEffects;
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
          syncCreatureFloorMovement(creatureCells, creature, internal, engine.inventory);
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
      revealMsBallisticBlockedEnter(creatureCells, creature, originalDir);
      restartCreatureFloorMovementAfterBlockedAttempt(creatureCells, creature, originalDir, internal, engine.inventory);
      if (maybeRevertPortableBackedCreatureOnBlockedMove(creatureCells, internal, engine.inventory, creature)) {
        if (queue.isEntryActive(active)) {
          queue.trace("remove-creature-reverted-portable", slipIndex, advance, active);
          queue.removeEntry(slipIndex);
        }
        return soundEffects;
      }
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

export function processMsBlockFloorQueueEntry(
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
    switch (msActorArrivalOutcome(targetTop, MS_TILE.Block)) {
      case "block-water":
        blockCells[nextPos]!.top = { id: MS_TILE.Dirt, state: 0 };
        if (!oldWasCloneMachine) {
          popExitedMsMobSourceTile(blockCells, block.pos);
        } else {
          blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }
        hideTrackedBlockAtPos(internal, block.pos, dir, block.z ?? 1);
        soundEffects |= 1 << MS_SOUND.WaterSplash;
        return true;
      case "block-bomb":
        blockCells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
        if (!oldWasCloneMachine) {
          popExitedMsMobSourceTile(blockCells, block.pos);
        } else {
          blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
        }
        hideTrackedBlockAtPos(internal, block.pos, dir, block.z ?? 1);
        soundEffects |= 1 << MS_SOUND.BombExplodes;
        return true;
      default:
        break;
    }

    const movedTile = oldWasCloneMachine ? { ...blockCells[block.pos]!.top } : popExitedMsMobSourceTile(blockCells, block.pos);
    let landingPos = nextPos;
    if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
      landingPos = findMsBlockTeleportDestination({
        cells: blockCells,
        start: nextPos,
        dir,
        occupiedOriginPos: block.pos,
        canExit: (exitPos) => canMoveBlockInto(blockCells, exitPos, dir, block.pos, internal),
      });
    }

    placeStaticBlock(blockCells, landingPos, movedTile.state);

    const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
    applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(MS_TILE.Block, targetCreatureId));
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

      switch (msActorArrivalOutcome(targetTop, MS_TILE.Block)) {
        case "block-water":
          lowerCells[oldPos]!.top = { id: MS_TILE.Dirt, state: 0 };
          popExitedMsMobSourceTile(blockCells, oldPos);
          hideTrackedBlockAtPos(internal, oldPos, block.dir, sourceZ);
          soundEffects |= 1 << MS_SOUND.WaterSplash;
          moved = true;
          break;
        case "block-bomb":
          lowerCells[oldPos]!.top = { id: MS_TILE.Empty, state: 0 };
          popExitedMsMobSourceTile(blockCells, oldPos);
          hideTrackedBlockAtPos(internal, oldPos, block.dir, sourceZ);
          soundEffects |= 1 << MS_SOUND.BombExplodes;
          moved = true;
          break;
        default: {
          const movedTile = popExitedMsMobSourceTile(blockCells, oldPos);
          let landingPos = oldPos;
          if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
            landingPos = findMsBlockTeleportDestination({
              cells: lowerCells,
              start: oldPos,
              dir: block.dir,
              canExit: (exitPos) => canMoveBlockInto(lowerCells, exitPos, block.dir, -1, internal),
            });
          }

          placeStaticBlock(lowerCells, landingPos, movedTile.state);
          const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
          applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(MS_TILE.Block, targetCreatureId));

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
      const elevated = startMsBlockUpMoveByStrategy(
        msActorMovementStrategyId(MS_TILE.Block),
        createMsBlockMovementStrategyDispatchContext(),
        engine,
        blockCells,
        upperCells,
        layerCellsByZ,
        block,
        internal,
      );
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

export function runCreatureFloorMovements(
  engine: EngineState,
  inventory: EngineState["inventory"],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  internal: MsInternalState,
  currentTime: number,
): number {
  const fallbackCells = layerCellsByZ.values().next().value as EngineMapCell[] | undefined;
  const cellsForZ = (z = 1): EngineMapCell[] => layerCellsByZ.get(z) ?? fallbackCells ?? [];
  const tickContext = createMsTickContext(engine, internal, inventory, layerCellsByZ);
  syncMsNonChipVerticalFloorMovements(tickContext, internal);
  activateMappedBowlingBallsOnForceFloors(layerCellsByZ, internal, inventory);

  const queue = new MsNonChipFloorQueue({
    state: internal,
    findCreature: (serial) => creatureForSerial(internal, serial),
    reserveNextSlipOrder: () => reserveNextSlipOrder(internal),
    trace: (event) =>
      emitMsQueueTrace({
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

export function runCreatureMovements(
  engine: EngineState,
  inventory: EngineState["inventory"],
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
    revealMsBallisticBlockedEnter(creatureCells, creature, dir);
    applyBlockedMsCreatureAttemptWithContext(
      {
        floorAt: (pos) => floorAt(creatureCells, pos),
        updateCreatureTile: (candidate) => updateCreatureTile(creatureCells, candidate as MsTrackedCreature),
      },
      creature,
      dir,
    );
    maybeRevertPortableBackedCreatureOnBlockedMove(creatureCells, internal, inventory, creature);
  };

  for (const creature of internal.creatures) {
    if (creature.hidden || creature.cloning) {
      continue;
    }
    const creatureCells = cellsForZ(creature.z ?? 1);
    const dir = chooseCreatureDirection(creatureCells, creature, internal, inventory, currentTime, stepping);
    if (dir !== MS_DIRECTION.none) {
      if (canMoveCreature(creatureCells, creature, dir, internal, inventory)) {
        soundEffects |= moveCreatureOnce(creatureCells, creature, dir, internal, inventory).soundEffects;
      } else {
        applyBlockedCreatureAttempt(creatureCells, creature, dir);
      }
    }
  }

  return soundEffects;
}

export function teleportDestination(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  start: number,
  dir: number,
): { destination: number; soundEffects: number } {
  const teleported = resolveMsChipTeleportDestination({
    cells,
    start,
    initialPendingSoundEffects: internal.pendingSoundEffects,
    probeExit: (candidate, pendingSoundEffects) => {
      const probeInternal: MsInternalState = {
        ...internal,
        chipPos: candidate,
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

      return {
        canExit: canMoveChip(cells, probeInternal, inventory, dir, {
          exposeWalls: false,
          noLeaveCheck: true,
          teleportPush: true,
          deferButtons: false,
          occupiedOriginPos: start,
        }),
        pendingSoundEffects: probeInternal.pendingSoundEffects,
      };
    },
  });

  internal.pendingSoundEffects = teleported.pendingSoundEffects;
  return {
    destination: teleported.destination,
    soundEffects: teleported.soundEffects,
  };
}

export function createMsChipMovementContext(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
) {
  return {
    internal,
    runtimeCellZ,
    applyEnterEffects: (cells: EngineMapCell[], nextPos: number) =>
      applyMsChipEnterEffects(
        cells,
        internal,
        {
          inventory,
          portableTools: msPortableToolState(internal),
          runtimeCellZ: (pos) => runtimeCellZ(cells, pos),
          removeRuntimeActor: (runtimeCells: EngineMapCell[], pos: number) =>
            removeMsTargetRuntimeActor(runtimeCells, internal, inventory, pos, runtimeCellZ(runtimeCells, pos)),
        },
        nextPos,
      ),
    teleportDestination: (cells: EngineMapCell[], start: number, dir: number) =>
      teleportDestination(cells, internal, inventory, start, dir),
    popTile,
    applyMobExitFloorEffect: (cells: EngineMapCell[], pos: number) => applyMsMobExitFloorEffect(cells, pos),
    pushTile,
    settlePrimedToolDrop: (cells: EngineMapCell[], pos: number, z: number) =>
      settleMsPrimedToolDrop(cells, msPortableToolState(internal), inventory, pos, z),
    preservesUnderlyingFloor: (cell: EngineMapCell) =>
      cell.top.id === MS_TILE.Empty && msPreservesUnderlyingFloor(cell.bottom.id),
    updateChipTile: (cells: EngineMapCell[]) => updateChipTile(cells, internal),
    resolveButtonFloorEffects: (cells: EngineMapCell[], pos: number, floor: number, z?: number) =>
      resolveButtonFloorEffects(cells, internal, inventory, pos, floor, undefined, z),
    isTrapOpen: (cells: EngineMapCell[], trapPos: number, skipButtonPos: number, z: number) =>
      isMsTrapOpen({ cells, traps: internal.traps, trapPos, skipButtonPos, z }),
    hasTrapConnection: (pos: number, z: number) => hasMsTrapConnection(internal.traps, pos, z),
    refreshFloorMovement: (cells: EngineMapCell[], floorId: number, floorState: number) =>
      refreshFloorMovementFromEnteredTile(cells, internal, inventory, floorId, floorState),
    handleDeferredButtons: (cells: EngineMapCell[]) => handleDeferredButtons(cells, internal),
    isExitFloor: (tileId: number) => msTileHasTag(tileId, "exit"),
    hasIceBoot: () => actorInventoryHasBoot(projectMsActorInventoryOwner(MS_TILE.Chip, inventory), 0),
    elevatorDestinationFloor,
    isValidElevatorDestinationFloor,
    pushStaticBlock: (targetCells: EngineMapCell[], pos: number, pushDir: number) =>
      pushBlock(targetCells, internal, pos, pushDir, false, true),
    normalizeDirection,
  };
}

export function moveChipOnce(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
): MovementAttemptResult {
  return startMsChipMoveByStrategy(
    msActorMovementStrategyId(MS_TILE.Chip),
    createMsChipMovementStrategyContext(),
    cells,
    internal,
    inventory,
    dir,
  );
}

export function moveChipDownOneLayer(
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): MovementAttemptResult {
  return startMsChipDownMoveByStrategy(
    msActorMovementStrategyId(MS_TILE.Chip),
    createMsChipMovementStrategyContext(),
    sourceCells,
    targetCells,
    internal,
    inventory,
  );
}

export function elevatorDestinationFloor(cell: EngineMapCell): number {
  if (cell.top.id === MS_TILE.Block_Static || isMsCreature(cell.top.id)) {
    return cell.bottom.id;
  }
  return cell.top.id;
}

export function isValidElevatorDestinationFloor(floor: number): boolean {
  return isAirFloor(floor) || isSlideFloor(floor) || isElevatorFloor(floor) || floor === MS_TILE.Exit;
}

export function moveChipUpOneLayer(
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): MovementAttemptResult {
  return startMsChipUpMoveByStrategy(
    msActorMovementStrategyId(MS_TILE.Chip),
    createMsChipMovementStrategyContext(),
    sourceCells,
    targetCells,
    internal,
    inventory,
  );
}

export function moveBlockUpOneLayer(
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

  const movedTile = popExitedMsMobSourceTile(sourceCells, oldPos);
  placeStaticBlock(targetCells, oldPos, movedTile.state);
  block.pos = oldPos;
  block.z = targetZ;

  applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(MS_TILE.Block, targetCreatureId));

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

export function runFloorMovement(context: MsTickContext, cells: EngineMapCell[]): number {
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
  if (
    canStartMsChipMoveByStrategy(
      msActorMovementStrategyId(MS_TILE.Chip),
      createMsChipMovementStrategyContext(),
      cells,
      internal,
      context.inventory,
      internal.floorMovementDir,
    )
  ) {
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
    if (
      canStartMsChipMoveByStrategy(
        msActorMovementStrategyId(MS_TILE.Chip),
        createMsChipMovementStrategyContext(),
        cells,
        internal,
        context.inventory,
        internal.floorMovementDir,
      )
    ) {
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
    if (
      canStartMsChipMoveByStrategy(
        msActorMovementStrategyId(MS_TILE.Chip),
        createMsChipMovementStrategyContext(),
        cells,
        internal,
        context.inventory,
        internal.floorMovementDir,
      )
    ) {
      soundEffects |= moveChipOnce(cells, internal, context.inventory, internal.floorMovementDir).soundEffects;
      internal.chipHasMoved = false;
      return soundEffects;
    }
  }

  refreshFloorMovement(cells, internal, context.inventory);
  return soundEffects;
}

export function chipMoveToGoalPos(
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

export function moveChipWithPushPickupReveal(
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

export function runManualMovement(
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
  if (
    !canStartMsChipMoveByStrategy(
      msActorMovementStrategyId(MS_TILE.Chip),
      createMsChipMovementStrategyContext(),
      cells,
      internal,
      inventory,
      dir,
    )
  ) {
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
