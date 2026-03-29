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
  LynxChipRuntimeState,
  LynxPortableToolRuntimeState,
  LynxRuntimeActor,
  LynxRuntimeLayer,
  LynxRuntimeState,
  LynxStatefulActorRuntimeState,
  LynxTickContext,
  LynxVisualRuntimeState,
} from './engineTypes';
import { LYNX_ANIMATION_TILE } from './engineTypes';

export function lynxAnimationTileId(kind: 'water-splash' | 'bomb-explosion' | 'none'): number | null {
  switch (kind) {
    case 'water-splash':
      return LYNX_ANIMATION_TILE.Water_Splash;
    case 'bomb-explosion':
      return LYNX_ANIMATION_TILE.Bomb_Explosion;
    default:
      return null;
  }
}
export function stripCreaturesForInitialHash(cells: EngineMapCell[]): EngineMapCell[] {
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

export function findChipSeed(level: LynxLevel): { pos: number; z: number; dir: number } {
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

export function lynxRuntimeLayers(map: EngineState["map"]): LynxRuntimeLayer[] {
  return map.layers?.map((layer) => ({ z: layer.z, cells: layer.cells })) ?? [{ z: 1, cells: map.cells }];
}

export function lynxCellsForZ(map: EngineState["map"], z = 1): EngineMapCell[] {
  return lynxRuntimeLayers(map).find((layer) => layer.z === z)?.cells ?? lynxRuntimeLayers(map)[0]!.cells;
}

export function applyLynxExitedMobSourceFloorEffect(state: EngineState, pos: number, z: number): void {
  applyLynxMobExitFloorEffect(lynxCellsForZ(state.map, z), pos);
}

export function setLynxActiveLayer(state: EngineState, z = 1): EngineMapCell[] {
  const cells = lynxCellsForZ(state.map, z);
  state.map.cells = cells;
  return cells;
}

export function withLynxLayer<T>(state: EngineState, z: number, run: () => T): T {
  const previousCells = state.map.cells;
  setLynxActiveLayer(state, z);
  try {
    return run();
  } finally {
    state.map.cells = previousCells;
  }
}

export function activeLynxLayerZ(state: EngineState): number {
  return state.map.cells[0]?.position.z ?? state.map.layers?.[0]?.z ?? 1;
}

export function isLynxAir(id: number): boolean {
  return lynxTileForcedFloorKind(id) === "air";
}

export function isLynxElevator(id: number): boolean {
  return lynxTileForcedFloorKind(id) === "elevator";
}

export function lynxLowerRuntimeCells(state: EngineState, z: number | undefined): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  if (currentZ <= 1) {
    return null;
  }
  return lynxCellsForZ(state.map, currentZ - 1);
}

export function lynxUpperRuntimeCells(state: EngineState, z: number | undefined): EngineMapCell[] | null {
  const currentZ = z ?? 1;
  const targetZ = currentZ + 1;
  const layers = lynxRuntimeLayers(state.map);
  return layers.some((layer) => layer.z === targetZ) ? lynxCellsForZ(state.map, targetZ) : null;
}

export function isLynxVerticalMoveKind(moveKind: LynxMoveKind | undefined): boolean {
  return moveKind === "air" || moveKind === "elevator";
}

export function parseLynxActors(level: LynxLevel): { actors: LynxRuntimeActor[]; nextActorSerial: number } {
  const scanned: LynxRuntimeActor[] = [];
  let nextActorSerial = 1;
  const orderedCreaturePositions = new Set(
    collectLevelCreaturePositions(level).map(({ pos, z }) => `${z}:${pos}`),
  );

  for (const layer of levelLayers(level)) {
    for (const cell of layer.cells) {
      const tile = cell.top;
      if (tile.id === MS_TILE.Block_Static) {
        scanned.push({
          serial: nextActorSerial,
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
        nextActorSerial += 1;
        continue;
      }

      if (!isMsCreature(tile.id)) {
        continue;
      }
      scanned.push({
        serial: nextActorSerial,
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
      nextActorSerial += 1;
    }
  }

  const chipIndex = scanned.findIndex((actor) => actor.id === MS_TILE.Chip);
  if (chipIndex > 0) {
    const chip = scanned[chipIndex]!;
    scanned[chipIndex] = scanned[0]!;
    scanned[0] = chip;
  }

  return {
    actors: scanned.filter((actor) => actor.id !== MS_TILE.Chip),
    nextActorSerial,
  };
}

export function normalizeRandomSeed(seed: number | undefined): number {
  return (seed ?? 362436069) & 0x7fffffff;
}

export function scheduledInputForTick(commands: GameCommand[], tick: number): GameCommand | null {
  return commands.find((command) => command.tick === tick) ?? null;
}

export function lynxRuntimeState(state: EngineState): LynxRuntimeState {
  const runtimeState = state as EngineState & { lynxRuntimeState?: LynxRuntimeState };
  if (!runtimeState.lynxRuntimeState) {
    runtimeState.lynxRuntimeState = {
      toggleWallsPending: false,
      visuals: {
        animations: [],
        tileOverlays: [],
      },
      chipRuntime: {
        chipTeleported: false,
        chipSlideToken: false,
        chipIgnoreIceFromAir: false,
        couldntMove: false,
        trapReleaseCantMoveThisTick: false,
        lastRandomSlideDir: directionCode(state.replay.initialRandomSlideDirection),
      },
      portableTools: {
        portableItems: [],
        nextPortableItemSerial: 1,
        primedToolDrop: null,
      },
      statefulActors: createStatefulActorRuntimeStore(),
      nextActorSerial: 1,
      chipPos: -1,
      chipZ: 1,
    };
  }
  return runtimeState.lynxRuntimeState;
}

export function lynxVisualRuntime(state: EngineState): LynxVisualRuntimeState {
  return lynxRuntimeState(state).visuals;
}

export function lynxChipRuntime(state: EngineState): LynxChipRuntimeState {
  return lynxRuntimeState(state).chipRuntime;
}

export function lynxPortableToolRuntime(state: EngineState): LynxPortableToolRuntimeState {
  return lynxRuntimeState(state).portableTools;
}
