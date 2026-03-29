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
  MsAdvanceTickResult,
  MsGameState,
  MsInteractiveSessionState,
  MsInternalState,
  MsRuntimeLayer,
  MsSessionReplayOptions,
} from './engineTypes';
import { MS_DEBUG_SCHEMA_VERSION } from './engineTypes';
import {
  clearMsTileOverlays,
  cloneInternalState,
  cloneInventory,
  cloneRuntimeMapLayers,
  createMsTickContext,
  forEachRuntimeLayer,
  msPortableToolState,
  statusName,
  tryActivateMsBowlingBallThrow,
  updateChipTile,
  updateEngine,
  initializeMsGameState,
} from './engineRuntime';
import {
  canMoveBlockInto,
  chipMoveToGoalPos,
  createClones,
  handleDeferredButtons,
  resolvePendingCloners,
  runCreatureFloorMovements,
  runCreatureMovements,
  runFloorMovement,
  runManualMovement,
  updateCreatureTile,
} from './engineMovement';
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

export interface MsAdvanceTickRuntime {
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

export function createMsAdvanceTickRuntime(
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

export function msAdvanceTickCellsForZ(runtime: MsAdvanceTickRuntime, z = 1): EngineMapCell[] {
  return runtime.layerCellsByZ.get(z) ?? runtime.mapLayers[0]!.cells;
}

export function msAdvanceTickActiveChipCells(runtime: MsAdvanceTickRuntime): EngineMapCell[] {
  return msAdvanceTickCellsForZ(runtime, runtime.internal.chipZ ?? 1);
}

export function flushMsPendingSoundEffects(runtime: MsAdvanceTickRuntime): void {
  if (runtime.internal.pendingSoundEffects === 0) {
    return;
  }
  runtime.soundEffects |= runtime.internal.pendingSoundEffects;
  runtime.internal.pendingSoundEffects = 0;
}

export function finishMsTick(
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

export function recordMsTickPhase(
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

export function recordMsTickPhaseWithInternal(
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

export function msTickPhaseIsPlayable(runtime: MsAdvanceTickRuntime): boolean {
  return runtime.internal.chipStatus === "okay" && !runtime.internal.completed;
}

export function maybeFinishMsTickEarly(
  runtime: MsAdvanceTickRuntime,
  lastMove: EngineState["lastMove"] = runtime.state.engine.lastMove,
): MsAdvanceTickResult | null {
  if (msTickPhaseIsPlayable(runtime)) {
    return null;
  }
  flushMsPendingSoundEffects(runtime);
  return finishMsTick(runtime, lastMove);
}

export function runMsInitialHousekeepingPhase(runtime: MsAdvanceTickRuntime): number {
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
    applyMsPortableToolAction({
      store: msPortableToolState(runtime.internal),
      inventory: runtime.inventory,
      chipPos: runtime.internal.chipPos,
      chipZ: runtime.internal.chipZ ?? 1,
      chipDir: runtime.internal.chipDir,
      tryThrowBowlingBall: (carried, dir) => tryActivateMsBowlingBallThrow(runtime, carried, dir),
    })
  ) {
    runtime.toolActionTriggeredThisTick = true;
  }
  recordMsTickPhase(runtime, TURN_DEBUG_PHASE.postInitialHousekeeping);
  return runtime.internal.currentInput;
}

export function runMsCreatureMovementPhase(runtime: MsAdvanceTickRuntime): void {
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

export function runMsChipFloorPhase(runtime: MsAdvanceTickRuntime): MsChipFloorPhaseState {
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

export function runMsCreatureFloorPhase(runtime: MsAdvanceTickRuntime): void {
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

export function resolveMsChipInputPhase(
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

export function runMsTimerPhase(
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

export function runMsManualMovementPhase(
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

export function runMsCloneReleasePhase(
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

export function advanceMsTick(
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
