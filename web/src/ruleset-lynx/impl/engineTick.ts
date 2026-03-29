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

import type { LynxAdvanceTickRuntime, LynxInteractiveSessionState } from './engineTypes';
import {
  activeLynxLayerZ,
  applyLynxExitedMobSourceFloorEffect,
  findChipSeed,
  lynxCellsForZ,
  lynxChipRuntime,
  lynxPortableToolRuntime,
  lynxRuntimeState,
  parseLynxActors,
  scheduledInputForTick,
  setLynxActiveLayer,
  withLynxLayer,
} from './engineRuntime';
import type { LynxTickContext } from './engineTypes';
import {
  activateMappedLynxBowlingBallsOnForceFloors,
  addLynxCantMove,
  addLynxTileOverlay,
  advanceLynxAnimations,
  advanceLynxCreature,
  advanceLynxEndGameAnimationFrame,
  canLynxChipEnterAfterPushingBlock,
  canLynxExitTile,
  chooseLynxCreatureMoveForTick,
  clearLynxCouldntMove,
  createLynxTickContext,
  failLynxChip,
  findPressedLynxPermanentHiddenWallPos,
  finalizeLynxTickBookkeeping,
  getLynxChipForcedMove,
  initializeLynxEngineState,
  isLynxSlide,
  LYNX_ONE_SHOT_MASK,
  markPendingLynxChipPush,
  pendingLynxChipPushInputCode,
  previewLynxChipPushRequest,
  probeLynxChipTargetCellForState,
  resetLynxFloorSounds,
  resolveLynxChipCollision,
  resolveLynxChipInputForCurrentState,
  resolveLynxPostChipMovement,
  revealBlockedLynxChipEnterTile,
  runLynxInitialHousekeeping,
  seedLynxPortableBackedBowlingBallActors,
  shouldPreviewLynxForcedSlidePush,
  skipsDormantLynxActorAdvance,
  springLynxHeldBrownButton,
  springLynxSandbagHeldBrownButtons,
  tryActivateLynxBowlingBallThrow,
  tryPushLynxBlock,
  turnLynxChipAroundOnBlockedIce,
  updateLynxChipStartMovementState,
  setLynxRuntimeChipState,
} from './engineMovement';
import { queryLynxOccupancyOnLayer } from './engineActorRuntime';
export function createLynxInteractiveToken(
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
  const parsedActors = parseLynxActors(level);
  const state = initializeLynxEngineState(request, level, replay);
  const runtime = lynxRuntimeState(state);
  runtime.nextActorSerial = parsedActors.nextActorSerial;
  for (const actor of parsedActors.actors) {
    seedLynxStatefulActorRuntime(
      runtime.statefulActors as unknown as StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
      actor.serial,
      actor.id,
    );
  }
  activateMappedLynxBowlingBallsOnForceFloors(state, parsedActors.actors);
  seedLynxPortableBackedBowlingBallActors(state, parsedActors.actors);
  return {
    level,
    state,
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
    actors: parsedActors.actors,
    endGameTicksElapsed: null,
    endGameResult: null,
    endGameAnimationTileId: null,
    endGameAnimationFrame: null,
  };
}

export function recordLynxReplayMove(
  recordedMoves: ReplayRecordedMove[],
  currentTime: number,
  replayCursor: number,
  moveCode: number,
): ReplayRecordedMove[] {
  return recordManualMove(recordedMoves, currentTime, replayCursor, moveCode);
}

export function createLynxAdvanceTickRuntime(
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
    justSpawnedActorSerials: new Set(),
    pendingFallingCollisionActorSerials: [],
    latchedChipMoveSelection: null,
    recordedReplayInputCode: 0,
    nextTick: state.timer.currentTime + 1,
  };

  reconcileLynxPortableToolProjection(lynxPortableToolRuntime(state), state.inventory);
  setLynxRuntimeChipState(state, runtime.chipPos, runtime.chipZ);
  return runtime;
}

export function currentLynxTickContext(runtime: LynxAdvanceTickRuntime): LynxTickContext {
  return createLynxTickContext(runtime.state, runtime.actors, runtime.chipPos, runtime.chipZ);
}

export function recordLynxTickPhase(
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

export function currentLynxHeldButtonChipState(runtime: LynxAdvanceTickRuntime): LynxChipTurnState {
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

export function applyLynxHeldButtonResolutionToRuntime(
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

export function buildLynxChipMoveSelection(runtime: LynxAdvanceTickRuntime): LynxChipMoveSelection {
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
        runtime.level,
        runtime.actors,
        runtime.chipPos,
        runtime.chipDir,
        inputCode,
      ),
  });
}

export function shouldSuppressLynxChipMoveSelectionForRuntime(runtime: LynxAdvanceTickRuntime): boolean {
  return shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(
    runtime.chipMoving,
    runtime.chipArrivedOnHeldTrapThisTick,
    lynxTileHasTag(topTileIdOr(runtime.state.map.cells, runtime.chipPos, MS_TILE.Empty), "trap"),
  );
}

export function resolveLynxChipMoveSelectionForRuntime(runtime: LynxAdvanceTickRuntime): LynxChipMoveSelection {
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

export function finishLynxInteractiveTick(runtime: LynxAdvanceTickRuntime): LynxInteractiveSessionState {
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

export function runLynxInitialHousekeepingPhase(runtime: LynxAdvanceTickRuntime): void {
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
    applyLynxPortableToolAction({
      store: lynxPortableToolRuntime(runtime.state),
      inventory: runtime.state.inventory,
      chipPos: runtime.chipPos,
      chipZ: runtime.chipZ,
      chipDir: runtime.chipDir,
      tryThrowBowlingBall: (carried, dir) => tryActivateLynxBowlingBallThrow(runtime, carried, dir),
    })
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

export function runLynxCreatureIntentPhase(runtime: LynxAdvanceTickRuntime): void {
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
    runtime.level,
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
    previewLynxChipPushRequest(runtime.state, runtime.level, runtime.actors, runtime.chipPos, previewInputCode);
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

export function runLynxCreatureMovementPhase(runtime: LynxAdvanceTickRuntime): void {
  for (let index = runtime.actors.length - 1; index >= 0; index -= 1) {
    const actor = runtime.actors[index]!;
    const skipAdvanceThisTick = runtime.justSpawnedActorSerials.has(actor.serial);
    if (!skipAdvanceThisTick && !skipsDormantLynxActorAdvance(runtime.state, actor, runtime.nextTick)) {
      advanceLynxCreature(
        runtime.state,
        runtime.level,
        runtime.actors,
        actor,
        runtime.nextTick,
        runtime.chipPos,
        runtime.chipZ,
        runtime.pendingFallingCollisionActorSerials,
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

  runtime.justSpawnedActorSerials.clear();

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
    runtime.pendingFallingCollisionActorSerials,
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

export function runLynxChipMovementPhase(runtime: LynxAdvanceTickRuntime): void {
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
    if (!lynxChipRuntime(runtime.state).trapReleaseCantMoveThisTick) {
      clearLynxCouldntMove(runtime.state);
    }
    resetLynxFloorSounds(runtime.state);
  }

  if (runtime.chipMoving === 0 && chipMoveSelection.startAirMove) {
    settleLynxPrimedToolDrop(
      runtime.state,
      lynxPortableToolRuntime(runtime.state),
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
      (pos, z) => applyLynxExitedMobSourceFloorEffect(runtime.state, pos, z),
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
      lynxPortableToolRuntime(runtime.state),
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
      (pos, z) => applyLynxExitedMobSourceFloorEffect(runtime.state, pos, z),
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
  const targetOccupancy =
    target === undefined ? null : queryLynxOccupancyOnLayer(runtime.state, runtime.actors, targetPos, runtime.chipZ);
  const targetBlock =
    targetOccupancy?.claimed &&
    targetOccupancy.kind === OCCUPANCY_TARGET_KIND.runtimeActor &&
    targetOccupancy.runtimeActor?.id === MS_TILE.Block
      ? targetOccupancy.runtimeActor
      : null;
  const targetEntryProbe =
    targetBlock !== null
      ? probeLynxChipTargetCellForState(runtime.state, targetPos, startInputCode, true)
      : probeLynxChipTargetCellForState(runtime.state, targetPos, startInputCode);
  const targetInteraction =
    targetBlock === null && targetOccupancy !== null
      ? lynxActorInteractionOutcome(MS_TILE.Chip, lynxInteractionTargetFromOccupancy(targetOccupancy, startInputCode))
      : null;
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
      : revealBlockedLynxChipEnterTile(runtime.state, targetPos)
        ? false
        : lynxChipTargetCellAllowsEntry(targetEntryProbe) && !(targetInteraction?.denyMove ?? false));
  if (targetBlock && (pushedBlock || !canEnterTarget)) {
    runtime.chipPushing = true;
  }
  if (canEnterTarget) {
    clearLynxCouldntMove(runtime.state);
    settleLynxPrimedToolDrop(
      runtime.state,
      lynxPortableToolRuntime(runtime.state),
      runtime.state.inventory,
      runtime.chipPos,
      runtime.chipZ,
      (layerZ, run) => withLynxLayer(runtime.state, layerZ, run),
    );
    applyLynxExitedMobSourceFloorEffect(runtime.state, runtime.chipPos, runtime.chipZ);
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

export function runLynxPostMoveResolutionPhase(runtime: LynxAdvanceTickRuntime): void {
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

export function runLynxFinalizePhase(runtime: LynxAdvanceTickRuntime): void {
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

export function advanceLynxInteractiveTick(
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

export function replayBestTimeTicks(replay: ReplaySolutionPayload): number | undefined {
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

export function runLynxTrace(
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

export function runLynxReplayTraceDebugInternal(
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
