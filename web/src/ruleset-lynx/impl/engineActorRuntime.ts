import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import type { GameDebugPhaseSnapshot, GameDebugTrace } from "@game-core/api/debug";
import { cloneBowlingBallState, setBowlingBallMode } from "@game-core/impl/bowlingBall";
import { findHiddenActorAtPosition, findVisibleActorAtPosition, storeActorInReusableHiddenSlot } from "@game-core/impl/actors";
import {
  addTopTileFlags,
  cloneBoardCells,
  hasTopTileFlags,
  promoteBottomTile,
  removeTopTileFlags,
  replaceTopTile,
  topTileIdOr,
} from "@game-core/impl/board";
import { OCCUPANCY_TARGET_KIND, type OccupancyTarget } from "@game-core/impl/occupancy";
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
import {
  actorInventoryClearBoots,
  actorInventoryClearTools,
  actorInventoryHasBoot,
  actorInventoryUseKey,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import { createReplayPlan, createRuntimeCommand, plannedReplayInput, recordManualMove, runtimeCommandName } from "@game-core/api/playback";
import { decodeRuntimeInputCode, GAME_INPUT_MODIFIER_MASKS, getGameInputNameFromCode } from "@game-core/api/command";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { createGameDebugTrace, createGameTrace } from "@game-core/impl/trace";
import {
  createStatefulActorRuntimeStore,
  type StatefulActorRuntimeEntry,
  type StatefulActorRuntimeStore,
} from "@game-core/impl/statefulActorRuntime";
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
  applyCompletedLynxChipMove as applyCompletedLynxChipMoveWithContext,
} from "@ruleset-lynx/impl/chipArrival";
import {
  advanceLynxChipTrapRelease as advanceLynxChipTrapReleaseWithContext,
  finalizeLynxTickBookkeeping as finalizeLynxTickBookkeepingWithContext,
  resolveLynxPostChipMovement as resolveLynxPostChipMovementWithContext,
} from "@ruleset-lynx/impl/chipResolution";
import {
  chooseLynxCreatureMoveForTick as chooseLynxCreatureMoveForTickWithContext,
  type LynxCreatureControllerContext,
} from "@ruleset-lynx/impl/controllers";
import {
  lynxChipTargetCellAllowsEntry,
  lynxChipTargetCellAllowsPush,
  lynxChipTargetCellStopsOnPush,
  probeLynxChipMoveDirectionWithContext,
  probeLynxChipTargetCell,
} from "@ruleset-lynx/impl/chipMoveProbe";
import {
  canLynxChipUseElevator,
  chipShouldStartLynxAirMove,
  isValidLynxElevatorDestinationFloor,
  resolveLynxChipSupportBelow,
  resolveLynxRuntimeActorSupportBelow,
  startLynxActorAirMovement,
  startLynxActorElevatorMovement,
  startLynxChipAirMovement,
  startLynxChipElevatorMovement,
  type LynxMoveKind,
} from "@ruleset-lynx/impl/verticalMovement";
import {
  canLynxActorStartMovement as canLynxActorStartMovementWithContext,
  finishLynxActorMovement as finishLynxActorMovementWithContext,
  startLynxActorMovement as startLynxActorMovementWithContext,
  type LynxActorMovementContext,
} from "@ruleset-lynx/impl/actorMovement";
import {
  applyLynxChipStartMoveStateByStrategy,
  blockedLynxChipMoveDirectionByStrategy,
  forcedLynxActorDirectionByStrategy,
} from "@ruleset-lynx/impl/movementStrategies";
import {
  activateLynxPortableTool,
  attachLynxPortableToolToActor,
  cloneLynxPortableTool,
  clearLynxToolInventory,
  collectLynxPortableItemsFromLayers,
  destroyLynxPortableTool,
  detachLynxPortableToolToMap,
  findLynxPortableToolAttachedToActor,
  primedLynxPortableToolItem,
  projectLynxPortableToolState,
  queueLynxToolInventoryReplacement,
  reconcileLynxPortableToolProjection,
  sanitizeLynxPortableUnderlyingTile,
  settleLynxPrimedToolDrop,
  type LynxToolInventoryProjection,
  type LynxPortableToolStateStore,
} from "@ruleset-lynx/impl/portableItems";
import { projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
import {
  applyLynxActorArrivalEffects,
  canLynxActorEnterTile,
  lynxRuntimeActorArrivalOutcome,
} from "@ruleset-lynx/impl/actorArrival";
import {
  attachLynxStatefulActorPortableBacking,
  cloneLynxStatefulActorRuntimeForCloner,
  detachLynxStatefulActorPortableBacking,
  destroyLynxStatefulActorRuntime,
  findLynxStatefulActorRuntime,
  seedLynxStatefulActorRuntime,
  spawnLynxBowlingBallStatefulActorFromPortable,
  type LynxStatefulActorRuntimeEntry,
} from "@ruleset-lynx/impl/statefulActors";
import { queryLynxOccupancyTarget } from "@ruleset-lynx/impl/occupancy";
import { applyLynxPortableToolAction } from "@ruleset-lynx/impl/portableToolActions";
import {
  resolveLynxTeleports as resolveLynxTeleportsWithContext,
  type LynxTeleportContext,
} from "@ruleset-lynx/impl/teleports";
import {
  activateLynxCloner as activateLynxClonerWithContext,
  findLynxTrapTarget as findLynxTrapTargetInLevel,
  isLynxTrapHeldOpen,
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
  lynxActorMovementStrategyId,
  lynxBlockMovementMask,
  lynxButtonAction,
  lynxChipMoveSoundAction,
  lynxChipMovementMask,
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
  lynxActorCollisionOutcome,
  lynxActorHazardOutcome,
  lynxActorInteractionOutcome,
  lynxInteractionTargetFromOccupancy,
  lynxActorThiefOutcome,
} from "@ruleset-lynx/impl/actorInteractions";
import {
  applyLynxMobExitFloorEffect,
  applyLynxBlockedChipEnterEffect,
  applyLynxTileActivationEffect,
} from "@ruleset-lynx/impl/tileEffects";
import { lynxBlockedMoveFloorImpactAction } from "@ruleset-lynx/impl/floorImpactPolicy";
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

import { LYNX_ANIMATION_TILE } from './engineTypes';
import {
  activeLynxLayerZ,
  lynxPortableToolRuntime,
  lynxRuntimeState,
} from './engineRuntime';
import { isLynxIce, isLynxSlide, lynxStatefulActorRuntime, removeLynxActor } from './engineMovement';
export function applyLynxActorThiefHook(
  state: EngineState,
  actorId: number,
  inventoryOwner: ActorLocalInventoryOwner,
): boolean {
  if (lynxActorThiefOutcome(actorId) !== "steal-boots-tools") {
    return false;
  }
  actorInventoryClearBoots(inventoryOwner);
  actorInventoryClearTools(inventoryOwner);
  if (actorId === MS_TILE.Chip) {
    clearLynxToolInventory(lynxPortableToolRuntime(state), state.inventory);
  }
  return true;
}

export function lynxRuntimeActorEntry(
  state: EngineState,
  actorSerial: number,
): LynxStatefulActorRuntimeEntry | null {
  return findLynxStatefulActorRuntime(
    lynxStatefulActorRuntime(state) as unknown as StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
    actorSerial,
  ) ?? null;
}

export function projectLynxRuntimeActorInventoryOwner(
  state: EngineState,
  actor: Pick<LynxRuntimeActor, "id" | "serial">,
): ActorLocalInventoryOwner {
  const runtimeEntry = lynxRuntimeActorEntry(state, actor.serial);
  return projectLynxActorInventoryOwner(actor.id, state.inventory, {
    actorSerial: actor.serial,
    runtimeEntry,
  });
}

export function lynxDetachedToolInventoryProjection(): LynxToolInventoryProjection {
  return {
    tools: [0],
  };
}

export function lynxPortableBackedActorItemSerial(
  state: EngineState,
  actorSerial: number,
): number | null {
  const runtimeEntry = lynxRuntimeActorEntry(state, actorSerial);
  if (runtimeEntry?.portableBacking?.portableItemSerial !== undefined) {
    return runtimeEntry.portableBacking.portableItemSerial;
  }
  return findLynxPortableToolAttachedToActor(lynxPortableToolRuntime(state), actorSerial)?.serial ?? null;
}

export function syncLynxPortableBackedActorStateToPortableItem(
  state: EngineState,
  actorSerial: number,
): void {
  const runtimeEntry = lynxRuntimeActorEntry(state, actorSerial);
  const attachedItem = findLynxPortableToolAttachedToActor(lynxPortableToolRuntime(state), actorSerial);
  if (
    runtimeEntry?.kind !== "bowling-ball" ||
    attachedItem?.family !== "bowling-ball" ||
    !attachedItem.bowlingBallState
  ) {
    return;
  }

  attachedItem.bowlingBallState = cloneBowlingBallState(runtimeEntry.state);
}

export function destroyLynxPortableBackedActorRuntime(
  state: EngineState,
  actorSerial: number,
): void {
  syncLynxPortableBackedActorStateToPortableItem(state, actorSerial);
  const portableItemSerial = lynxPortableBackedActorItemSerial(state, actorSerial);
  if (portableItemSerial !== null) {
    destroyLynxPortableTool(lynxPortableToolRuntime(state), state.inventory, portableItemSerial);
  }
  destroyLynxStatefulActorRuntime(lynxStatefulActorRuntime(state), actorSerial);
}

export function removeLynxCollisionTarget(
  state: EngineState,
  actors: LynxRuntimeActor[],
  target: ReturnType<typeof queryLynxOccupancyOnLayer>,
): void {
  switch (target.kind) {
    case OCCUPANCY_TARGET_KIND.portableItem:
      if (target.portableItem && "serial" in target.portableItem && typeof target.portableItem.serial === "number") {
        destroyLynxPortableTool(lynxPortableToolRuntime(state), state.inventory, target.portableItem.serial);
      }
      promoteBottomTile(state.map.cells, target.pos, MS_TILE.Empty);
      return;
    case OCCUPANCY_TARGET_KIND.runtimeActor:
      if (target.runtimeActor) {
        removeTopTileFlags(state.map.cells, target.pos, LYNX_CELL_FLAG.Claimed);
        removeLynxActor(state, actors, target.runtimeActor as LynxRuntimeActor, LYNX_ANIMATION_TILE.Entity_Explosion);
      }
      return;
    default:
      return;
  }
}

export function revealBlockedLynxBallisticEnter(
  state: EngineState,
  actor: LynxRuntimeActor,
  dir: number,
): void {
  if (lynxActorMovementStrategyId(actor.id) !== "ballistic-like" || dir === MS_DIRECTION.none) {
    return;
  }

  const targetStep = advanceToCell(state.map.cells, actor.pos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return;
  }

  applyLynxBlockedChipEnterEffect(state, targetStep.pos);
}

export function shouldRevertLynxPortableBackedActorOnBlockedMove(
  state: EngineState,
  actor: LynxRuntimeActor,
  floorId: number,
  releasing: boolean,
): boolean {
  if (lynxBlockedMoveFloorImpactAction(actor.id) !== "revert-portable" || actor.hidden) {
    return false;
  }

  if (floorId === MS_TILE.CloneMachine) {
    return false;
  }

  if ((isLynxSlide(floorId) || isLynxIce(floorId)) && !lynxActorTreatsForcedFloorAsNormal(state, actor, floorId)) {
    return false;
  }
  if (!releasing && lynxTileHasTag(floorId, "trap")) {
    return false;
  }
  return true;
}

export function lynxForcedFloorBootIndex(floorId: number): number | null {
  if (isLynxSlide(floorId)) {
    return 0;
  }
  if (isLynxIce(floorId)) {
    return 1;
  }
  return null;
}

export function lynxActorTreatsForcedFloorAsNormal(
  state: EngineState,
  actor: Pick<LynxRuntimeActor, "id" | "serial">,
  floorId: number,
): boolean {
  const bootIndex = lynxForcedFloorBootIndex(floorId);
  if (bootIndex === null) {
    return false;
  }

  return actorInventoryHasBoot(projectLynxRuntimeActorInventoryOwner(state, actor), bootIndex);
}

export function revertLynxPortableBackedActorToMap(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
): boolean {
  const attachedItem = findLynxPortableToolAttachedToActor(lynxPortableToolRuntime(state), actor.serial);
  if (!attachedItem) {
    return false;
  }

  syncLynxPortableBackedActorStateToPortableItem(state, actor.serial);
  const actorZ = actor.z ?? activeLynxLayerZ(state);
  const tileId = attachedItem.tileId;
  detachLynxStatefulActorPortableBacking(lynxStatefulActorRuntime(state), actor.serial);
  if (!detachLynxPortableToolToMap(lynxPortableToolRuntime(state), state.inventory, attachedItem.serial, actor.pos, actorZ)) {
    return false;
  }

  const cell = state.map.cells[actor.pos];
  if (!cell) {
    return false;
  }
  cell.bottom = sanitizeLynxPortableUnderlyingTile(cell.top);
  cell.top = { id: tileId, state: 0 };
  actor.hidden = true;
  actor.moving = 0;
  actor.frame = 0;
  actor.intentDir = 0;
  actor.forcedDir = 0;
  actor.teleported = false;
  actor.moveKind = "planar";
  actor.ignoreIceFromAir = false;
  actor.pushed = false;
  actor.deferPush = false;
  actor.deferPushArmed = false;
  actor.reversePending = false;
  actor.dormant = false;
  actor.animationReserved = false;
  removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
  destroyLynxStatefulActorRuntime(lynxStatefulActorRuntime(state), actor.serial);
  return true;
}

export function maybeRevertLynxPortableBackedActorOnBlockedMove(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  floorId: number,
  releasing: boolean,
): boolean {
  return (
    shouldRevertLynxPortableBackedActorOnBlockedMove(state, actor, floorId, releasing) &&
    revertLynxPortableBackedActorToMap(state, actors, actor)
  );
}

export function resolveLynxRuntimeActorPreMoveCollision(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  dir: number,
): MovementAttemptResult | null {
  const targetStep = advanceToCell(state.map.cells, actor.pos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  const target = queryLynxOccupancyOnLayer(state, actors, targetStep.pos, actor.z ?? activeLynxLayerZ(state));
  if (target.kind === OCCUPANCY_TARGET_KIND.empty || target.kind === OCCUPANCY_TARGET_KIND.chip) {
    return null;
  }

  const interaction = lynxActorInteractionOutcome(actor.id, lynxInteractionTargetFromOccupancy(target, dir));
  if (
    interaction.denyMove ||
    (!interaction.removeMovingActor && !interaction.removeTargetActor && !interaction.consumeTarget)
  ) {
    return null;
  }

  if (interaction.removeTargetActor || interaction.consumeTarget) {
    removeLynxCollisionTarget(state, actors, target);
  }
  if (interaction.removeMovingActor) {
    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, actor, LYNX_ANIMATION_TILE.Entity_Explosion);
  }

  return movedMovement();
}

export function cloneLynxPortableBackedActorForCloner(
  state: EngineState,
  sourceActorSerial: number,
  cloneActorSerial: number,
): void {
  const detachedProjection = lynxDetachedToolInventoryProjection();
  syncLynxPortableBackedActorStateToPortableItem(state, sourceActorSerial);
  cloneLynxStatefulActorRuntimeForCloner(lynxStatefulActorRuntime(state), sourceActorSerial, cloneActorSerial);
  const sourcePortableSerial = lynxPortableBackedActorItemSerial(state, sourceActorSerial);
  if (sourcePortableSerial === null) {
    return;
  }

  const clonedPortable = cloneLynxPortableTool(
    lynxPortableToolRuntime(state),
    detachedProjection,
    sourcePortableSerial,
  );
  if (!clonedPortable) {
    return;
  }

  attachLynxPortableToolToActor(
    lynxPortableToolRuntime(state),
    detachedProjection,
    clonedPortable.serial,
    cloneActorSerial,
  );
  attachLynxStatefulActorPortableBacking(lynxStatefulActorRuntime(state), cloneActorSerial, {
    family: clonedPortable.family,
    portableItemSerial: clonedPortable.serial,
  });
}

export function queryLynxOccupancyOnLayer(
  state: EngineState,
  actors: LynxRuntimeActor[],
  pos: number,
  z = activeLynxLayerZ(state),
) {
  const runtime = lynxRuntimeState(state);
  return queryLynxOccupancyTarget(
    {
      cells: state.map.cells,
      chipPos: runtime.chipPos,
      chipZ: runtime.chipZ,
      actors,
      portableItems: runtime.portableTools.portableItems,
    },
    pos,
    z,
  );
}

export interface LynxRuntimeActor {
  serial: number;
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
