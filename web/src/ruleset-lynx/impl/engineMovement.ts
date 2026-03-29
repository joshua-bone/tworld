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

import type {
  LynxAdvanceTickRuntime,
  LynxPortableToolRuntimeState,
  LynxRuntimeActor,
  LynxStatefulActorRuntimeState,
  LynxTickContext,
} from './engineTypes';
import { LYNX_ANIMATION_TILE } from './engineTypes';
import {
  applyLynxActorThiefHook,
  cloneLynxPortableBackedActorForCloner,
  destroyLynxPortableBackedActorRuntime,
  lynxActorTreatsForcedFloorAsNormal,
  lynxPortableBackedActorItemSerial,
  lynxRuntimeActorEntry,
  maybeRevertLynxPortableBackedActorOnBlockedMove,
  projectLynxRuntimeActorInventoryOwner,
  queryLynxOccupancyOnLayer,
  removeLynxCollisionTarget,
  resolveLynxRuntimeActorPreMoveCollision,
  revealBlockedLynxBallisticEnter,
  syncLynxPortableBackedActorStateToPortableItem,
} from './engineActorRuntime';
import {
  activeLynxLayerZ,
  applyLynxExitedMobSourceFloorEffect,
  findChipSeed,
  isLynxAir,
  isLynxElevator,
  isLynxVerticalMoveKind,
  lynxAnimationTileId,
  lynxCellsForZ,
  lynxChipRuntime,
  lynxLowerRuntimeCells,
  lynxPortableToolRuntime,
  lynxRuntimeLayers,
  lynxRuntimeState,
  lynxUpperRuntimeCells,
  lynxVisualRuntime,
  normalizeRandomSeed,
  parseLynxActors,
  setLynxActiveLayer,
  stripCreaturesForInitialHash,
  withLynxLayer,
} from './engineRuntime';
export function tryActivateLynxBowlingBallThrow(
  runtime: LynxAdvanceTickRuntime,
  carried: LynxPortableToolRuntimeState["portableItems"][number],
  dir: number,
): boolean {
  if (!carried.bowlingBallState) {
    return false;
  }

  const probeActor: LynxRuntimeActor = {
    serial: -1,
    id: MS_TILE.BowlingBall,
    pos: runtime.chipPos,
    z: runtime.chipZ,
    dir,
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
  };
  const inventoryOwner = projectLynxActorInventoryOwner(MS_TILE.BowlingBall, runtime.state.inventory, {
    localInventory: carried.bowlingBallState.localInventory,
  });
  if (!canLynxRuntimeActorStartMovement(runtime.state, runtime.actors, probeActor, dir, false, false, inventoryOwner)) {
    return false;
  }

  setBowlingBallMode(carried.bowlingBallState, "moving", dir);
  const actorSerial = allocateLynxActorSerial(runtime.state);
  if (!activateLynxPortableTool(lynxPortableToolRuntime(runtime.state), runtime.state.inventory, carried.serial, actorSerial)) {
    setBowlingBallMode(carried.bowlingBallState, "still", dir);
    return false;
  }

  spawnLynxBowlingBallStatefulActorFromPortable(
    lynxStatefulActorRuntime(runtime.state),
    actorSerial,
    carried.serial,
    carried.bowlingBallState,
  );
  const actor = allocateLynxActorSlot(runtime.actors, {
    serial: actorSerial,
    id: MS_TILE.BowlingBall,
    pos: runtime.chipPos,
    z: runtime.chipZ,
    dir,
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
  if (!movementDidSucceed(startLynxRuntimeActorMovement(runtime.state, runtime.actors, actor, dir))) {
    return false;
  }
  runtime.justSpawnedActorSerials.add(actorSerial);
  return true;
}

export function activateMappedLynxBowlingBallsOnForceFloors(
  state: EngineState,
  actors: LynxRuntimeActor[],
): void {
  for (const item of lynxPortableToolRuntime(state).portableItems) {
    if (
      item.family !== "bowling-ball" ||
      item.state.mode !== "map" ||
      !item.bowlingBallState ||
      item.bowlingBallState.mode !== "still"
    ) {
      continue;
    }

    const cells = lynxCellsForZ(state.map, item.state.z);
    const cell = cells[item.state.pos];
    if (!cell || cell.top.id !== item.tileId) {
      continue;
    }

    const floor = cell.bottom.id;
    if (!isLynxSlide(floor)) {
      continue;
    }

    const dir = getLynxSlideDirection(state, floor, true);
    if (dir === MS_DIRECTION.none) {
      continue;
    }

    const pos = item.state.pos;
    const z = item.state.z;
    setBowlingBallMode(item.bowlingBallState, "moving", dir);
    const actorSerial = allocateLynxActorSerial(state);
    if (!activateLynxPortableTool(lynxPortableToolRuntime(state), state.inventory, item.serial, actorSerial)) {
      setBowlingBallMode(item.bowlingBallState, "still", dir);
      continue;
    }

    spawnLynxBowlingBallStatefulActorFromPortable(
      lynxStatefulActorRuntime(state),
      actorSerial,
      item.serial,
      item.bowlingBallState,
    );
    promoteBottomTile(cells, pos, MS_TILE.Empty);
    addTopTileFlags(cells, pos, LYNX_CELL_FLAG.Claimed);
    allocateLynxActorSlot(actors, {
      serial: actorSerial,
      id: MS_TILE.BowlingBall,
      pos,
      z,
      dir,
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

export function seedLynxPortableBackedBowlingBallActors(
  state: EngineState,
  actors: LynxRuntimeActor[],
): void {
  const runtime = lynxRuntimeState(state);
  for (const actor of actors) {
    if (actor.hidden || actor.id !== MS_TILE.BowlingBall) {
      continue;
    }

    const runtimeEntry = lynxRuntimeActorEntry(state, actor.serial);
    if (
      runtimeEntry?.kind !== "bowling-ball" ||
      runtimeEntry.portableBacking?.portableItemSerial !== undefined ||
      findLynxPortableToolAttachedToActor(runtime.portableTools, actor.serial)
    ) {
      continue;
    }

    const portableItemSerial = runtime.portableTools.nextPortableItemSerial;
    runtime.portableTools.portableItems.push({
      serial: portableItemSerial,
      family: "bowling-ball",
      tileId: MS_TILE.BowlingBall_Still,
      inventorySlot: "tools",
      bowlingBallState: cloneBowlingBallState(runtimeEntry.state),
      state: {
        mode: "attached",
        attachmentKind: "actor",
        attachmentId: actor.serial,
      },
    });
    runtime.portableTools.nextPortableItemSerial += 1;
    attachLynxStatefulActorPortableBacking(runtime.statefulActors, actor.serial, {
      family: "bowling-ball",
      portableItemSerial,
    });
  }
}

export function lynxStatefulActorRuntime(state: EngineState): LynxStatefulActorRuntimeState {
  return lynxRuntimeState(state).statefulActors;
}

export function allocateLynxActorSerial(state: EngineState): number {
  const runtime = lynxRuntimeState(state);
  const serial = runtime.nextActorSerial;
  runtime.nextActorSerial += 1;
  return serial;
}

export function setLynxRuntimeChipState(state: EngineState, chipPos: number, chipZ: number): void {
  const runtime = lynxRuntimeState(state);
  runtime.chipPos = chipPos;
  runtime.chipZ = chipZ;
}

export function lynxChipActsWallForMobs(state: EngineState, pos: number, z: number): boolean {
  const runtime = lynxRuntimeState(state);
  return primedLynxPortableToolItem(runtime.portableTools) !== undefined && runtime.chipPos === pos && runtime.chipZ === z;
}

export function clearLynxAnimationAt(state: EngineState, actors: LynxRuntimeActor[], pos: number): boolean {
  const visuals = lynxVisualRuntime(state);
  const index = visuals.animations.findIndex((animation) => animation.pos === pos);
  if (index < 0) {
    return false;
  }

  visuals.animations.splice(index, 1);
  removeTopTileFlags(state.map.cells, pos, LYNX_CELL_FLAG.Animated);
  releaseReservedAnimationActorAt(actors, pos);
  return true;
}

export function clearLynxTileOverlays(state: EngineState): void {
  const visuals = lynxVisualRuntime(state);
  visuals.tileOverlays = visuals.tileOverlays
    .map((overlay) => ({ ...overlay, ttl: overlay.ttl - 1 }))
    .filter((overlay) => overlay.ttl > 0);
}

export function addLynxTileOverlay(
  state: EngineState,
  z: number,
  pos: number,
  kind: InteractiveGameTileOverlayKind,
  ttl = 2,
): void {
  const visuals = lynxVisualRuntime(state);
  const existing = visuals.tileOverlays.find((overlay) => overlay.z === z && overlay.pos === pos && overlay.kind === kind);
  if (existing) {
    existing.ttl = ttl;
    return;
  }
  visuals.tileOverlays.push({ z, pos, kind, ttl });
}

export function createLynxTickContext(
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

export function findPressedLynxPermanentHiddenWallPos(state: EngineState, chipPos: number, dir: number): number | null {
  const targetStep = advanceToCell(state.map.cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  if (hasTopTileFlags(state.map.cells, targetStep.pos, LYNX_CELL_FLAG.Claimed)) {
    return null;
  }

  return effectiveLynxTargetTileId(state, targetStep.cell.top.id) === MS_TILE.HiddenWall_Perm ? targetStep.pos : null;
}

export function findSlappedLynxBlueWallRevealPos(state: EngineState, chipPos: number, dir: number): number | null {
  const targetStep = advanceToCell(state.map.cells, chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return null;
  }

  if (hasTopTileFlags(state.map.cells, targetStep.pos, LYNX_CELL_FLAG.Claimed)) {
    return null;
  }

  return effectiveLynxTargetTileId(state, targetStep.cell.top.id) === MS_TILE.BlueWall_Real ? targetStep.pos : null;
}

export function releaseReservedAnimationActorAt(actors: LynxRuntimeActor[], pos: number): void {
  const actor = findHiddenActorAtPosition(actors, pos, (entry) => entry.animationReserved);
  if (!actor) {
    return;
  }
  actor.animationReserved = false;
}

export function initialLynxAnimationFrame(state: EngineState): number {
  return (((state.timer.currentTime + 1) + state.replay.stepping) & 1) !== 0 ? 11 : 10;
}

export function startLynxAnimation(state: EngineState, actors: LynxRuntimeActor[], pos: number, tileId: number): void {
  clearLynxAnimationAt(state, actors, pos);

  const cell = state.map.cells[pos];
  if (!cell) {
    return;
  }

  lynxVisualRuntime(state).animations.push({
    pos,
    frame: initialLynxAnimationFrame(state),
    tileId,
  });
  addTopTileFlags(state.map.cells, pos, LYNX_CELL_FLAG.Animated);
}

export function advanceLynxAnimations(state: EngineState, actors: LynxRuntimeActor[]): void {
  const visuals = lynxVisualRuntime(state);

  for (let index = visuals.animations.length - 1; index >= 0; index -= 1) {
    const animation = visuals.animations[index]!;
    animation.frame -= 1;
    if (animation.frame >= 0) {
      continue;
    }

    removeTopTileFlags(state.map.cells, animation.pos, LYNX_CELL_FLAG.Animated);
    releaseReservedAnimationActorAt(actors, animation.pos);
    visuals.animations.splice(index, 1);
  }
}

export function removeLynxActor(
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
  destroyLynxPortableBackedActorRuntime(state, actor.serial);
  startLynxAnimation(state, actors, actor.pos, animationTileId);
}

export function startLynxEndGame(
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

export function failLynxChip(
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

export function finalizeLynxEndGame(
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

export function advanceLynxEndGameAnimationFrame(
  endGameResult: LynxEndGameResult | null,
  endGameAnimationFrame: number | null,
): number | null {
  if (endGameResult !== "failed" || endGameAnimationFrame === null) {
    return endGameAnimationFrame;
  }

  return endGameAnimationFrame > 0 ? endGameAnimationFrame - 1 : null;
}

export function clearLynxCouldntMove(state: EngineState): void {
  lynxChipRuntime(state).couldntMove = false;
}

export function addLynxCantMove(state: EngineState): void {
  const chipRuntime = lynxChipRuntime(state);
  if (chipRuntime.couldntMove) {
    return;
  }

  chipRuntime.couldntMove = true;
  state.soundEffects |= 1 << LYNX_SOUND.CantMove;
}

export function canLynxCreatureEnterWithInventoryOwner(
  state: EngineState,
  actorId: number,
  tileId: number,
  dir: number,
  inventoryOwner: ActorLocalInventoryOwner,
): boolean {
  const mask = lynxActorEntryMask(tileId, actorId);
  if ((mask & dir) === 0) {
    return false;
  }
  if (!canLynxActorEnterTile(tileId, state.inventory, inventoryOwner)) {
    return false;
  }
  if (lynxActorHazardOutcome(tileId, actorId) === "deny-entry") {
    return false;
  }
  return true;
}

export function canLynxCreatureEnter(state: EngineState, actor: Pick<LynxRuntimeActor, "id" | "serial">, tileId: number, dir: number): boolean {
  return canLynxCreatureEnterWithInventoryOwner(
    state,
    actor.id,
    tileId,
    dir,
    projectLynxRuntimeActorInventoryOwner(state, actor),
  );
}

export function effectiveLynxTargetTileId(state: EngineState, tileId: number): number {
  if (!lynxRuntimeState(state).toggleWallsPending) {
    return tileId;
  }
  return lynxToggledWallTileId(tileId);
}

export function probeLynxChipTargetCellForState(
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

export function canLynxExitTile(state: EngineState, tileId: number, actorId: number, dir: number, releasing: boolean): boolean {
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

export function createLynxActorMovementContext(
  state: EngineState,
  actors: LynxRuntimeActor[],
  resolveButtonEffects: (pos: number, tileId: number) => number = () => 0,
  fallingCollision:
    | {
        chipPos: number;
        chipZ: number;
        recordCollision(actor: LynxRuntimeActor): void;
      }
    | undefined = undefined,
): LynxActorMovementContext {
  return {
    state,
    actors,
    soundBits: {
      trapEntered: 1 << LYNX_SOUND.TrapEntered,
      waterSplash: 1 << LYNX_SOUND.WaterSplash,
      bombExplodes: 1 << LYNX_SOUND.BombExplodes,
      blockMoving: 1 << LYNX_SOUND.BlockMoving,
    },
    activeLayerZ: () => activeLynxLayerZ(state),
    canExitTile: (tileId, actorId, dir, releasing) => canLynxExitTile(state, tileId, actorId, dir, releasing),
    chipActsWallForMobs: (pos, z) => lynxChipActsWallForMobs(state, pos, z),
    queryTargetOccupancy: (pos, z) => queryLynxOccupancyOnLayer(state, actors, pos, z),
    interactionOutcome: (actor, target) => lynxActorInteractionOutcome(actor.id, lynxInteractionTargetFromOccupancy(target)),
    clearAnimationAt: (pos) => {
      clearLynxAnimationAt(state, actors, pos);
    },
    applyMobExitFloorEffect: (pos, z) => applyLynxExitedMobSourceFloorEffect(state, pos, z),
    canActorEnter: (actor, tileId, dir) => canLynxCreatureEnter(state, actor as LynxRuntimeActor, tileId, dir),
    arrivalOutcome: (actor, floorId) =>
      lynxRuntimeActorArrivalOutcome(floorId, actor.id, projectLynxRuntimeActorInventoryOwner(state, actor as LynxRuntimeActor)),
    effectiveTargetTileId: (tileId) => effectiveLynxTargetTileId(state, tileId),
    turnBlockedIceDirection: (dir, floorId) => applyLynxIceWallTurn(backDirection(dir), floorId),
    shouldTurnBlockedIce: (actor, floorId) =>
      lynxBlockedMoveFloorImpactAction(actor.id) === null || !lynxActorTreatsForcedFloorAsNormal(state, actor as LynxRuntimeActor, floorId),
    applyIceWallTurn: applyLynxIceWallTurn,
    resolveButtonEffects,
    removeActor: (actor, animationTileId) => {
      removeLynxActor(state, actors, actor as LynxRuntimeActor, animationTileId);
    },
    animationTileId: lynxAnimationTileId,
    waterSplashTileId: LYNX_ANIMATION_TILE.Water_Splash,
    bombExplosionTileId: LYNX_ANIMATION_TILE.Bomb_Explosion,
    isChipAt: (pos, z) => fallingCollision !== undefined && pos === fallingCollision.chipPos && z === fallingCollision.chipZ,
    recordFallingChipCollision: (actor) => {
      if (fallingCollision !== undefined) {
        fallingCollision.recordCollision(actor as LynxRuntimeActor);
      }
    },
    applyArrivalEffects: (actor) =>
      applyLynxActorArrivalEffects(
        {
          state,
          inventoryOwner: projectLynxRuntimeActorInventoryOwner(state, actor as LynxRuntimeActor),
          runtimeEntry: lynxRuntimeActorEntry(state, (actor as LynxRuntimeActor).serial),
          soundBits: {
            doorOpened: 1 << LYNX_SOUND.DoorOpened,
            socketOpened: 1 << LYNX_SOUND.SocketOpened,
            tileEmptied: 1 << LYNX_SOUND.TileEmptied,
            wallCreated: 1 << LYNX_SOUND.WallCreated,
            bootsStolen: 1 << LYNX_SOUND.BootsStolen,
            itemCollected: 1 << LYNX_SOUND.ItemCollected,
            icCollected: 1 << LYNX_SOUND.IcCollected,
          },
          resolveButtonEffects,
        },
        actor.id,
        actor.pos,
      ),
  };
}

export function createLynxCompletedChipMoveContext(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
) {
  return {
    state,
    soundBits: {
      doorOpened: 1 << LYNX_SOUND.DoorOpened,
      socketOpened: 1 << LYNX_SOUND.SocketOpened,
      tileEmptied: 1 << LYNX_SOUND.TileEmptied,
      wallCreated: 1 << LYNX_SOUND.WallCreated,
      bootsStolen: 1 << LYNX_SOUND.BootsStolen,
      itemCollected: 1 << LYNX_SOUND.ItemCollected,
      icCollected: 1 << LYNX_SOUND.IcCollected,
      trapEntered: 1 << LYNX_SOUND.TrapEntered,
      chipWins: 1 << LYNX_SOUND.ChipWins,
    },
    resolveButtonEffects: (pos: number, tileId: number) => resolveLynxButtonEffects(state, level, actors, pos, tileId),
    applyThiefHook: () =>
      applyLynxActorThiefHook(state, MS_TILE.Chip, projectLynxActorInventoryOwner(MS_TILE.Chip, state.inventory)),
    queueCollectedTool: (pos: number, tileId: number) => {
      queueLynxToolInventoryReplacement(
        lynxPortableToolRuntime(state),
        state.inventory,
        tileId,
        pos,
        activeLynxLayerZ(state),
      );
    },
    springTrap: (pos: number) => {
      springLynxTrap(state, level, actors, pos);
    },
    hasBoot: (tileId: number) => hasLynxBoots(state, tileId),
    applyIceWallTurn: applyLynxIceWallTurn,
    failChip: (
      chipPos: number,
      chipDir: number,
      endGameTicksElapsed: number | null,
      endGameResult: LynxEndGameResult | null,
      endGameAnimationTileId: number | null,
      endGameAnimationFrame: number | null,
      reason: "drowned" | "burned" | "bombed",
    ) =>
      failLynxChip(
        state,
        actors,
        chipPos,
        chipDir,
        0,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
        reason,
      ),
    startCompletedEndGame: (
      endGameTicksElapsed: number | null,
      endGameResult: LynxEndGameResult | null,
      endGameAnimationTileId: number | null,
      endGameAnimationFrame: number | null,
    ) =>
      startLynxEndGame(
        state,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
        "completed",
        null,
      ),
  };
}

export function createLynxPostMoveContext(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
) {
  return {
    state,
    applyCompletedMove: (
      chipPos: number,
      chipDir: number,
      chipMoveKind: LynxMoveKind,
      endGameTicksElapsed: number | null,
      endGameResult: LynxEndGameResult | null,
      endGameAnimationTileId: number | null,
      endGameAnimationFrame: number | null,
    ) =>
      applyCompletedLynxChipMove(
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
      ),
    chipMovementSpeed: (floorId: number, moveKind: LynxMoveKind = "planar") =>
      lynxChipMovementSpeed(state, floorId, moveKind),
    springTrap: (pos: number) => {
      springLynxTrap(state, level, actors, pos);
    },
    resolveTeleports: (chipPos: number, chipDir: number, chipMoving: number) =>
      resolveLynxTeleports(state, actors, chipPos, chipDir, chipMoving),
    clearDeferredBlockPushes: () => {
      clearDeferredLynxBlockPushes(actors);
    },
  };
}

export function createLynxTrapReleaseContext(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
) {
  return {
    state,
    markTrapReleaseCantMove: () => {
      lynxChipRuntime(state).trapReleaseCantMoveThisTick = true;
    },
    addCantMove: () => {
      addLynxCantMove(state);
    },
    findTargetBlock: (targetPos: number) => {
      const target = queryLynxOccupancyOnLayer(state, actors, targetPos);
      return (
        target.claimed &&
        target.kind === OCCUPANCY_TARGET_KIND.runtimeActor &&
        target.runtimeActor?.id === MS_TILE.Block
      );
    },
    probeTargetCell: (targetPos: number, dir: number, claimedCell: boolean) =>
      probeLynxChipTargetCellForState(state, targetPos, dir, claimedCell),
    targetCellAllowsPush: (probe: ReturnType<typeof probeLynxChipTargetCellForState>) => lynxChipTargetCellAllowsPush(probe),
    targetCellAllowsEntry: (probe: ReturnType<typeof probeLynxChipTargetCellForState>) => lynxChipTargetCellAllowsEntry(probe),
    tryPushBlock: (targetPos: number, dir: number) => tryPushLynxBlock(state, level, actors, targetPos, dir),
    canEnterAfterPushingBlock: (
      targetPos: number,
      dir: number,
      probe: ReturnType<typeof probeLynxChipTargetCellForState>,
    ) =>
      canLynxChipEnterAfterPushingBlock(state, targetPos, dir, probe),
    revealHiddenWall: (targetPos: number) => revealBlockedLynxChipEnterTile(state, targetPos),
    settlePrimedToolDrop: (originPos: number, originZ: number) => {
      settleLynxPrimedToolDrop(
        state,
        lynxPortableToolRuntime(state),
        state.inventory,
        originPos,
        originZ,
        (layerZ, run) => withLynxLayer(state, layerZ, run),
      );
    },
    activeLayerZ: () => activeLynxLayerZ(state),
    chipMovementSpeed: (floorId: number, moveKind: LynxMoveKind = "planar") =>
      lynxChipMovementSpeed(state, floorId, moveKind),
    applyCompletedMove: (
      chipPos: number,
      chipDir: number,
      chipMoveKind: LynxMoveKind,
      endGameTicksElapsed: number | null,
      endGameResult: LynxEndGameResult | null,
      endGameAnimationTileId: number | null,
      endGameAnimationFrame: number | null,
    ) =>
      applyCompletedLynxChipMove(
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
      ),
  };
}

export function createLynxTickBookkeepingContext(state: EngineState) {
  return {
    state,
    soundBits: {
      fireWalking: 1 << LYNX_SOUND.FireWalking,
      waterWalking: 1 << LYNX_SOUND.WaterWalking,
      iceWalking: 1 << LYNX_SOUND.IceWalking,
      skatingForward: 1 << LYNX_SOUND.SkatingForward,
      skatingTurn: 1 << LYNX_SOUND.SkatingTurn,
      slideWalking: 1 << LYNX_SOUND.SlideWalking,
      sliding: 1 << LYNX_SOUND.Sliding,
    },
    hasBoot: (tileId: number) => hasLynxBoots(state, tileId),
    resetFloorSounds: () => {
      resetLynxFloorSounds(state);
    },
    updateViewFromMovement: (
      chipPos: number,
      chipDir: number,
      chipMoving: number,
      chipMoveKind: LynxMoveKind,
    ) => {
      updateLynxViewFromMovement(state, chipPos, chipDir, chipMoving, chipMoveKind);
    },
    finalizeEndGame: (endGameTicksElapsed: number | null, endGameResult: LynxEndGameResult | null) =>
      finalizeLynxEndGame(state, endGameTicksElapsed, endGameResult),
  };
}

export function advanceLynxMainRandom4(state: EngineState): number {
  const current = BigInt(state.replay.randomState.main.value);
  const next = ((current * 1103515245n) + 12345n) & 0x7fffffffn;
  state.replay.randomState.main.value = String(next);
  return Number(next >> 29n);
}

export function advanceLynxPrng(state: EngineState): number {
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

export function left(dir: number): number {
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

export function right(dir: number): number {
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

export function back(dir: number): number {
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

export function updateLynxViewChip(state: EngineState): void {
  state.chip = {
    id: -1,
    layer: -1,
    dir: "none",
    position: roundedBoardPosition(state.view.x, state.view.y, MS_GRID_WIDTH, MS_GRID_HEIGHT, 8),
    state: 0,
    source: "view",
  };
}

export function hasLynxBoots(state: EngineState, tileId: number): boolean {
  const chipInventory = projectLynxActorInventoryOwner(MS_TILE.Chip, state.inventory);
  const inventorySlot = lynxInventorySlot(tileId);
  const inventoryIndex = lynxInventoryIndex(tileId);
  return inventorySlot === "boots" && inventoryIndex !== null ? actorInventoryHasBoot(chipInventory, inventoryIndex) : false;
}

export function lynxChipMovementSpeed(state: EngineState, floorId: number, moveKind: LynxMoveKind = "planar"): number {
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

export function canLynxChipEnterCell(state: EngineState, pos: number, dir: number): boolean {
  return lynxChipTargetCellAllowsEntry(probeLynxChipTargetCellForState(state, pos, dir));
}

export function canLynxChipPushIntoClaimedCell(state: EngineState, pos: number, dir: number): boolean {
  return lynxChipTargetCellAllowsPush(probeLynxChipTargetCellForState(state, pos, dir, true));
}

export function isLynxHeldOpenTrapBlock(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
): boolean {
  return (
    actor.id === MS_TILE.Block &&
    isLynxTrapHeldOpen(
      state,
      level,
      actors,
      lynxPortableToolRuntime(state).portableItems,
      actor.pos,
      actor.z ?? activeLynxLayerZ(state),
    )
  );
}

export function probeLynxChipMoveDirection(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  dir: number,
) {
  return probeLynxChipMoveDirectionWithContext(
    {
      state,
      chipPos,
      canExit: (probeDir) =>
        canLynxExitTile(state, topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), MS_TILE.Chip, probeDir, false),
      queryTargetOccupancy: (targetPos) => queryLynxOccupancyOnLayer(state, actors, targetPos),
      probeTargetCell: (targetPos, probeDir, claimedCell) =>
        probeLynxChipTargetCellForState(state, targetPos, probeDir, claimedCell),
      interactionOutcome: (target) => lynxActorInteractionOutcome(MS_TILE.Chip, target),
      canPushBlock: (block, probeDir) =>
        !block.hidden &&
        block.moving <= 0 &&
        (!block.deferPush || lynxChipRuntime(state).chipTeleported) &&
        canLynxRuntimeActorStartMovement(
          state,
          actors,
          block,
          probeDir,
          isLynxHeldOpenTrapBlock(state, level, actors, block),
        ),
    },
    dir,
  );
}

export function markPendingLynxChipPush(
  state: EngineState,
  level: LynxLevel,
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
        const horizontalProbe = probeLynxChipMoveDirection(state, level, actors, chipPos, horizontalDir);
        const verticalDir = inputCode & (1 | 4);
        const verticalProbe =
          verticalDir !== 0
            ? probeLynxChipMoveDirection(state, level, actors, chipPos, verticalDir)
            : { canMove: false, pushBlockPos: null };
        const horizontalBlock =
          horizontalProbe.pushBlockPos !== null
            ? findLynxBlockActor(actors, horizontalProbe.pushBlockPos, activeLynxLayerZ(state))
            : null;
        if ((!horizontalProbe.canMove || horizontalBlock?.dormant) && horizontalProbe.pushBlockPos !== null) {
          queuePendingLynxBlockPush(state, level, actors, horizontalProbe.pushBlockPos, horizontalDir);
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
    const sameProbe = probeLynxChipMoveDirection(state, level, actors, chipPos, sameDir);
    const otherProbe = probeLynxChipMoveDirection(state, level, actors, chipPos, otherDir);
    if (sameProbe.canMove && otherProbe.pushBlockPos !== null) {
      queuePendingLynxBlockPush(state, level, actors, otherProbe.pushBlockPos, otherDir);
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

export function queuePendingLynxBlockPush(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  targetPos: number,
  dir: number,
): void {
  const block = findLynxBlockActor(actors, targetPos, activeLynxLayerZ(state));
  if (!block || block.hidden || block.moving > 0 || (block.deferPush && !lynxChipRuntime(state).chipTeleported)) {
    return;
  }

  block.dormant = false;
  block.intentDir = dir;
  block.dir = dir;
  block.pushed = !isLynxHeldOpenTrapBlock(state, level, actors, block);
}

export function pendingLynxChipPushInputCode(
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

  if (lynxChipRuntime(state).chipTeleported) {
    return chipDir;
  }

  return queuedChipInputCode || queuedReplayInputCode || currentInputCode;
}

export function previewLynxChipPushRequest(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  inputCode: number,
): void {
  if (!isDirectionalInput(inputCode) || isDiagonalInput(inputCode)) {
    return;
  }

  const probe = probeLynxChipMoveDirection(state, level, actors, chipPos, inputCode);
  if (probe.pushBlockPos !== null) {
    queuePendingLynxBlockPush(state, level, actors, probe.pushBlockPos, inputCode);
  }
}

export function shouldPreviewLynxForcedSlidePush(
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

export function resolveLynxButtonEffects(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], pos: number, tileId: number): number {
  return applyLynxTileActivationEffect(
    {
      queueTankReversals: () => {
        queueLynxTankReversals(state, actors);
      },
      toggleWalls: () => {
        lynxRuntimeState(state).toggleWallsPending = !lynxRuntimeState(state).toggleWallsPending;
      },
      activateCloner: (buttonPos) => activateLynxCloner(state, level, actors, buttonPos),
      buttonPushedSound: 1 << LYNX_SOUND.ButtonPushed,
    },
    pos,
    tileId,
  );
}

export function resolveLynxChipInputForCurrentState(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  inputCode: number,
): number {
  return resolveLynxChipInputDirection(chipDir, inputCode, {
    probeMove: (dir) => {
      const probe = probeLynxChipMoveDirection(state, level, actors, chipPos, dir);
      if (probe.pushBlockPos !== null) {
        queuePendingLynxBlockPush(state, level, actors, probe.pushBlockPos, dir);
      }
      return probe;
    },
    isDormantBlockAt: (pos) => {
      const block = findLynxBlockActor(actors, pos, activeLynxLayerZ(state));
      return !!block && !block.hidden && block.dormant;
    },
  });
}

export function canLynxChipEnterAfterPushingBlock(
  state: EngineState,
  targetPos: number,
  dir: number,
  targetEntryProbe: ReturnType<typeof probeLynxChipTargetCellForState>,
): boolean {
  if (lynxChipTargetCellStopsOnPush(targetEntryProbe)) {
    revealBlockedLynxChipEnterTile(state, targetPos);
    return false;
  }

  if (revealBlockedLynxChipEnterTile(state, targetPos)) {
    return false;
  }

  return lynxChipTargetCellAllowsEntry(probeLynxChipTargetCellForState(state, targetPos, dir));
}

export function revealBlockedLynxChipEnterTile(state: EngineState, targetPos: number): boolean {
  if (!applyLynxBlockedChipEnterEffect(state, targetPos)) {
    return false;
  }
  state.map.hash = mapHash(state.map.cells);
  return true;
}

export function applyCompletedLynxChipMove(
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
  const completed = applyCompletedLynxChipMoveWithContext(
    createLynxCompletedChipMoveContext(state, level, actors),
    chipPos,
    chipDir,
    chipMoveKind,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  );
  if (chipMoveKind === "air" && isLynxIce(topTileIdOr(state.map.cells, completed.chipPos, MS_TILE.Empty))) {
    lynxChipRuntime(state).chipIgnoreIceFromAir = true;
  }
  return completed;
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

export const LYNX_ONE_SHOT_MASK = (1 << 18) - 1;
export const LYNX_FLOOR_SOUND_MASK =
  (1 << LYNX_SOUND.SkatingForward) |
  (1 << LYNX_SOUND.SkatingTurn) |
  (1 << LYNX_SOUND.Sliding) |
  (1 << LYNX_SOUND.SlideWalking) |
  (1 << LYNX_SOUND.IceWalking) |
  (1 << LYNX_SOUND.WaterWalking) |
  (1 << LYNX_SOUND.FireWalking);

export function resetLynxFloorSounds(state: EngineState): void {
  state.soundEffects &= ~LYNX_FLOOR_SOUND_MASK;
}

export function toggleLynxWalls(state: EngineState): void {
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

export function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
}

export function isLynxSlide(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "slide";
}

export function getLynxSlideDirection(state: EngineState, floorId: number, advance: boolean): number {
  const fixedDir = lynxFixedSlideDirection(floorId);
  if (fixedDir !== 0) {
    return fixedDir;
  }
  if (floorId !== MS_TILE.Slide_Random) {
    return 0;
  }
  const chipRuntime = lynxChipRuntime(state);
  if (advance) {
    chipRuntime.lastRandomSlideDir = right(chipRuntime.lastRandomSlideDir || 1);
  }
  return chipRuntime.lastRandomSlideDir || 1;
}

export function applyLynxIceWallTurn(dir: number, floorId: number): number {
  return lynxIceWallTurn(floorId, dir);
}

export function getLynxChipForcedMove(
  context: LynxTickContext,
  floorId: number,
  chipDir: number,
): {
  dir: number;
  discardInput: boolean;
  moveKind?: "air" | "elevator";
} {
  const chipRuntime = lynxChipRuntime(context.state);
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
          canLynxRuntimeActorStartMovement(context.state, context.actors, blockingActor as LynxRuntimeActor, pushDir),
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
  if (chipRuntime.chipTeleported) {
    chipRuntime.chipTeleported = false;
    return { dir: chipDir, discardInput: true };
  }
  if (isLynxSlide(floorId)) {
    return hasLynxBoots(context.state, MS_TILE.Boots_Slide)
      ? { dir: 0, discardInput: false }
      : { dir: getLynxSlideDirection(context.state, floorId, true), discardInput: !chipRuntime.chipSlideToken };
  }
  if (isLynxIce(floorId)) {
    if (chipRuntime.chipIgnoreIceFromAir) {
      return { dir: 0, discardInput: false };
    }
    return hasLynxBoots(context.state, MS_TILE.Boots_Ice)
      ? { dir: 0, discardInput: false }
      : { dir: chipDir, discardInput: true };
  }
  return { dir: 0, discardInput: false };
}

export function forcedLynxActorDirection(state: EngineState, actor: LynxRuntimeActor, floorId: number, currentTime: number): number {
  if (lynxActorTreatsForcedFloorAsNormal(state, actor, floorId)) {
    return 0;
  }

  return forcedLynxActorDirectionByStrategy(
    lynxActorMovementStrategyId(actor.id),
    (forcedFloorId) => getLynxSlideDirection(state, forcedFloorId, true),
    actor,
    floorId,
    currentTime,
  );
}

export function updateLynxChipStartMovementState(state: EngineState, floorId: number, chosenInputCode: number): void {
  const chipRuntime = lynxChipRuntime(state);
  const updated = applyLynxChipStartMoveStateByStrategy(
    lynxActorMovementStrategyId(MS_TILE.Chip),
    {
      hasSlideBoot: () => hasLynxBoots(state, MS_TILE.Boots_Slide),
      hasIceBoot: () => hasLynxBoots(state, MS_TILE.Boots_Ice),
      applyIceWallTurn: applyLynxIceWallTurn,
    },
    floorId,
    chosenInputCode,
    chipRuntime.chipIgnoreIceFromAir ?? false,
    chipRuntime.chipSlideToken ?? false,
  );
  chipRuntime.chipIgnoreIceFromAir = updated.chipIgnoreIceFromAir;
  chipRuntime.chipSlideToken = updated.chipSlideToken;
}

export function turnLynxChipAroundOnBlockedIce(state: EngineState, floorId: number, attemptedDir: number): number {
  return blockedLynxChipMoveDirectionByStrategy(
    lynxActorMovementStrategyId(MS_TILE.Chip),
    {
      hasSlideBoot: () => hasLynxBoots(state, MS_TILE.Boots_Slide),
      hasIceBoot: () => hasLynxBoots(state, MS_TILE.Boots_Ice),
      applyIceWallTurn: applyLynxIceWallTurn,
    },
    floorId,
    attemptedDir,
  );
}

export function updateLynxViewFromMovement(
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

export function chipCanOccupyLynxTeleport(
  state: EngineState,
  actors: LynxRuntimeActor[],
  pos: number,
): boolean {
  const landing = queryLynxOccupancyOnLayer(state, actors, pos);
  return !landing.claimed && landing.kind === OCCUPANCY_TARGET_KIND.empty;
}

export function claimedLynxChipTeleportExitIsValid(
  state: EngineState,
  actors: LynxRuntimeActor[],
  exitPos: number,
  dir: number,
): boolean {
  const target = queryLynxOccupancyOnLayer(state, actors, exitPos);
  const runtimeActor = target.kind === OCCUPANCY_TARGET_KIND.runtimeActor ? target.runtimeActor ?? null : null;
  const block =
    target.claimed && runtimeActor?.id === MS_TILE.Block
      ? runtimeActor
      : null;
  if (!block) {
    return (
      runtimeActor === null ||
      (canLynxExitTile(state, target.tileId, runtimeActor.id, dir, false) && canLynxChipEnterCell(state, exitPos, dir))
    );
  }
  if (block.hidden || block.moving > 0 || (block.deferPush && !lynxChipRuntime(state).chipTeleported)) {
    return false;
  }
  return canLynxRuntimeActorStartMovement(state, actors, block, dir) && canLynxChipEnterCell(state, exitPos, dir);
}

export function createLynxTeleportContext(state: EngineState, actors: LynxRuntimeActor[]): LynxTeleportContext {
  return {
    state,
    actors,
    activeLayerZ: () => activeLynxLayerZ(state),
    withLayer: (z, run) => withLynxLayer(state, z, run),
    chipActsWallForMobs: (pos, z) => lynxChipActsWallForMobs(state, pos, z),
    chipTeleportLandingIsClear: (teleportPos) => chipCanOccupyLynxTeleport(state, actors, teleportPos),
    canChipEnter: (pos, dir) => canLynxChipEnterCell(state, pos, dir),
    claimedChipTeleportExitIsValid: (exitPos, dir) => claimedLynxChipTeleportExitIsValid(state, actors, exitPos, dir),
    canActorEnter: (actor, tileId, dir) => canLynxCreatureEnter(state, actor as LynxRuntimeActor, tileId, dir),
    effectiveTargetTileId: (tileId) => effectiveLynxTargetTileId(state, tileId),
    markChipTeleported: () => {
      lynxChipRuntime(state).chipTeleported = true;
      state.soundEffects |= 1 << LYNX_SOUND.Teleporting;
    },
    settleChipTeleportDrop: (originPos, originZ) =>
      settleLynxPrimedToolDrop(
        state,
        lynxPortableToolRuntime(state),
        state.inventory,
        originPos,
        originZ,
        (layerZ, run) => withLynxLayer(state, layerZ, run),
      ),
  };
}

export function resolveLynxTeleports(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
): number {
  return resolveLynxTeleportsWithContext(createLynxTeleportContext(state, actors), chipPos, chipDir, chipMoving);
}

export function resolveLynxPostChipMovement(
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
  return resolveLynxPostChipMovementWithContext(
    createLynxPostMoveContext(state, level, actors),
    chipPos,
    chipDir,
    chipMoving,
    chipMoveKind,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  );
}

export function finalizeLynxTickBookkeeping(
  state: EngineState,
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  chipMoveKind: LynxMoveKind,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
): Pick<LynxEndGameState, "endGameTicksElapsed" | "endGameResult"> {
  return finalizeLynxTickBookkeepingWithContext(
    createLynxTickBookkeepingContext(state),
    chipPos,
    chipDir,
    chipMoving,
    chipMoveKind,
    endGameTicksElapsed,
    endGameResult,
  );
}

export function canLynxRuntimeActorStartMovement(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  dir: number,
  releasing = false,
  clearAnimations = false,
  inventoryOwnerOverride: ActorLocalInventoryOwner | null = null,
): boolean {
  const targetStep = advanceToCell(state.map.cells, actor.pos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (targetStep) {
    const target = queryLynxOccupancyOnLayer(state, actors, targetStep.pos, actor.z ?? activeLynxLayerZ(state));
    const interaction = lynxActorInteractionOutcome(actor.id, lynxInteractionTargetFromOccupancy(target, dir));
    if (interaction.denyMove) {
      return false;
    }
    if (
      target.kind !== OCCUPANCY_TARGET_KIND.empty &&
      target.kind !== OCCUPANCY_TARGET_KIND.chip &&
      (interaction.removeMovingActor || interaction.removeTargetActor || interaction.consumeTarget)
    ) {
      return true;
    }
  }

  if (inventoryOwnerOverride) {
    return canLynxActorStartMovementWithContext(
      {
        ...createLynxActorMovementContext(state, actors),
        canActorEnter: (_actor, tileId, probeDir) =>
          canLynxCreatureEnterWithInventoryOwner(state, actor.id, tileId, probeDir, inventoryOwnerOverride),
      },
      actor,
      dir,
      releasing,
      clearAnimations,
    );
  }

  return canLynxActorStartMovementWithContext(
    createLynxActorMovementContext(state, actors),
    actor,
    dir,
    releasing,
    clearAnimations,
  );
}

export function createLynxCreatureControllerContext(
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
    canStart: (actor, dir) => canLynxRuntimeActorStartMovement(state, actors, actor as LynxRuntimeActor, dir, false, true),
    chooseBlobDirection: () => {
      const clockwise = [1, 8, 4, 2];
      return clockwise[advanceLynxMainRandom4(state)] ?? 0;
    },
    chooseWalkerRandomDirection: (dir) => [dir, right(dir), back(dir), left(dir)][advanceLynxPrng(state) & 3] ?? dir,
    slideDirection: (floorId) => getLynxSlideDirection(state, floorId, true),
    treatsForcedFloorAsNormal: (actor, floorId) => lynxActorTreatsForcedFloorAsNormal(state, actor as LynxRuntimeActor, floorId),
  };
}

export function chooseLynxCreatureMoveForTick(
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

export function startLynxRuntimeActorMovement(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  dir: number,
  releasing = false,
): MovementAttemptResult {
  const preMoveCollision = resolveLynxRuntimeActorPreMoveCollision(state, actors, actor, dir);
  if (preMoveCollision) {
    return preMoveCollision;
  }

  const floorBeforeMove = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
  const result = startLynxActorMovementWithContext(createLynxActorMovementContext(state, actors), actor, dir, releasing);
  if (!movementDidSucceed(result)) {
    revealBlockedLynxBallisticEnter(state, actor, dir);
    maybeRevertLynxPortableBackedActorOnBlockedMove(state, actors, actor, floorBeforeMove, releasing);
  }
  return result;
}

export function finishLynxRuntimeActorMovement(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  fallingCollision:
    | {
        chipPos: number;
        chipZ: number;
        recordCollision(actor: LynxRuntimeActor): void;
      }
    | undefined = undefined,
): ArrivalResult {
  return finishLynxActorMovementWithContext(
    createLynxActorMovementContext(
      state,
      actors,
      (pos, tileId) => resolveLynxButtonEffects(state, level, actors, pos, tileId),
      fallingCollision,
    ),
    actor,
  );
}

export function advanceLynxCreature(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  currentTime: number,
  chipPos = -1,
  chipZ = activeLynxLayerZ(state),
  pendingFallingCollisionActorSerials: number[] | undefined = undefined,
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
        if (
          !hasVerticalSupport(
            resolveLynxRuntimeActorSupportBelow(tickContext, lowerCells, actor.id, null, actor.pos, targetZ, actor.z ?? 1),
          )
        ) {
          if (
            !startLynxActorAirMovement(
              state,
              actor,
              { cellsForZ: (z) => lynxCellsForZ(state.map, z) },
              (pos, z) => applyLynxExitedMobSourceFloorEffect(state, pos, z),
            )
          ) {
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
            (pos, z) => applyLynxExitedMobSourceFloorEffect(state, pos, z),
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
        if (moveDir === 0) {
          return;
        }
        if (!movementDidSucceed(startLynxRuntimeActorMovement(state, actors, actor, moveDir, false))) {
          return;
        }
        if (actor.hidden || actor.moving <= 0) {
          return;
        }
      }
    }

    const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
    let speed = actor.id === MS_TILE.Blob ? 1 : 2;
    if (
      (actor.moveKind ?? "planar") === "air" ||
      (actor.moveKind ?? "planar") === "elevator" ||
      ((isLynxSlide(floor) || isLynxIce(floor)) && !lynxActorTreatsForcedFloorAsNormal(state, actor, floor))
    ) {
      speed *= 2;
    }
    actor.moving = Math.max(0, actor.moving - speed);
    actor.frame = Math.trunc(actor.moving / 2);
    if (actor.moving === 0) {
      finishLynxRuntimeActorMovement(
        state,
        level,
        actors,
        actor,
        pendingFallingCollisionActorSerials === undefined
          ? undefined
          : {
              chipPos,
              chipZ,
              recordCollision: (collidedActor) => {
                pendingFallingCollisionActorSerials.push(collidedActor.serial);
              },
            },
      );
      if (actor.id === MS_TILE.Block && isLynxHeldOpenTrapBlock(state, level, actors, actor)) {
        actor.deferPush = true;
        actor.deferPushArmed = false;
      }
    }
  });
}

export function clearFinishedPushedBlocks(state: EngineState, actors: LynxRuntimeActor[]): void {
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

export function clearDeferredLynxBlockPushes(actors: LynxRuntimeActor[]): void {
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

export function findLynxBlockActor(actors: LynxRuntimeActor[], pos: number, z = 1): LynxRuntimeActor | null {
  return findVisibleActorAtPosition(actors, pos, (actor) => actor.id === MS_TILE.Block && (actor.z ?? 1) === z) ?? null;
}

export function findLynxVisibleActorAt(actors: LynxRuntimeActor[], pos: number, z = 1): LynxRuntimeActor | null {
  return findVisibleActorAtPosition(actors, pos, (actor) => (actor.z ?? 1) === z) ?? null;
}

export function detectLynxChipCollision(actors: LynxRuntimeActor[], chipPos: number, chipZ: number): {
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

export function findPendingLynxFallingCollisionActor(
  actors: LynxRuntimeActor[],
  actorSerials: number[],
  chipPos: number,
  chipZ: number,
): LynxRuntimeActor | null {
  for (const actorSerial of actorSerials) {
    const actor = actors.find((entry) => entry.serial === actorSerial && !entry.hidden) ?? null;
    if (!actor) {
      continue;
    }
    if (actor.pos === chipPos && (actor.z ?? 1) === chipZ) {
      return actor;
    }
  }

  return null;
}

export function findClaimedLynxBlockOnActiveLayer(state: EngineState, actors: LynxRuntimeActor[], pos: number): LynxRuntimeActor | null {
  const target = queryLynxOccupancyOnLayer(state, actors, pos);
  return target.claimed && target.kind === OCCUPANCY_TARGET_KIND.runtimeActor && target.runtimeActor?.id === MS_TILE.Block
    ? target.runtimeActor
    : null;
}

export function resolveLynxChipCollision(
  state: EngineState,
  actors: LynxRuntimeActor[],
  pendingFallingCollisionActorSerials: number[],
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

  const pendingFallingActor = findPendingLynxFallingCollisionActor(
    actors,
    pendingFallingCollisionActorSerials,
    chipPos,
    activeLynxLayerZ(state),
  );
  const collision = pendingFallingActor
    ? { result: collided(), actor: pendingFallingActor }
    : detectLynxChipCollision(actors, chipPos, activeLynxLayerZ(state));
  if (!collisionOccurred(collision.result)) {
    return {
      chipPos,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  const collisionOutcome = lynxActorInteractionOutcome(MS_TILE.Chip, {
    ...lynxInteractionTargetFromOccupancy(
      {
        kind: OCCUPANCY_TARGET_KIND.runtimeActor,
        pos: chipPos,
        z: activeLynxLayerZ(state),
        tileId: collision.actor?.id ?? MS_TILE.Empty,
        claimed: false,
        runtimeActor: collision.actor ?? undefined,
      },
      chipDir,
    ),
  });
  if (!collisionOutcome.chipFails) {
    return {
      chipPos,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  const preserveCollidedActor =
    collisionOutcome.preserveTarget ||
    !collisionOutcome.removeTargetActor ||
    isLynxVerticalMoveKind(chipMoveKind) ||
    isLynxVerticalMoveKind(collision.actor?.moveKind);
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

export function allocateLynxActorSlot(actors: LynxRuntimeActor[], actor: LynxRuntimeActor): LynxRuntimeActor {
  return storeActorInReusableHiddenSlot(actors, actor, (entry) => !entry.animationReserved);
}

export function createLynxClonerSnapshot(sourceActor: LynxRuntimeActor, z: number): LynxRuntimeActor {
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

export function createLynxTrapClonerContext(
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
    buildCloneSnapshot: (sourceActor, z) =>
      createLynxClonerSnapshot(
        {
          ...sourceActor,
          serial: allocateLynxActorSerial(state),
        },
        z,
      ),
    allocateCloneSlot: (snapshot) => allocateLynxActorSlot(actors, snapshot),
    cloneFamilyRuntimeForCloner: (sourceActorSerial, cloneActorSerial) => {
      cloneLynxPortableBackedActorForCloner(state, sourceActorSerial, cloneActorSerial);
    },
    startCreatureMovement: (actor, dir, releasing) => startLynxRuntimeActorMovement(state, actors, actor, dir, releasing),
    advanceCreature: (actor, currentTime) => advanceLynxCreature(state, level, actors, actor, currentTime),
    currentTime: state.timer.currentTime,
  };
}

export function findLynxTrapTarget(level: LynxLevel, buttonPos: number, z = 1): number | null {
  return findLynxTrapTargetInLevel(level, buttonPos, z);
}

export function queueLynxTankReversals(state: EngineState, actors: LynxRuntimeActor[]): void {
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

export function applyPendingLynxTankReversals(actors: LynxRuntimeActor[]): void {
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

export function runLynxInitialHousekeeping(state: EngineState, actors: LynxRuntimeActor[]): void {
  clearFinishedPushedBlocks(state, actors);
  applyPendingLynxTankReversals(actors);
  clearLynxTileOverlays(state);

  const runtime = lynxRuntimeState(state);
  runtime.chipRuntime.trapReleaseCantMoveThisTick = false;
  if (runtime.toggleWallsPending) {
    toggleLynxWalls(state);
    runtime.toggleWallsPending = false;
  }
}

export function tryPushLynxBlock(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  pos: number,
  dir: number,
): boolean {
  const block = findLynxBlockActor(actors, pos, activeLynxLayerZ(state));
  if (!block || block.moving > 0 || (block.deferPush && !lynxChipRuntime(state).chipTeleported)) {
    return false;
  }

  const wasHidden = block.hidden;
  const wasDormant = block.dormant;
  const heldOpenTrapRelease = isLynxHeldOpenTrapBlock(state, level, actors, block);
  block.hidden = false;
  block.dormant = false;
  if (
    !movementDidSucceed(
      startLynxRuntimeActorMovement(state, actors, block, dir, heldOpenTrapRelease),
    )
  ) {
    block.dir = dir;
    block.hidden = wasHidden;
    block.dormant = wasDormant;
    return false;
  }

  block.pushed = !heldOpenTrapRelease;
  advanceLynxCreature(state, level, actors, block, state.timer.currentTime + 1);
  if (block.pushed) {
    state.soundEffects |= 1 << LYNX_SOUND.BlockMoving;
  }
  return true;
}

export function skipsDormantLynxActorAdvance(state: EngineState, actor: LynxRuntimeActor, currentTime: number): boolean {
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

export function activateLynxCloner(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], buttonPos: number): boolean {
  return activateLynxClonerWithContext(createLynxTrapClonerContext(state, level, actors), buttonPos);
}

export function springLynxTrap(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], buttonPos: number): boolean {
  return springLynxTrapWithContext(createLynxTrapClonerContext(state, level, actors), buttonPos);
}

export function advanceLynxChipTrapRelease(
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
  return advanceLynxChipTrapReleaseWithContext(
    createLynxTrapReleaseContext(state, level, actors),
    chipPos,
    chipDir,
    chipMoving,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  );
}

export function springLynxHeldBrownButton(
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
      deferredChipInputCode = resolveLynxChipInputForCurrentState(
        state,
        level,
        actors,
        nextChipPos,
        nextChipDir,
        replayInputCode,
      );
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

export function springLynxSandbagHeldBrownButtons(
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
  runtime.portableTools.portableItems = collectLynxPortableItemsFromLayers(lynxRuntimeLayers(state.map));
  runtime.portableTools.nextPortableItemSerial = runtime.portableTools.portableItems.length + 1;
  projectLynxPortableToolState(runtime.portableTools, state.inventory);
  setLynxRuntimeChipState(state, chipPos, chipSeed.z);
  return state;
}
