import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import type {
  GameDebugPhaseSnapshot,
  GameDebugTrace,
} from "@game-core/api/debug";
import { cloneBowlingBallState } from "@game-core/impl/bowlingBall";
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
  isMsClonerSpecialFloor,
  isMsTrapSpecialFloor,
} from "@ruleset-ms/impl/elements/tiles/specialFloorRegistration";
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
  probeMsTileExitEffect,
} from "@ruleset-ms/impl/tileEffects";
import { msBlockedMoveFloorImpactAction, msRuntimeActorFloorImpactAction } from "@ruleset-ms/impl/floorImpactPolicy";
import {
  attachMsPortableToolToActor,
  carriedMsPortableToolItem,
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
  type MsStatefulActorRuntimeEntry,
} from "@ruleset-ms/impl/statefulActors";
import {
  activateMsMappedBowlingBallsOnForceFloors,
  tryActivateMsPortableBowlingBallThrow,
} from "@ruleset-ms/impl/elements/actors/families/bowlingBallRuntime";
import { queryMsOccupancyTarget } from "@ruleset-ms/impl/occupancy";
import { applyMsChipEnterEffects } from "@ruleset-ms/impl/chipArrival";
import {
  applyMsPortableToolAction,
  applyMsPortableToolPostMoveAction,
  msPortableToolMoveModifierEnabled,
  msPortableToolMoveModifierEnabledForCarriedItem,
} from "@ruleset-ms/impl/portableToolActions";
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
  canMsBlockPushBlock,
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_TICKS_PER_SECOND,
  MS_SOUND,
  MS_STATUS_FLAG,
  MS_TILE,
  isMsBlockActorId,
  isMsBoots,
  isMsCreature,
  isMsFloor,
  isMsKey,
  isMsStaticBlockTile,
  msActorBlockStaticTileId,
  msCreatureDir,
  msCreatureId,
  msCreatureTile,
  msStaticBlockActorId,
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

function applyMsActorThiefHook(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  actorId: number,
  inventoryOwner: ActorLocalInventoryOwner,
): boolean {
  if (msActorThiefOutcome(actorId) !== "steal-boots-tools") {
    return false;
  }
  actorInventoryClearBoots(inventoryOwner);
  actorInventoryClearTools(inventoryOwner);
  if (actorId === MS_TILE.Chip) {
    clearMsToolInventory(msPortableToolState(internal), inventory);
  }
  return true;
}

function msRuntimeActorEntry(
  internal: MsInternalState,
  actorSerial: number,
): MsStatefulActorRuntimeEntry | null {
  return findMsStatefulActorRuntime(
    internal.statefulActors as unknown as StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
    actorSerial,
  ) ?? null;
}

function projectMsRuntimeActorInventoryOwner(
  actorId: number,
  actorSerial: number,
  inventory: EngineState["inventory"],
  internal: MsInternalState,
  localInventory: MsActorLocalInventoryState = null,
): ActorLocalInventoryOwner {
  const runtimeEntry = msRuntimeActorEntry(internal, actorSerial);
  return projectMsActorInventoryOwner(actorId, inventory, {
    actorSerial: runtimeEntry ? actorSerial : undefined,
    runtimeEntry,
    localInventory: runtimeEntry ? undefined : localInventory,
  });
}

function queryMsTargetOccupancy(
  cells: EngineMapCell[],
  internal: MsInternalState,
  pos: number,
  z?: number,
) {
  return queryMsOccupancyTarget(
    {
      cells,
      chipPos: internal.chipPos,
      chipZ: internal.chipZ,
      creatures: internal.creatures,
      blocks: internal.blocks,
      portableItems: internal.portableTools.portableItems,
      runtimeCellZ,
    },
    pos,
    z,
  );
}

function msInteractionTargetFromOccupancy(
  target: ReturnType<typeof queryMsTargetOccupancy>,
  movingDir: number = MS_DIRECTION.none,
) {
  switch (target.kind) {
    case "runtime-actor": {
      const targetDir =
        target.runtimeActor && "dir" in target.runtimeActor && typeof target.runtimeActor.dir === "number"
          ? target.runtimeActor.dir
          : MS_DIRECTION.none;
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId:
          target.runtimeActor && "id" in target.runtimeActor && typeof target.runtimeActor.id === "number"
            ? target.runtimeActor.id
            : msStaticBlockActorId(target.tileId) ?? msCreatureId(target.tileId),
        tileId: target.tileId,
        movingDir,
        targetDir,
        sameDirection: movingDir !== MS_DIRECTION.none && targetDir !== MS_DIRECTION.none && movingDir === targetDir,
      } as const;
    }
    case "static-block":
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId: msStaticBlockActorId(target.tileId) ?? MS_TILE.Block,
        tileId: target.tileId,
        movingDir,
        targetDir: MS_DIRECTION.none,
        sameDirection: false,
      } as const;
    case "chip":
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.chip,
        actorId: MS_TILE.Chip,
        tileId: target.tileId,
        movingDir,
      } as const;
    case "portable-item":
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.portableItem,
        tileId: target.portableItem?.tileId ?? target.tileId,
        movingDir,
      } as const;
    default:
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.empty,
        tileId: target.tileId,
        movingDir,
      } as const;
  }
}

function applyMsChipCollisionOutcome(internal: MsInternalState, outcome: ReturnType<typeof msActorCollisionOutcome>): void {
  if (outcome.chipFails) {
    internal.chipStatus = "collided";
  }
}

function msPortableBackedActorItemSerial(
  internal: MsInternalState,
  actorSerial: number,
): number | null {
  const runtimeEntry = msRuntimeActorEntry(internal, actorSerial);
  if (runtimeEntry?.portableBacking?.portableItemSerial) {
    return runtimeEntry.portableBacking.portableItemSerial;
  }
  return findMsPortableToolAttachedToActor(msPortableToolState(internal), actorSerial)?.serial ?? null;
}

function msLayerPositionKey(pos: number, z: number): string {
  return `${z}:${pos}`;
}

function msCloneSourceSerialAt(
  internal: MsInternalState,
  pos: number,
  z: number,
): number | undefined {
  return internal.cloneSourceSerialByPosition.get(msLayerPositionKey(pos, z));
}

function holdMsCreatureOnCloneMachine(
  cells: EngineMapCell[],
  internal: MsInternalState,
  creature: MsTrackedCreature,
): void {
  const z = creature.z ?? runtimeCellZ(cells, creature.pos);
  internal.cloneSourceSerialByPosition.set(msLayerPositionKey(creature.pos, z), creature.serial);
  creature.hidden = true;
  creature.released = false;
  creature.turning = false;
  creature.hasMoved = false;
  creature.frame = 0;
  creature.moving = 0;
  creature.cloning = false;
  clearCreatureFloorMovement(creature, internal);
}

function syncMsPortableBackedActorStateToPortableItem(
  internal: MsInternalState,
  actorSerial: number,
): void {
  const runtimeEntry = msRuntimeActorEntry(internal, actorSerial);
  const attachedItem = findMsPortableToolAttachedToActor(msPortableToolState(internal), actorSerial);
  if (
    runtimeEntry?.kind !== "bowling-ball" ||
    attachedItem?.family !== "bowling-ball" ||
    !attachedItem.bowlingBallState
  ) {
    return;
  }

  attachedItem.bowlingBallState = cloneBowlingBallState(runtimeEntry.state);
}

function destroyMsPortableBackedActorRuntime(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  actorSerial: number,
): void {
  syncMsPortableBackedActorStateToPortableItem(internal, actorSerial);
  const portableItemSerial = msPortableBackedActorItemSerial(internal, actorSerial);
  if (portableItemSerial !== null) {
    destroyMsPortableTool(msPortableToolState(internal), inventory, portableItemSerial);
  }
  destroyMsStatefulActorRuntime(internal.statefulActors, actorSerial);
}

function destroyMsTrackedCreature(
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  creature: MsTrackedCreature,
): void {
  creature.hidden = true;
  creature.released = false;
  creature.turning = false;
  creature.hasMoved = false;
  creature.frame = 0;
  creature.moving = 0;
  creature.cloning = false;
  clearCreatureFloorMovement(creature, internal);
  destroyMsPortableBackedActorRuntime(internal, inventory, creature.serial);
}

function removeMsTargetRuntimeActor(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  pos: number,
  z: number,
): void {
  const targetCreature = creatureAtPos(internal, pos, z);
  if (targetCreature) {
    popTile(cells, pos);
    destroyMsTrackedCreature(internal, inventory, targetCreature);
    return;
  }

  const cloneSourceSerial = msCloneSourceSerialAt(internal, pos, z);
  if (typeof cloneSourceSerial === "number" && isMsCreature(cells[pos]?.top.id ?? MS_TILE.Empty)) {
    popTile(cells, pos);
    internal.cloneSourceSerialByPosition.delete(msLayerPositionKey(pos, z));
    destroyMsPortableBackedActorRuntime(internal, inventory, cloneSourceSerial);
    return;
  }

  const targetBlock = findVisibleTrackedBlock(internal, pos, z);
  if (targetBlock) {
    popTile(cells, pos);
    hideTrackedBlockAtPos(internal, pos, targetBlock.dir, z, trackedBlockActorId(targetBlock));
    return;
  }

  if (isMsStaticBlockTile(cells[pos]?.top.id ?? MS_TILE.Empty) || isMsCreature(cells[pos]?.top.id ?? MS_TILE.Empty)) {
    popTile(cells, pos);
  }
}

function removeMsCollisionTarget(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  target: ReturnType<typeof queryMsTargetOccupancy>,
): void {
  switch (target.kind) {
    case "portable-item":
      if (target.portableItem && "serial" in target.portableItem && typeof target.portableItem.serial === "number") {
        destroyMsPortableTool(msPortableToolState(internal), inventory, target.portableItem.serial);
      }
      popTile(cells, target.pos);
      return;
    case "runtime-actor":
    case "static-block":
      removeMsTargetRuntimeActor(cells, internal, inventory, target.pos, target.z);
      return;
    default:
      return;
  }
}

function revertMsPortableBackedCreatureToMap(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  creature: MsTrackedCreature,
): boolean {
  const attachedItem = findMsPortableToolAttachedToActor(msPortableToolState(internal), creature.serial);
  if (!attachedItem) {
    return false;
  }

  syncMsPortableBackedActorStateToPortableItem(internal, creature.serial);
  const creatureZ = creature.z ?? runtimeCellZ(cells, creature.pos);
  const tileId = attachedItem.tileId;
  detachMsStatefulActorPortableBacking(internal.statefulActors, creature.serial);
  if (!detachMsPortableToolToMap(msPortableToolState(internal), inventory, attachedItem.serial, creature.pos, creatureZ)) {
    return false;
  }

  cells[creature.pos]!.top = { id: tileId, state: 0 };
  creature.hidden = true;
  creature.released = false;
  creature.turning = false;
  creature.hasMoved = false;
  creature.frame = 0;
  creature.moving = 0;
  creature.cloning = false;
  clearCreatureFloorMovement(creature, internal);
  destroyMsStatefulActorRuntime(internal.statefulActors, creature.serial);
  return true;
}

function shouldRevertPortableBackedCreatureOnBlockedMove(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  internal: MsInternalState,
  inventory: EngineState["inventory"],
): boolean {
  if (msBlockedMoveFloorImpactAction(creature.id) !== "revert-portable" || creature.hidden) {
    return false;
  }

  const standingTile = bottomTile(cells, creature.pos);
  if (
    (isIceFloor(standingTile.id) || isSlideFloor(standingTile.id)) &&
    !msActorTreatsForcedFloorAsNormal(creature, standingTile.id, internal, inventory)
  ) {
    return false;
  }
  if (standingTile.id === MS_TILE.Teleport && (standingTile.state & MS_FLOOR_STATE.Broken) === 0) {
    return false;
  }
  if (isMsClonerSpecialFloor(standingTile.id)) {
    return false;
  }
  if (isMsTrapSpecialFloor(standingTile.id) && !creature.released) {
    return false;
  }
  return true;
}

function maybeRevertPortableBackedCreatureOnBlockedMove(
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  creature: MsTrackedCreature,
): boolean {
  return (
    shouldRevertPortableBackedCreatureOnBlockedMove(cells, creature, internal, inventory) &&
    revertMsPortableBackedCreatureToMap(cells, internal, inventory, creature)
  );
}

function revealMsBallisticBlockedEnter(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
): void {
  if (msActorMovementStrategyId(creature.id) !== "ballistic-like" || dir === MS_DIRECTION.none) {
    return;
  }

  const step = advanceToCell(cells, creature.pos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!step) {
    return;
  }
  applyMsBlockedChipEnterEffect(cells, step.pos, true);
}

function resolveMsCreaturePreMoveCollision(
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  creature: MsTrackedCreature,
  nextPos: number,
  dir: number,
): MovementAttemptResult | null {
  const targetZ = runtimeCellZ(targetCells, nextPos);
  const target = queryMsTargetOccupancy(targetCells, internal, nextPos, targetZ);
  if (target.kind === "empty") {
    return null;
  }

  const collisionOutcome = msActorInteractionOutcome(creature.id, msInteractionTargetFromOccupancy(target, dir));
  if (
    collisionOutcome.denyMove ||
    (!collisionOutcome.removeMovingActor && !collisionOutcome.removeTargetActor && !collisionOutcome.consumeTarget)
  ) {
    return null;
  }

  if (collisionOutcome.removeTargetActor || collisionOutcome.consumeTarget) {
    removeMsCollisionTarget(targetCells, internal, inventory, target);
  }
  if (collisionOutcome.chipFails) {
    applyMsChipCollisionOutcome(internal, collisionOutcome);
  }
  if (collisionOutcome.removeMovingActor) {
    const oldPos = creature.pos;
    if (isMsClonerSpecialFloor(sourceCells[oldPos]!.bottom.id)) {
      sourceCells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
    } else {
      popExitedMsMobSourceTile(sourceCells, oldPos);
    }
    destroyMsTrackedCreature(internal, inventory, creature);
  }

  return movedMovement();
}

function cloneMsPortableBackedActorForCloner(
  internal: MsInternalState,
  sourceActorSerial: number,
  targetActorSerial: number,
): void {
  const detachedProjection = msDetachedToolInventoryProjection();
  syncMsPortableBackedActorStateToPortableItem(internal, sourceActorSerial);
  cloneMsStatefulActorRuntimeForCloner(internal.statefulActors, sourceActorSerial, targetActorSerial);
  const sourcePortableSerial = msPortableBackedActorItemSerial(internal, sourceActorSerial);
  if (sourcePortableSerial === null) {
    return;
  }

  const clonedPortable = cloneMsPortableTool(msPortableToolState(internal), detachedProjection, sourcePortableSerial);
  if (!clonedPortable) {
    return;
  }

  attachMsPortableToolToActor(msPortableToolState(internal), detachedProjection, clonedPortable.serial, targetActorSerial);
  attachMsStatefulActorPortableBacking(internal.statefulActors, targetActorSerial, {
    family: clonedPortable.family,
    portableItemSerial: clonedPortable.serial,
  });
}

export interface MsTrackedBlock {
  id?: number;
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

interface MsRandomRuntimeState {
  initial: bigint;
  value: bigint;
}

interface MsPortableToolRuntimeState extends MsPortableToolStateStore {}
interface MsStatefulActorRuntimeState extends StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry> {}

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
  cloneSourceSerialByPosition: Map<string, number>;
  traps: MsConnection[];
  cloners: MsConnection[];
  pendingCloners: number[];
  pendingSoundEffects: number;
  nextCreatureSerial: number;
  nextSlipOrder: number;
  randomState: MsRandomRuntimeState;
  lastSlipDir: number;
  portableTools: MsPortableToolRuntimeState;
  statefulActors: MsStatefulActorRuntimeState;
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

function msRandomState(internal: MsInternalState): MsRandomRuntimeState {
  return internal.randomState;
}

function msPortableToolState(internal: MsInternalState): MsPortableToolRuntimeState {
  return internal.portableTools;
}

function msDetachedToolInventoryProjection(): Pick<EngineState["inventory"], "tools"> {
  return {
    tools: [0] as EngineState["inventory"]["tools"],
  };
}

function settleMsSpawnedBowlingBallLanding(
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
    isMsClonerSpecialFloor(bottomTile(cells, creature.pos).id) &&
    msActorClonerFamilyHooks(creature.id).entryBehavior === "occupy-and-hold"
  ) {
    holdMsCreatureOnCloneMachine(cells, runtime.internal, creature);
  }
}

function advanceRandom(internal: MsInternalState): bigint {
  const randomState = msRandomState(internal);
  randomState.value = nextRandomValue(randomState.value);
  return randomState.value;
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

function msForcedFloorBootIndex(floor: number): number | null {
  if (isIceFloor(floor)) {
    return 0;
  }
  if (isSlideFloor(floor)) {
    return 1;
  }
  return null;
}

function msActorTreatsForcedFloorAsNormal(
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
  const behaviorResult = probeMsTileExitEffect(floor, dir, released);
  if (behaviorResult !== null) {
    return behaviorResult;
  }
  return !msRequiresReleaseToExit(floor) || released;
}

function pushTile(cells: EngineMapCell[], pos: number, tile: EngineMapCell["top"]): void {
  const cell = cells[pos];
  if (!cell) {
    return;
  }

  if (
    cell.top.id === MS_TILE.Empty &&
    isMsClonerSpecialFloor(cell.bottom.id)
  ) {
    cell.top = { ...tile };
    return;
  }

  pushBoardTile(cells, pos, tile);
}

function popTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
  return popBoardTile(cells, pos, MS_TILE.Empty);
}

function popExitedMsMobSourceTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
  const tile = popTile(cells, pos);
  applyMsMobExitFloorEffect(cells, pos);
  return tile;
}

function placeStaticBlock(cells: EngineMapCell[], pos: number, state: number, actorId: number = MS_TILE.Block): void {
  const cell = boardCell(cells, pos);
  if (cell.top.id !== MS_TILE.Empty) {
    pushTile(cells, pos, { id: MS_TILE.Empty, state: 0 });
  }
  cell.top = {
    id: msActorBlockStaticTileId(actorId) ?? MS_TILE.Block_Static,
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
  if (!targetCell || !isMsStaticBlockTile(targetCell.top.id)) {
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

function runtimeLayerCellsByZ(layers: ReadonlyArray<MsRuntimeLayer>): Map<number, EngineMapCell[]> {
  return new Map<number, EngineMapCell[]>(layers.map((layer) => [layer.z, layer.cells]));
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

function createTrackedBlockState(pos: number, dir: number, z = 1, id: number = MS_TILE.Block): MsTrackedBlock {
  return {
    id,
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

function trackedBlockActorId(block: Pick<MsTrackedBlock, "id"> | null | undefined): number {
  return block?.id ?? MS_TILE.Block;
}

function cloneInternalState(internal: MsInternalState): MsInternalState {
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

function initializeBrokenFloors(cells: EngineMapCell[]): void {
  for (const cell of cells) {
    const topBase = msCreatureId(cell.top.id);
    if (isMsFloor(cell.top.id) || topBase === MS_TILE.Chip || isMsBlockActorId(topBase) || isMsStaticBlockTile(cell.top.id)) {
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
    primedMsPortableToolItem(msPortableToolState(internal)) !== undefined &&
    internal.chipPos === pos &&
    (internal.chipZ ?? 1) === z
  );
}

function refreshFloorMovement(
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

function refreshFloorMovementFromEnteredTile(
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
    if (isMsStaticBlockTile(cell.top.id)) {
      blocks.push(createTrackedBlockState(pos, MS_DIRECTION.none, z, msStaticBlockActorId(cell.top.id) ?? MS_TILE.Block));
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
      if (isMsBlockActorId(creatureId)) {
      } else if (!isMsClonerSpecialFloor(cell.bottom.id)) {
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
          isMsStaticBlockTile(layerCells[connection.to]?.top.id ?? MS_TILE.Empty) ||
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
  activateMsMappedBowlingBallsOnForceFloors({
    layerCellsByZ: runtimeLayerCellsByZ(mapLayers),
    runtime: internal,
    inventory: engine.inventory,
    slideDirection: (floor) => slideDirection(floor, internal),
    syncCreatureFloorMovement: (cells, creature) => syncCreatureFloorMovement(cells, creature, internal, engine.inventory),
  });
  projectMsPortableToolState(msPortableToolState(internal), engine.inventory);
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
    const targetId =
      targetOccupancy.kind === "runtime-actor" && targetOccupancy.runtimeActor
        ? targetOccupancy.runtimeActor.id ??
          msStaticBlockActorId(cells[to]!.top.id) ??
          (isMsCreature(cells[to]!.top.id) ? msCreatureId(cells[to]!.top.id) : MS_TILE.Empty)
        : msStaticBlockActorId(cells[to]!.top.id) ?? (isMsCreature(cells[to]!.top.id) ? msCreatureId(cells[to]!.top.id) : MS_TILE.Empty);
    if (isMsBlockActorId(targetId)) {
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
    if (isMsClonerSpecialFloor(cells[to]!.bottom.id)) {
      return false;
    }
    if (teleportPush && isMsStaticBlockTile(floorAt(cells, to))) {
      return true;
    }
    return canMoveChip(cells, internal, inventory, dir, {
      ...options,
      allowPushing: false,
    });
  } else if (isMsClonerSpecialFloor(cells[to]!.bottom.id)) {
    return false;
  }

  return true;
}

function canMoveCreature(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  dir: number,
  internal: MsInternalState | null = null,
  inventory: EngineState["inventory"] | null = null,
): boolean {
  return canMoveCreatureWithOptions(cells, creature, dir, false, false, internal, inventory);
}

function canMoveCreatureWithOptions(
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
    isMsClonerSpecialFloor(cells[to]!.bottom.id) &&
    msActorClonerFamilyHooks(creature.id).entryBehavior === "none"
  ) {
    return false;
  }

  return true;
}

function staticBlockActorIdAtPos(
  cells: EngineMapCell[],
  internal: MsInternalState | null,
  pos: number,
): number | null {
  const tileId = topTileIdOr(cells, pos, MS_TILE.Empty);
  if (!isMsStaticBlockTile(tileId)) {
    return null;
  }
  return (internal ? findVisibleTrackedBlock(internal, pos, runtimeCellZ(cells, pos))?.id : null) ?? msStaticBlockActorId(tileId);
}

function canMoveBlockInto(
  cells: EngineMapCell[],
  to: number,
  dir: number,
  occupiedOriginPos = -1,
  internal: MsInternalState | null = null,
  movingBlockId: number = MS_TILE.Block,
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
    return !msActorInteractionOutcome(movingBlockId, msInteractionTargetFromOccupancy(targetOccupancy)).denyMove;
  }
  if (targetOccupancy?.kind === "static-block") {
    const targetBlockId = staticBlockActorIdAtPos(cells, internal, to);
    if (targetBlockId === null || !canMsBlockPushBlock(movingBlockId, targetBlockId)) {
      return false;
    }
    return canMoveBlockInto(
      cells,
      nextPosition(to, dir, MS_GRID_WIDTH),
      dir,
      occupiedOriginPos,
      internal,
      targetBlockId,
    );
  }

  const targetTop = cells[to]!.top.id;
  if (isMsCreature(targetTop)) {
    const targetId = msCreatureId(targetTop);
    return targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip;
  }
  if ((msActorEntryMask(targetTop, movingBlockId) & dir) === 0) {
    return false;
  }
  return !isMsClonerSpecialFloor(cells[to]!.bottom.id);
}

function msBlockArrivalReplacement(
  tileId: number,
  actorId: number,
): { tileId: number; soundEffects: number } | null {
  switch (msRuntimeActorFloorImpactAction(msActorArrivalOutcome(tileId, actorId))) {
    case "transform-to-dirt":
      return { tileId: MS_TILE.Dirt, soundEffects: 1 << MS_SOUND.WaterSplash };
    case "transform-to-ice":
      return { tileId: MS_TILE.Ice, soundEffects: 1 << MS_SOUND.WaterSplash };
    case "transform-to-water":
      return { tileId: MS_TILE.Water, soundEffects: 1 << MS_SOUND.WaterSplash };
    case "transform-to-empty":
      return { tileId: MS_TILE.Empty, soundEffects: 1 << MS_SOUND.BombExplodes };
    default:
      return null;
  }
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
  const oldWasCloneMachine = isMsClonerSpecialFloor(cells[pos]!.bottom.id);
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
  if (!canMoveBlockInto(cells, nextPos, dir, occupiedOriginPos, internal, trackedBlockActorId(trackedBlock))) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return blockedMovement();
  }
  const blockingBlockId = staticBlockActorIdAtPos(cells, internal, nextPos);
  if (
    blockingBlockId !== null &&
    (
      !canMsBlockPushBlock(trackedBlockActorId(trackedBlock), blockingBlockId) ||
      !pushBlock(cells, internal, nextPos, dir, false, deferButtons, pos)
    )
  ) {
    trackedBlock.floorMovement = "none";
    trackedBlock.floorMovementDir = MS_DIRECTION.none;
    trackedBlock.sliding = false;
    return blockedMovement();
  }

  const targetTop = cells[nextPos]!.top.id;
  const targetTopState = cells[nextPos]!.top.state;
  const targetBottom = cells[nextPos]!.bottom.id;
  const targetBottomState = cells[nextPos]!.bottom.state;
  const arrivalReplacement = msBlockArrivalReplacement(targetTop, trackedBlockActorId(trackedBlock));
  if (arrivalReplacement !== null) {
    cells[nextPos]!.top.id = arrivalReplacement.tileId;
    cells[nextPos]!.top.state = 0;
    if (!keepSourceTile) {
      popTile(cells, pos);
    } else if (oldWasCloneMachine) {
      cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
    }
    hideTrackedBlockAtPos(internal, pos, dir, trackedBlock.z ?? runtimeCellZ(cells, pos), trackedBlockActorId(trackedBlock));
    internal.pendingSoundEffects |= arrivalReplacement.soundEffects;
    return movedMovement();
  }

  if (isMsClonerSpecialFloor(targetBottom)) {
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
      canExit: (exitPos) => canMoveBlockInto(cells, exitPos, dir, pos, internal, trackedBlockActorId(trackedBlock)),
    });
  }

  placeStaticBlock(cells, landingPos, movedTile.state, trackedBlockActorId(trackedBlock));
  if (oldWasCloneMachine) {
    cells[pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }

  const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(trackedBlockActorId(trackedBlock), targetCreatureId));

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

function moveBlockOnce(
  cells: EngineMapCell[],
  internal: MsInternalState,
  pos: number,
  dir: number,
  deferButtons: boolean,
  preserveSourceTile: boolean,
  occupiedOriginPos = -1,
): MovementAttemptResult {
  return startMsBlockMoveByStrategy(
    msActorMovementStrategyId(
      findVisibleTrackedBlock(internal, pos, runtimeCellZ(cells, pos))?.id ??
        msStaticBlockActorId(topTileIdOr(cells, pos, MS_TILE.Empty)) ??
        MS_TILE.Block,
    ),
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
  const moveResult = moveBlockOnce(cells, internal, pos, dir, deferButtons, false, occupiedOriginPos);
  if (!movementDidSucceed(moveResult) && trackedBlock && !trackedBlock.hidden && !teleportPush) {
    const standingFloor = bottomTileIdOr(cells, pos, MS_TILE.Empty);
    if (!isMsTrapSpecialFloor(standingFloor) && !isMsClonerSpecialFloor(standingFloor) && trackedBlock.floorMovement === "none") {
      trackedBlock.dir = dir;
    }
  }
  return movementDidSucceed(moveResult);
}

function advanceCloneMachineBlock(cells: EngineMapCell[], internal: MsInternalState, pos: number, dir: number): boolean {
  return movementDidSucceed(moveBlockOnce(cells, internal, pos, dir, false, true));
}

function creatureAtPos(internal: MsInternalState, pos: number, z = 1): MsTrackedCreature | undefined {
  return internal.creatures.find((creature) => !creature.hidden && creature.pos === pos && (creature.z ?? 1) === z);
}

function isTrapButtonDown(cells: EngineMapCell[], pos: number): boolean {
  return pos >= 0 && pos < cells.length && topTileId(cells, pos) !== MS_TILE.Button_Brown;
}

function resolveButtonFloorEffects(
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

function floorHasMsButtonAction(floor: number): boolean {
  return hasMsTileActivation(floor);
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
    return deferredMsTileActivationSound(floor, 1 << MS_SOUND.ButtonPushed);
  }

  return resolveButtonFloorEffects(cells, internal, null, pos, floor, actor, buttonZ);
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

function syncCreatureFloorMovement(
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

function restartCreatureFloorMovementAfterBlockedAttempt(
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

function findVisibleTrackedBlock(internal: MsInternalState, pos: number, z = 1): MsTrackedBlock | undefined {
  return internal.blocks.find((block) => !block.hidden && block.pos === pos && (block.z ?? 1) === z);
}

function hideTrackedBlockAtPos(
  internal: MsInternalState,
  pos: number,
  dir: number,
  z = 1,
  actorId: number = MS_TILE.Block,
): MsTrackedBlock {
  const fallbackActorId =
    findVisibleTrackedBlock(internal, pos, z)?.id ??
    internal.blocks.find((entry) => entry.pos === pos && (entry.z ?? 1) === z)?.id ??
    actorId;
  const block =
    findVisibleTrackedBlock(internal, pos, z) ??
    internal.blocks.find((entry) => entry.pos === pos && (entry.z ?? 1) === z) ?? {
      id: fallbackActorId,
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

  block.id = fallbackActorId;
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
    id: msStaticBlockActorId(topId) ?? MS_TILE.Block,
    pos,
    z,
    dir: isMsStaticBlockTile(topId) ? MS_DIRECTION.none : dir,
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

  if (isMsTrapSpecialFloor(floor)) {
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

  if (isMsTrapSpecialFloor(floor)) {
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

  if (isMsTrapSpecialFloor(floor)) {
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

  if (isMsTrapSpecialFloor(floor) && wasSlipping) {
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
  if (isMsTrapSpecialFloor(targetTop)) {
    block.released = isMsTrapOpen({
      cells,
      traps: internal.traps,
      trapPos: landingPos,
      skipButtonPos: sourcePos,
      z: block.z ?? runtimeCellZ(cells, landingPos),
    });
    return;
  }

  if (isMsTrapSpecialFloor(cells[landingPos]!.bottom.id)) {
    block.released = hasMsTrapConnection(internal.traps, landingPos, block.z ?? runtimeCellZ(cells, landingPos));
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

function resolveCreatureFloorEffects(cells: EngineMapCell[], creature: MsTrackedCreature, internal: MsInternalState): number {
  const floor = bottomTileId(cells, creature.pos);
  return resolveButtonFloorEffects(cells, internal, null, creature.pos, floor, creature);
}

function resolveChipFloorEffects(cells: EngineMapCell[], internal: MsInternalState): number {
  const floor = bottomTileId(cells, internal.chipPos);
  return resolveButtonFloorEffects(cells, internal, null, internal.chipPos, floor);
}

function createMsCreatureMovementContext(
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

function createMsChipMovementStrategyContext(): MsChipMovementStrategyContext<
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

function createMsCreatureMovementStrategyDispatchContext(
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

function createMsBlockMovementStrategyDispatchContext(): MsBlockMovementStrategyContext<
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
        staticBlockActorIdAtPos(moveCells, moveInternal, movePos) ?? MS_TILE.Block,
      ),
    startMove: moveBlock,
    startUpMove: (engine, sourceCells, targetCells, moveLayerCellsByZ, block, moveInternal) =>
      moveBlockUpOneLayer(engine, sourceCells, targetCells, moveLayerCellsByZ, block, moveInternal),
  };
}

function moveCreatureOnce(
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
    isMsClonerSpecialFloor(bottomTile(cells, creature.pos).id) &&
    msActorClonerFamilyHooks(creature.id).entryBehavior === "occupy-and-hold"
  ) {
    holdMsCreatureOnCloneMachine(cells, internal, creature);
  }
  return result;
}

function moveCreatureDownOneLayer(
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

function moveCreatureUpOneLayer(
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

function chooseCreatureDirection(
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
    const oldWasCloneMachine = isMsClonerSpecialFloor(blockCells[block.pos]!.bottom.id);
    if (!canLeaveFloor(blockCells, block.pos, dir, block.released)) {
      return false;
    }

    const nextPos = nextPosition(block.pos, dir, MS_GRID_WIDTH);
    if (!canMoveBlockInto(blockCells, nextPos, dir, -1, internal, trackedBlockActorId(block))) {
      return false;
    }

    const targetTop = blockCells[nextPos]!.top.id;
    const targetTopState = blockCells[nextPos]!.top.state;
    const targetBottom = blockCells[nextPos]!.bottom.id;
    const targetBottomState = blockCells[nextPos]!.bottom.state;
    const arrivalReplacement = msBlockArrivalReplacement(targetTop, trackedBlockActorId(block));
    if (arrivalReplacement !== null) {
      blockCells[nextPos]!.top = { id: arrivalReplacement.tileId, state: 0 };
      if (!oldWasCloneMachine) {
        popExitedMsMobSourceTile(blockCells, block.pos);
      } else {
        blockCells[block.pos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
      }
      hideTrackedBlockAtPos(internal, block.pos, dir, block.z ?? 1, trackedBlockActorId(block));
      soundEffects |= arrivalReplacement.soundEffects;
      return true;
    }

    const movedTile = oldWasCloneMachine ? { ...blockCells[block.pos]!.top } : popExitedMsMobSourceTile(blockCells, block.pos);
    let landingPos = nextPos;
    if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
      landingPos = findMsBlockTeleportDestination({
        cells: blockCells,
        start: nextPos,
        dir,
        occupiedOriginPos: block.pos,
        canExit: (exitPos) => canMoveBlockInto(blockCells, exitPos, dir, block.pos, internal, trackedBlockActorId(block)),
      });
    }

    placeStaticBlock(blockCells, landingPos, movedTile.state, trackedBlockActorId(block));

    const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
    applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(trackedBlockActorId(block), targetCreatureId));
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

      const arrivalReplacement = msBlockArrivalReplacement(targetTop, trackedBlockActorId(block));
      if (arrivalReplacement !== null) {
        lowerCells[oldPos]!.top = { id: arrivalReplacement.tileId, state: 0 };
        popExitedMsMobSourceTile(blockCells, oldPos);
        hideTrackedBlockAtPos(internal, oldPos, block.dir, sourceZ, trackedBlockActorId(block));
        soundEffects |= arrivalReplacement.soundEffects;
        moved = true;
      } else {
        const movedTile = popExitedMsMobSourceTile(blockCells, oldPos);
        let landingPos = oldPos;
        if (targetTop === MS_TILE.Teleport && (targetTopState & MS_FLOOR_STATE.Broken) === 0) {
          landingPos = findMsBlockTeleportDestination({
            cells: lowerCells,
            start: oldPos,
            dir: block.dir,
            canExit: (exitPos) => canMoveBlockInto(lowerCells, exitPos, block.dir, -1, internal, trackedBlockActorId(block)),
          });
        }

        placeStaticBlock(lowerCells, landingPos, movedTile.state, trackedBlockActorId(block));
        const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
        applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(trackedBlockActorId(block), targetCreatureId));

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
      }
    }
  } else if (block.floorMovement === "elevator") {
    const upperCells = msUpperRuntimeCells(layerCellsByZ, block.z);
    if (upperCells) {
      const elevated = startMsBlockUpMoveByStrategy(
        msActorMovementStrategyId(trackedBlockActorId(block)),
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

function runCreatureFloorMovements(
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
  activateMsMappedBowlingBallsOnForceFloors({
    layerCellsByZ,
    runtime: internal,
    inventory,
    slideDirection: (floor) => slideDirection(floor, internal),
    syncCreatureFloorMovement: (cells, creature) => syncCreatureFloorMovement(cells, creature, internal, inventory),
  });

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

function teleportDestination(
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

function createMsChipMovementContext(
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

function moveChipOnce(
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

function moveChipDownOneLayer(
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

function elevatorDestinationFloor(cell: EngineMapCell): number {
  if (isMsStaticBlockTile(cell.top.id) || isMsCreature(cell.top.id)) {
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
  return startMsChipUpMoveByStrategy(
    msActorMovementStrategyId(MS_TILE.Chip),
    createMsChipMovementStrategyContext(),
    sourceCells,
    targetCells,
    internal,
    inventory,
  );
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
  const targetCreatureId = msStaticBlockActorId(targetTop) ?? (isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty);
  const standingFloor = targetCreatureId !== MS_TILE.Empty ? targetBottom : targetTop;
  let soundEffects = 0;

  if (!isValidElevatorDestinationFloor(standingFloor)) {
    return blockedMovement(soundEffects);
  }
  if (msChipActsWallForMobs(internal, oldPos, targetZ)) {
    return blockedMovement(soundEffects);
  }
  if (
    isMsStaticBlockTile(targetTop) ||
    (targetCreatureId !== MS_TILE.Empty &&
      targetCreatureId !== MS_TILE.Chip &&
      targetCreatureId !== MS_TILE.Swimming_Chip)
  ) {
    return blockedMovement(soundEffects);
  }

  const movedTile = popExitedMsMobSourceTile(sourceCells, oldPos);
  placeStaticBlock(targetCells, oldPos, movedTile.state, trackedBlockActorId(block));
  block.pos = oldPos;
  block.z = targetZ;

  applyMsChipCollisionOutcome(internal, msActorCollisionOutcome(trackedBlockActorId(block), targetCreatureId));

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
  const portableToolMoveModifierEnabled = msPortableToolMoveModifierEnabled(
    msPortableToolState(internal),
    internal.currentInput,
  );
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
      portableToolMoveModifierEnabled,
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
  portableToolMoveModifierEnabled: boolean,
): MovementAttemptResult {
  const originPos = internal.chipPos;
  const originZ = internal.chipZ ?? runtimeCellZ(cells, originPos);
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
  applyMsPortableToolPostMoveAction({
    moveModifierEnabled: portableToolMoveModifierEnabled,
    movementSucceeded: movementDidSucceed(moveResult),
    originPos,
    originZ,
    landedPos: internal.chipPos,
    landedZ: internal.chipZ ?? originZ,
    moveDir: dir,
    resolveSourceStep(originPos, dir) {
      const sourceStep = advanceToCell(cells, originPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
      return sourceStep ? { pos: sourceStep.pos, supportTileId: sourceStep.cell.bottom.id } : null;
    },
    sourceHasMoveModifierTarget(pos, z) {
      return queryMsTargetOccupancy(cells, internal, pos, z).kind === "static-block";
    },
    applyMoveModifier(pos, moveDir) {
      pushBlock(cells, internal, pos, moveDir, false, true);
    },
  });
  return moveResult;
}

function runManualMovement(
  engine: EngineState,
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  dir: number,
  portableToolMoveModifierEnabled: boolean,
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
    portableToolMoveModifierEnabled,
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
  manualPortableToolMoveModifierEnabled: boolean;
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
  reconcileMsPortableToolProjection(msPortableToolState(internal), inventory);
  reconcileMsPortableToolProjection(msPortableToolState(inputLatchInternal), inventory);
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
  projectMsPortableToolState(msPortableToolState(runtime.internal), runtime.inventory);
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
      if (
        runtime.internal.chipDir !== MS_DIRECTION.none &&
        carriedMsPortableToolItem(runtime.internal.portableTools) === undefined
      ) {
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
    applyMsPortableToolAction({
      store: msPortableToolState(runtime.internal),
      inventory: runtime.inventory,
      chipPos: runtime.internal.chipPos,
      chipZ: runtime.internal.chipZ ?? 1,
      chipDir: runtime.internal.chipDir,
      tryActivateMovingItem: (carried, dir) =>
        tryActivateMsPortableBowlingBallThrow({
          layerCellsByZ: runtime.layerCellsByZ,
          fallbackCells: runtime.initialCells,
          runtime: runtime.internal,
          inventory: runtime.inventory,
          carried,
          dir,
          queryTargetOccupancy: (cells, pos, z) => queryMsTargetOccupancy(cells, runtime.internal, pos, z),
          canStartMovement: (cells, creature, dir, inventory, localInventory) =>
            canMoveCreatureWithOptions(cells, creature, dir, false, false, runtime.internal, inventory, localInventory),
          resolvePreMoveCollision: (workingCells, cells, creature, targetPos, dir) =>
            resolveMsCreaturePreMoveCollision(
              workingCells,
              cells,
              runtime.internal,
              runtime.inventory,
              creature,
              targetPos,
              dir,
            ),
          settleSpawnedLanding: (cells, creature, dir, targetTop, targetTopState, targetBottom, targetBottomState) =>
            settleMsSpawnedBowlingBallLanding(
              runtime,
              cells,
              creature,
              dir,
              targetTop,
              targetTopState,
              targetBottom,
              targetBottomState,
            ),
          pushTile,
        }),
    })
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
    runtime.inventory,
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
  runtime.soundEffects |= runCreatureFloorMovements(
    runtime.state.engine,
    runtime.inventory,
    runtime.layerCellsByZ,
    runtime.internal,
    runtime.nextTick,
  );
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
  const carriedPortable = carriedMsPortableToolItem(msPortableToolState(runtime.internal));
  const { modifierMask: manualModifierMask } = decodeRuntimeInputCode(manualChoice.consumedInputCode);
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
    manualPortableToolMoveModifierEnabled: msPortableToolMoveModifierEnabledForCarriedItem(
      carriedPortable,
      manualModifierMask,
    ),
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
  manualPortableToolMoveModifierEnabled: boolean,
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
      manualPortableToolMoveModifierEnabled,
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
  let manualPortableToolMoveModifierEnabled = false;
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
        ({
          chipPosBeforeManualMovement,
          manualDir,
          manualPortableToolMoveModifierEnabled,
          nextLastMove,
        } = resolveMsChipInputPhase(runtime, replayLastMoveInputCode));
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
          manualPortableToolMoveModifierEnabled,
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
