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
import type { MsInternalState, MsTrackedCreature } from './engineTypes';
import {
  isIceFloor,
  isSlideFloor,
  msActorTreatsForcedFloorAsNormal,
  msDetachedToolInventoryProjection,
  msPortableToolState,
  popExitedMsMobSourceTile,
  popTile,
  runtimeCellZ,
} from './engineRuntime';
import {
  clearCreatureFloorMovement,
  creatureAtPos,
  findVisibleTrackedBlock,
  hideTrackedBlockAtPos,
} from './engineMovement';
export function applyMsActorThiefHook(
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

export function msRuntimeActorEntry(
  internal: MsInternalState,
  actorSerial: number,
): MsStatefulActorRuntimeEntry | null {
  return findMsStatefulActorRuntime(
    internal.statefulActors as unknown as StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
    actorSerial,
  ) ?? null;
}

export function projectMsRuntimeActorInventoryOwner(
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

export function queryMsTargetOccupancy(
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

export function msInteractionTargetFromOccupancy(
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
            : target.tileId === MS_TILE.Block_Static
              ? MS_TILE.Block
              : msCreatureId(target.tileId),
        tileId: target.tileId,
        movingDir,
        targetDir,
        sameDirection: movingDir !== MS_DIRECTION.none && targetDir !== MS_DIRECTION.none && movingDir === targetDir,
      } as const;
    }
    case "static-block":
      return {
        kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
        actorId: MS_TILE.Block,
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

export function applyMsChipCollisionOutcome(internal: MsInternalState, outcome: ReturnType<typeof msActorCollisionOutcome>): void {
  if (outcome.chipFails) {
    internal.chipStatus = "collided";
  }
}

export function msPortableBackedActorItemSerial(
  internal: MsInternalState,
  actorSerial: number,
): number | null {
  const runtimeEntry = msRuntimeActorEntry(internal, actorSerial);
  if (runtimeEntry?.portableBacking?.portableItemSerial) {
    return runtimeEntry.portableBacking.portableItemSerial;
  }
  return findMsPortableToolAttachedToActor(msPortableToolState(internal), actorSerial)?.serial ?? null;
}

export function msLayerPositionKey(pos: number, z: number): string {
  return `${z}:${pos}`;
}

export function msCloneSourceSerialAt(
  internal: MsInternalState,
  pos: number,
  z: number,
): number | undefined {
  return internal.cloneSourceSerialByPosition.get(msLayerPositionKey(pos, z));
}

export function holdMsCreatureOnCloneMachine(
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

export function syncMsPortableBackedActorStateToPortableItem(
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

export function destroyMsPortableBackedActorRuntime(
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

export function destroyMsTrackedCreature(
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

export function removeMsTargetRuntimeActor(
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
    hideTrackedBlockAtPos(internal, pos, targetBlock.dir, z);
    return;
  }

  if (cells[pos]?.top.id === MS_TILE.Block_Static || isMsCreature(cells[pos]?.top.id ?? MS_TILE.Empty)) {
    popTile(cells, pos);
  }
}

export function removeMsCollisionTarget(
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

export function revertMsPortableBackedCreatureToMap(
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

export function shouldRevertPortableBackedCreatureOnBlockedMove(
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
  if (standingTile.id === MS_TILE.CloneMachine) {
    return false;
  }
  if (standingTile.id === MS_TILE.Beartrap && !creature.released) {
    return false;
  }
  return true;
}

export function maybeRevertPortableBackedCreatureOnBlockedMove(
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

export function revealMsBallisticBlockedEnter(
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

export function resolveMsCreaturePreMoveCollision(
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
    if (sourceCells[oldPos]!.bottom.id === MS_TILE.CloneMachine) {
      sourceCells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
    } else {
      popExitedMsMobSourceTile(sourceCells, oldPos);
    }
    destroyMsTrackedCreature(internal, inventory, creature);
  }

  return movedMovement();
}

export function cloneMsPortableBackedActorForCloner(
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

