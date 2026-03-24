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
import { TURN_DEBUG_PHASE, TURN_PHASE, recordTurnDebugPhase, runTurnPhaseHandlers } from "@game-core/api/turnPhases";
import { advanceTimer, createInitialEngineTimer, syncTimerSecondsPlayed } from "@game-core/impl/timer";
import { mapHash } from "@game-core/impl/hash";
import { createReplayPlan, createRuntimeCommand, plannedReplayInput, recordManualMove, runtimeCommandName } from "@game-core/api/playback";
import { getGameInputNameFromCode } from "@game-core/api/command";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { createGameDebugTrace, createGameTrace } from "@game-core/impl/trace";
import { projectLynxDebugPhaseSnapshot } from "@ruleset-lynx/impl/debugProjection";
import {
  lynxActorHasTag,
  lynxArrivalAnimationKind,
  lynxBlockMovementMask,
  lynxButtonAction,
  lynxChipMoveSoundAction,
  lynxChipEnterAction,
  lynxChipMovementMask,
  lynxCreatureArrivalAction,
  lynxCreatureFloorAction,
  lynxCreatureMovementMask,
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
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { collectLevelConnections, collectLevelCreaturePositions, levelLayers } from "@ruleset-ms/api/level";
import type { GameRuntimeCommand } from "@game-core/api/types";
import type { SolutionMove } from "@content/api/solution-file";

const LYNX_DEBUG_SCHEMA_VERSION = 2;
const LYNX_REPLAY_MOVE_TICK_MASK = 0x7fffff;
const HIDDEN_WALL_REVEAL_TTL = MS_TICKS_PER_SECOND / 2;
type LynxMoveKind = "planar" | "air" | "elevator";

export interface LynxInteractiveSessionState {
  level: LynxLevel;
  state: EngineState;
  lastInput: GameRuntimeCommand;
  recordedMoves: SolutionMove[];
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

type LynxEndGameResult = "completed" | "failed";

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
  chipTeleported: boolean;
  chipSlideToken: boolean;
  chipIgnoreIceFromAir?: boolean;
  couldntMove: boolean;
  trapReleaseCantMoveThisTick: boolean;
  lastRandomSlideDir: number;
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

function isLynxSupportingWallTile(id: number): boolean {
  switch (id) {
    case MS_TILE.Wall:
    case MS_TILE.HiddenWall_Perm:
    case MS_TILE.HiddenWall_Temp:
    case MS_TILE.BlueWall_Real:
    case MS_TILE.SwitchWall_Closed:
      return true;
    default:
      return false;
  }
}

function resolveLynxChipSupportBelow(
  state: EngineState,
  actors: LynxRuntimeActor[],
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
): boolean {
  if (!lowerCells) {
    return false;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return false;
  }
  const actorBelow = findLynxVisibleActorAt(actors, pos, z);
  if (actorBelow) {
    const supported = actorBelow.id === MS_TILE.Block;
    if (supported) {
      addLynxTileOverlay(state, currentZ, pos, "support");
    }
    return supported;
  }

  const topId = cell.top.id;
  const bottomId = cell.bottom.id;

  if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  if (isLynxSupportingWallTile(topId)) {
    if (topId === MS_TILE.BlueWall_Real) {
      replaceTopTile(lowerCells, pos, { ...cell.top, id: MS_TILE.Wall });
    }
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.BlueWall_Fake) {
    promoteBottomTile(lowerCells, pos, MS_TILE.Empty);
    return false;
  }

  if (lynxTileHasTag(topId, "door")) {
    const keyIndex = lynxDoorKeyIndex(topId);
    if (keyIndex !== null && state.inventory.keys[keyIndex] > 0) {
      if (topId !== MS_TILE.Door_Green) {
        state.inventory.keys[keyIndex] -= 1;
      }
      promoteBottomTile(lowerCells, pos, MS_TILE.Empty);
      return false;
    }
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.Socket) {
    if (state.inventory.chipsNeeded === 0) {
      promoteBottomTile(lowerCells, pos, MS_TILE.Empty);
      return false;
    }
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  return false;
}

function resolveLynxNonChipSupportBelow(
  state: EngineState,
  actors: LynxRuntimeActor[],
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
  chipPos: number,
  chipZ: number,
): boolean {
  if (!lowerCells) {
    return false;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return false;
  }
  const topId = cell.top.id;
  const bottomId = cell.bottom.id;

  if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  if (chipZ === z && chipPos === pos) {
    return false;
  }

  const actorBelow = findLynxVisibleActorAt(actors, pos, z);
  if (actorBelow) {
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  if (
    isLynxSupportingWallTile(topId) ||
    topId === MS_TILE.BlueWall_Fake ||
    lynxTileHasTag(topId, "door") ||
    topId === MS_TILE.Socket
  ) {
    addLynxTileOverlay(state, currentZ, pos, "support");
    return true;
  }

  return false;
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
      chipTeleported: false,
      chipSlideToken: false,
      chipIgnoreIceFromAir: false,
      couldntMove: false,
      trapReleaseCantMoveThisTick: false,
      lastRandomSlideDir: directionCode(state.replay.initialRandomSlideDirection),
    };
  }
  return runtimeState.lynxRuntimeState;
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
): {
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
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
): {
  chipPos: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
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
): {
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
} {
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

function lynxChipEntryMask(tileId: number): number {
  return lynxChipMovementMask(tileId);
}

function lynxBlockOrCreatureEntryMask(tileId: number, kind: "block" | "creature"): number {
  return kind === "block" ? lynxBlockMovementMask(tileId) : lynxCreatureMovementMask(tileId);
}

function canLynxCreatureEnter(tileId: number, actorId: number, dir: number): boolean {
  const mask = lynxBlockOrCreatureEntryMask(tileId, actorId === MS_TILE.Block ? "block" : "creature");
  if ((mask & dir) === 0) {
    return false;
  }
  if (tileId === MS_TILE.Fire && !lynxActorHasTag(actorId, "fire-immune")) {
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

function collectChipAtPosition(state: EngineState, pos: number): boolean {
  if (!hasBoardCell(state.map.cells, pos)) {
    return false;
  }

  if (topTile(state.map.cells, pos).id === MS_TILE.ICChip) {
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.inventory.chipsNeeded = Math.max(0, state.inventory.chipsNeeded - 1);
    state.map.hash = mapHash(state.map.cells);
    return true;
  }

  return false;
}

function collectLynxItemAtPosition(state: EngineState, pos: number): number {
  if (collectChipAtPosition(state, pos)) {
    return 1 << LYNX_SOUND.IcCollected;
  }

  if (!hasBoardCell(state.map.cells, pos)) {
    return 0;
  }

  const tile = topTile(state.map.cells, pos);
  const inventorySlot = lynxInventorySlot(tile.id);
  const inventoryIndex = lynxInventoryIndex(tile.id);
  if (inventorySlot !== null && inventoryIndex !== null) {
    state.inventory[inventorySlot][inventoryIndex] += 1;
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.map.hash = mapHash(state.map.cells);
    return 1 << LYNX_SOUND.ItemCollected;
  }

  return 0;
}

function hasLynxBoots(state: EngineState, tileId: number): boolean {
  const inventorySlot = lynxInventorySlot(tileId);
  const inventoryIndex = lynxInventoryIndex(tileId);
  return inventorySlot === "boots" && inventoryIndex !== null ? state.inventory.boots[inventoryIndex] > 0 : false;
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
  if (!hasBoardCell(state.map.cells, pos)) {
    return false;
  }
  const tile = topTile(state.map.cells, pos);
  if ((tile.state & LYNX_CELL_FLAG.Animated) !== 0) {
    return false;
  }

  const tileId = effectiveLynxTargetTileId(state, tile.id);
  if ((lynxChipEntryMask(tileId) & dir) === 0) {
    return false;
  }
  if (tileId === MS_TILE.HiddenWall_Temp || tileId === MS_TILE.BlueWall_Real) {
    return false;
  }
  const keyIndex = lynxDoorKeyIndex(tileId);
  if (keyIndex !== null) {
    return state.inventory.keys[keyIndex] > 0;
  }
  if (tileId === MS_TILE.Socket) {
    return state.inventory.chipsNeeded === 0;
  }

  return true;
}

function canLynxChipPushIntoClaimedCell(state: EngineState, pos: number, dir: number): boolean {
  if (!hasBoardCell(state.map.cells, pos)) {
    return false;
  }
  const tile = topTile(state.map.cells, pos);
  if ((tile.state & LYNX_CELL_FLAG.Animated) !== 0) {
    return false;
  }

  const tileId = effectiveLynxTargetTileId(state, tile.id);
  if (tileId === MS_TILE.HiddenWall_Temp || tileId === MS_TILE.BlueWall_Real) {
    return true;
  }
  if ((lynxChipEntryMask(tileId) & dir) === 0) {
    return false;
  }
  const keyIndex = lynxDoorKeyIndex(tileId);
  if (keyIndex !== null) {
    return state.inventory.keys[keyIndex] > 0;
  }
  if (tileId === MS_TILE.Socket) {
    return state.inventory.chipsNeeded === 0;
  }

  return true;
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
    const targetTileId = effectiveLynxTargetTileId(state, target.top.id);
    const pushOnlyClaimedCell = targetTileId === MS_TILE.HiddenWall_Temp || targetTileId === MS_TILE.BlueWall_Real;
    const canEnterClaimedCell = pushOnlyClaimedCell || canLynxChipPushIntoClaimedCell(state, targetPos, dir);
    if (!canEnterClaimedCell) {
      return { canMove: false, pushBlockPos: null };
    }
    const canPush = canLynxCreatureStartMovement(state, actors, block, dir);
    block.dir = dir;
    if (canPush) {
      block.dormant = false;
      block.intentDir = dir;
      block.pushed = true;
    }
    if (pushOnlyClaimedCell) {
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
        const horizontalBlock =
          horizontalProbe.pushBlockPos !== null
            ? findLynxBlockActor(actors, horizontalProbe.pushBlockPos, activeLynxLayerZ(state))
            : null;
        if ((!horizontalProbe.canMove || horizontalBlock?.dormant) && horizontalProbe.pushBlockPos !== null) {
          queuePendingLynxBlockPush(state, actors, horizontalProbe.pushBlockPos, horizontalDir);
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

  probeLynxChipMoveDirection(state, actors, chipPos, inputCode);
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

function resolveLynxChipInputDirection(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  inputCode: number,
): number {
  if (!isDirectionalInput(inputCode)) {
    return 0;
  }

  if (!isDiagonalInput(inputCode)) {
    return inputCode;
  }

  if ((chipDir & inputCode) !== 0) {
    const sameDir = chipDir;
    const otherDir = inputCode ^ chipDir;
    const sameProbe = probeLynxChipMoveDirection(state, actors, chipPos, sameDir);
    const otherProbe = probeLynxChipMoveDirection(state, actors, chipPos, otherDir);
    if (!sameProbe.canMove && otherProbe.canMove) {
      return otherDir;
    }
    return sameDir;
  }

  const horizontalDir = inputCode & (2 | 8);
  if (horizontalDir !== 0) {
    const horizontalProbe = probeLynxChipMoveDirection(state, actors, chipPos, horizontalDir);
    const horizontalBlock =
      horizontalProbe.pushBlockPos !== null
        ? findLynxBlockActor(actors, horizontalProbe.pushBlockPos, activeLynxLayerZ(state))
        : null;
    if (horizontalBlock?.dormant && horizontalProbe.pushBlockPos !== null) {
      return inputCode & (1 | 4);
    }
    if (horizontalProbe.canMove) {
      return horizontalDir;
    }
  }

  return inputCode & (1 | 4);
}

type LynxChipMoveSelection = {
  chipPos: number;
  chipZ: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  floorBeforeMove: number;
  rawRequestedInputCode: number;
  requestedInputCode: number;
  chosenInputCode: number;
  forcedInputCode: number;
  startInputCode: number;
  startAirMove: boolean;
  startElevatorMove: boolean;
};

function shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(
  state: EngineState,
  chipPos: number,
  chipMoving: number,
  chipArrivedOnHeldTrapThisTick: boolean,
): boolean {
  return (
    chipArrivedOnHeldTrapThisTick &&
    chipMoving === 0 &&
    lynxTileHasTag(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), "trap")
  );
}

function suppressLynxChipMoveSelectionForHeldTrapArrival(selection: LynxChipMoveSelection): LynxChipMoveSelection {
  return {
    ...selection,
    requestedInputCode: 0,
    chosenInputCode: 0,
    forcedInputCode: 0,
    startInputCode: 0,
    startAirMove: false,
    startElevatorMove: false,
  };
}

function selectLynxChipMoveForTick(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipZ: number,
  chipDir: number,
  chipMoving: number,
  endGameTicksElapsed: number | null,
  currentInputCode: number,
  queuedReplayInputCode: number,
  queuedChipInputCode: number,
): LynxChipMoveSelection {
  const chipInEndGame = endGameTicksElapsed !== null;
  const floorBeforeMove = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
  const forcedMove =
    chipMoving === 0 && !chipInEndGame
      ? getLynxChipForcedMove(state, actors, chipPos, chipZ, floorBeforeMove, chipDir)
      : { dir: 0, discardInput: false };
  const rawRequestedInputCode = chipMoving === 0 ? queuedReplayInputCode || currentInputCode : 0;
  const requestedInputCode = chipMoving === 0 && !chipInEndGame && !forcedMove.discardInput ? rawRequestedInputCode : 0;
  const chosenInputCode =
    chipMoving === 0 && requestedInputCode !== 0
      ? queuedChipInputCode || resolveLynxChipInputDirection(state, level, actors, chipPos, chipDir, requestedInputCode)
      : 0;

  return {
    chipPos,
    chipZ,
    chipDir,
    chipMoving,
    endGameTicksElapsed,
    floorBeforeMove,
    rawRequestedInputCode,
    requestedInputCode,
    chosenInputCode,
    forcedInputCode: forcedMove.dir,
    startInputCode: chipMoving === 0 ? chosenInputCode || forcedMove.dir : 0,
    startAirMove: chipMoving === 0 && chosenInputCode === 0 && forcedMove.moveKind === "air",
    startElevatorMove: chipMoving === 0 && chosenInputCode === 0 && forcedMove.moveKind === "elevator",
  };
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

function resolveLynxChipArrival(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  pos: number,
): {
  soundEffects: number;
  completed: boolean;
} {
  const cell = state.map.cells[pos];
  if (!cell) {
    return {
      soundEffects: 0,
      completed: false,
    };
  }

  const keyIndex = lynxDoorKeyIndex(cell.top.id);
  if (keyIndex !== null && state.inventory.keys[keyIndex] > 0) {
    if (keyIndex !== 3) {
      state.inventory.keys[keyIndex] -= 1;
    }
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.map.hash = mapHash(state.map.cells);
    return {
      soundEffects: 1 << LYNX_SOUND.DoorOpened,
      completed: false,
    };
  }

  switch (lynxChipEnterAction(cell.top.id)) {
    case "open-socket":
      if (state.inventory.chipsNeeded === 0) {
        promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
        state.map.hash = mapHash(state.map.cells);
        return {
          soundEffects: 1 << LYNX_SOUND.SocketOpened,
          completed: false,
        };
      }
      break;
    case "clear-floor":
      replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Empty });
      state.map.hash = mapHash(state.map.cells);
      return {
        soundEffects: 1 << LYNX_SOUND.TileEmptied,
        completed: false,
      };
    case "popup-wall":
      replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
      state.map.hash = mapHash(state.map.cells);
      return {
        soundEffects: 1 << LYNX_SOUND.WallCreated,
        completed: false,
      };
    case "steal-boots":
      state.inventory.boots = [0, 0, 0, 0];
      return {
        soundEffects: 1 << LYNX_SOUND.BootsStolen,
        completed: false,
      };
    case "button":
      return {
        soundEffects: resolveLynxButtonEffects(state, level, actors, pos, cell.top.id),
        completed: false,
      };
    case "trap":
      return {
        soundEffects: 1 << LYNX_SOUND.TrapEntered,
        completed: false,
      };
    case "exit":
      return {
        soundEffects: 1 << LYNX_SOUND.ChipWins,
        completed: true,
      };
  }

  return {
    soundEffects: 0,
    completed: false,
  };
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
): {
  chipPos: number;
  chipDir: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
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
  if (arrival.completed && endGameTicksElapsed === null) {
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
  state.soundEffects |= collectLynxItemAtPosition(state, chipPos);
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
  for (const cell of state.map.cells) {
    if (lynxTileHasTag(cell.top.id, "toggleable")) {
      cell.top.id = lynxToggledWallTileId(cell.top.id);
    }
    if (lynxTileHasTag(cell.bottom.id, "toggleable")) {
      cell.bottom.id = lynxToggledWallTileId(cell.bottom.id);
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
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipZ: number,
  floorId: number,
  chipDir: number,
): {
  dir: number;
  discardInput: boolean;
  moveKind?: "air" | "elevator";
} {
  const runtime = lynxRuntimeState(state);
  if (isLynxAir(floorId)) {
    const lowerZ = Math.max(1, chipZ - 1);
    const lowerCells = lynxLowerRuntimeCells(state, chipZ);
    if (!resolveLynxChipSupportBelow(state, actors, lowerCells, chipPos, lowerZ, chipZ)) {
      return { dir: 0, discardInput: true, moveKind: "air" };
    }
  }
  if (isLynxElevator(floorId) && canLynxChipUseElevator(state, actors, chipPos, chipZ, chipDir)) {
    return { dir: 0, discardInput: true, moveKind: "elevator" };
  }
  // Native Lynx does not apply forced-floor carry on the opening tick.
  if (state.timer.currentTime < 0) {
    return { dir: 0, discardInput: false };
  }
  if (runtime.chipTeleported) {
    runtime.chipTeleported = false;
    return { dir: chipDir, discardInput: true };
  }
  if (isLynxSlide(floorId)) {
    return hasLynxBoots(state, MS_TILE.Boots_Slide)
      ? { dir: 0, discardInput: false }
      : { dir: getLynxSlideDirection(state, floorId, true), discardInput: !runtime.chipSlideToken };
  }
  if (isLynxIce(floorId)) {
    if (runtime.chipIgnoreIceFromAir) {
      return { dir: 0, discardInput: false };
    }
    return hasLynxBoots(state, MS_TILE.Boots_Ice)
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

function startLynxChipAirMovement(
  state: EngineState,
  chipPos: number,
  chipZ: number,
): { chipPos: number; chipZ: number; chipMoving: number; chipMoveKind: LynxMoveKind } {
  const currentZ = chipZ;
  const targetZ = Math.max(1, currentZ - 1);
  if (targetZ === currentZ) {
    return { chipPos, chipZ, chipMoving: 0, chipMoveKind: "planar" };
  }

  setLynxActiveLayer(state, targetZ);
  return {
    chipPos,
    chipZ: targetZ,
    chipMoving: 8,
    chipMoveKind: "air",
  };
}

function isValidLynxElevatorDestinationFloor(floorId: number): boolean {
  return isLynxAir(floorId) || isLynxSlide(floorId) || lynxTileHasTag(floorId, "exit");
}

function canLynxChipUseElevator(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipZ: number,
  chipDir: number,
): boolean {
  const targetZ = chipZ + 1;
  const upperCells = lynxUpperRuntimeCells(state, chipZ);
  if (!upperCells || !isValidLynxElevatorDestinationFloor(topTileIdOr(upperCells, chipPos, MS_TILE.Empty))) {
    return false;
  }

  const actorAbove = findLynxVisibleActorAt(actors, chipPos, targetZ);
  if (!actorAbove || actorAbove.id !== MS_TILE.Block) {
    return true;
  }

  const pushDir = normalizeDirection(chipDir);
  if (pushDir === MS_DIRECTION.none) {
    return false;
  }

  return withLynxLayer(state, targetZ, () => canLynxCreatureStartMovement(state, actors, actorAbove, pushDir));
}

function startLynxChipElevatorMovement(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipZ: number,
  chipDir: number,
): { chipPos: number; chipZ: number; chipMoving: number; chipMoveKind: LynxMoveKind } {
  const targetZ = chipZ + 1;
  const upperCells = lynxUpperRuntimeCells(state, chipZ);
  if (!upperCells || !isValidLynxElevatorDestinationFloor(topTileIdOr(upperCells, chipPos, MS_TILE.Empty))) {
    addLynxTileOverlay(state, chipZ, chipPos, "elevator-failure");
    return { chipPos, chipZ, chipMoving: 0, chipMoveKind: "planar" };
  }

  const actorAbove = findLynxVisibleActorAt(actors, chipPos, targetZ);
  if (actorAbove?.id === MS_TILE.Block) {
    const pushDir = normalizeDirection(chipDir);
    if (pushDir === MS_DIRECTION.none) {
      addLynxTileOverlay(state, chipZ, chipPos, "elevator-failure");
      return { chipPos, chipZ, chipMoving: 0, chipMoveKind: "planar" };
    }
    if (!withLynxLayer(state, targetZ, () => tryPushLynxBlock(state, level, actors, chipPos, pushDir))) {
      addLynxTileOverlay(state, chipZ, chipPos, "elevator-failure");
      return { chipPos, chipZ, chipMoving: 0, chipMoveKind: "planar" };
    }
  }

  setLynxActiveLayer(state, targetZ);
  return {
    chipPos,
    chipZ: targetZ,
    chipMoving: 8,
    chipMoveKind: "elevator",
  };
}

function startLynxActorAirMovement(state: EngineState, actor: LynxRuntimeActor): boolean {
  const currentZ = actor.z ?? 1;
  const targetZ = Math.max(1, currentZ - 1);
  if (targetZ === currentZ) {
    return false;
  }

  removeTopTileFlags(lynxCellsForZ(state.map, currentZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  actor.z = targetZ;
  actor.moving = 8;
  actor.frame = 4;
  actor.moveKind = "air";
  addTopTileFlags(lynxCellsForZ(state.map, targetZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  return true;
}

function startLynxActorElevatorMovement(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
): boolean {
  const currentZ = actor.z ?? 1;
  const targetZ = currentZ + 1;
  const upperCells = lynxUpperRuntimeCells(state, actor.z);
  if (!upperCells || !isValidLynxElevatorDestinationFloor(topTileIdOr(upperCells, actor.pos, MS_TILE.Empty))) {
    addLynxTileOverlay(state, currentZ, actor.pos, "elevator-failure");
    return false;
  }
  const actorAbove = findLynxVisibleActorAt(actors, actor.pos, targetZ);
  if (actorAbove && actorAbove.id !== MS_TILE.Chip) {
    addLynxTileOverlay(state, currentZ, actor.pos, "elevator-failure");
    return false;
  }

  removeTopTileFlags(lynxCellsForZ(state.map, currentZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  actor.z = targetZ;
  actor.moving = 8;
  actor.frame = 4;
  actor.moveKind = "elevator";
  addTopTileFlags(lynxCellsForZ(state.map, targetZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  return true;
}

function findLynxTeleportDestination(
  state: EngineState,
  origin: number,
  canExit: (teleportPos: number) => boolean,
): { pos: number; teleported: boolean } {
  let pos = origin;

  for (;;) {
    pos -= 1;
    if (pos < 0) {
      pos += MS_GRID_WIDTH * MS_GRID_HEIGHT;
    }

    const cell = state.map.cells[pos];
    if (lynxTileForcedFloorKind(cell?.top.id ?? MS_TILE.Empty) !== "teleport") {
      if ((cell?.top.state ?? 0) & LYNX_CELL_FLAG.Teleport) {
        replaceTopTile(state.map.cells, pos, { ...cell!.top, id: MS_TILE.Teleport });
      }
      continue;
    }

    if (canExit(pos)) {
      return { pos, teleported: true };
    }

    if (pos === origin) {
      return { pos: origin, teleported: false };
    }
  }
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

function resolveLynxChipTeleport(state: EngineState, actors: LynxRuntimeActor[], chipPos: number, chipDir: number): number {
  const destination = findLynxTeleportDestination(state, chipPos, (teleportPos) => {
    const exitStep = advanceToCell(state.map.cells, teleportPos, chipDir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
    if (!exitStep) {
      return false;
    }
    const { pos: exitPos, cell: exitCell } = exitStep;

    const teleportClaimed =
      teleportPos !== chipPos &&
      state.map.cells[teleportPos] !== undefined &&
      hasTopTileFlags(state.map.cells, teleportPos, LYNX_CELL_FLAG.Claimed);
    if (teleportClaimed) {
      return false;
    }

    if (hasTopTileFlags(state.map.cells, exitPos, LYNX_CELL_FLAG.Claimed)) {
      const exitBlock = findClaimedLynxBlockOnActiveLayer(state, actors, exitPos);
      if (exitBlock) {
        return canLynxChipExitTeleportThroughBlock(state, actors, exitPos, chipDir);
      }

      return canLynxChipEnterCell(state, exitPos, chipDir);
    }

    return canLynxChipEnterCell(state, exitPos, chipDir);
  });

  if (!destination.teleported) {
    return chipPos;
  }

  lynxRuntimeState(state).chipTeleported = true;
  state.soundEffects |= 1 << LYNX_SOUND.Teleporting;
  return destination.pos;
}

function resolveLynxActorTeleport(state: EngineState, actor: LynxRuntimeActor): void {
  const origin = actor.pos;
  let pos = origin;

  for (;;) {
    pos -= 1;
    if (pos < 0) {
      pos += MS_GRID_WIDTH * MS_GRID_HEIGHT;
    }

    const cell = state.map.cells[pos];
    if (lynxTileForcedFloorKind(cell?.top.id ?? MS_TILE.Empty) !== "teleport") {
      if ((cell?.top.state ?? 0) & LYNX_CELL_FLAG.Teleport) {
        replaceTopTile(state.map.cells, pos, { ...cell!.top, id: MS_TILE.Teleport });
      }
      continue;
    }

    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    actor.pos = pos;

    const exitStep = advanceToCell(state.map.cells, pos, actor.dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
    if (!exitStep) {
      if (pos === origin) {
        addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
        return;
      }
      continue;
    }
    const { pos: exitPos, cell: exitCell } = exitStep;
    if (!canLynxCreatureEnter(effectiveLynxTargetTileId(state, exitCell.top.id), actor.id, actor.dir)) {
      if (pos === origin) {
        addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
        return;
      }
      continue;
    }

    if (hasTopTileFlags(state.map.cells, pos, LYNX_CELL_FLAG.Claimed)) {
      if (pos === origin) {
        addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
        return;
      }
      continue;
    }

    if (!hasTopTileFlags(state.map.cells, exitPos, LYNX_CELL_FLAG.Claimed)) {
      addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      actor.teleported = true;
      return;
    }

    if (pos === origin) {
      addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      return;
    }
  }
}

function resolveLynxTeleports(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
): number {
  for (let index = actors.length - 1; index >= 0; index -= 1) {
    const actor = actors[index]!;
    if (actor.hidden || actor.moving > 0) {
      continue;
    }
    withLynxLayer(state, actor.z ?? 1, () => {
      if (lynxTileForcedFloorKind(topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty)) !== "teleport") {
        return;
      }
      resolveLynxActorTeleport(state, actor);
    });
  }

  if (chipMoving === 0 && lynxTileForcedFloorKind(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty)) === "teleport") {
    chipPos = resolveLynxChipTeleport(state, actors, chipPos, chipDir);
  }

  return chipPos;
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
): {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  chipMoveKind: LynxMoveKind;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
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
): {
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
} {
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

function chooseLynxCreatureDirection(
  state: EngineState,
  actor: LynxRuntimeActor,
  chipPos: number,
  currentTime: number,
  stepping: number,
): number {
  const dir = actor.dir;

  switch (actor.id) {
    case MS_TILE.Tank:
    case MS_TILE.Ball:
    case MS_TILE.Glider:
    case MS_TILE.Fireball:
      return dir;
    case MS_TILE.Bug:
      return left(dir);
    case MS_TILE.Paramecium:
      return right(dir);
    case MS_TILE.Walker:
      return dir;
    case MS_TILE.Blob: {
      const cw = [1, 8, 4, 2];
      return cw[advanceLynxMainRandom4(state)] ?? 0;
    }
    case MS_TILE.Teeth: {
      if (((currentTime + stepping) & 4) !== 0) {
        return 0;
      }
      const dy = Math.floor(chipPos / MS_GRID_WIDTH) - Math.floor(actor.pos / MS_GRID_WIDTH);
      const dx = (chipPos % MS_GRID_WIDTH) - (actor.pos % MS_GRID_WIDTH);
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx < 0 ? 2 : dx > 0 ? 8 : 0;
      }
      return dy < 0 ? 1 : dy > 0 ? 4 : 0;
    }
    default:
      return 0;
  }
}

function chooseLynxCreatureFallbacks(actor: LynxRuntimeActor, firstChoice: number): number[] {
  switch (actor.id) {
    case MS_TILE.Tank:
      return firstChoice ? [firstChoice] : [];
    case MS_TILE.Ball:
      return [firstChoice, back(actor.dir)].filter((dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index);
    case MS_TILE.Glider:
      return [firstChoice, left(actor.dir), right(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    case MS_TILE.Fireball:
      return [firstChoice, right(actor.dir), left(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    case MS_TILE.Bug:
      return [firstChoice, actor.dir, right(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    case MS_TILE.Paramecium:
      return [firstChoice, actor.dir, left(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    default:
      return firstChoice ? [firstChoice] : [];
  }
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

function chooseLynxCreatureMoveForTick(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  chipPos: number,
  currentTime: number,
  stepping: number,
): void {
  withLynxLayer(state, actor.z ?? 1, () => {
    actor.intentDir = 0;
    actor.forcedDir = 0;

    if (actor.teleported) {
      actor.forcedDir = actor.dir;
      actor.teleported = false;
      return;
    }

    const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
    if (currentTime !== 0 && isLynxSlide(floor)) {
      actor.forcedDir = getLynxSlideDirection(state, floor, true);
      return;
    }
    if (currentTime !== 0 && isLynxIce(floor)) {
      actor.forcedDir = actor.dir;
      return;
    }

    if (actor.id === MS_TILE.Block) {
      return;
    }

    if (lynxCreatureFloorAction(floor) === "hold-direction") {
      actor.intentDir = actor.dir;
      return;
    }

    if (actor.id === MS_TILE.Teeth) {
      if (((currentTime + stepping) & 4) !== 0) {
        return;
      }

      const dy = Math.floor(chipPos / MS_GRID_WIDTH) - Math.floor(actor.pos / MS_GRID_WIDTH);
      const dx = (chipPos % MS_GRID_WIDTH) - (actor.pos % MS_GRID_WIDTH);
      const vertical = dy < 0 ? 1 : dy > 0 ? 4 : 0;
      const horizontal = dx < 0 ? 2 : dx > 0 ? 8 : 0;
      const fallbackDirs = Math.abs(dx) > Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];

      for (const dir of fallbackDirs) {
        if (dir === 0) {
          continue;
        }
        actor.intentDir = dir;
        if (canLynxCreatureStartMovement(state, actors, actor, dir, false, true)) {
          return;
        }
      }
      actor.intentDir = fallbackDirs[0] ?? 0;
      return;
    }

    const firstChoice = chooseLynxCreatureDirection(state, actor, chipPos, currentTime, stepping);

    if (actor.id === MS_TILE.Walker) {
      if (firstChoice !== 0) {
        actor.intentDir = firstChoice;
        if (canLynxCreatureStartMovement(state, actors, actor, firstChoice, false, true)) {
          return;
        }
      }

      const randomDir = [actor.dir, right(actor.dir), back(actor.dir), left(actor.dir)][advanceLynxPrng(state) & 3] ?? actor.dir;
      if (randomDir !== 0) {
        actor.intentDir = randomDir;
      }
      return;
    }

    const fallbackDirs = chooseLynxCreatureFallbacks(actor, firstChoice);
    for (const dir of fallbackDirs) {
      actor.intentDir = dir;
      if (canLynxCreatureStartMovement(state, actors, actor, dir, false, true)) {
        return;
      }
    }
  });
}

function startLynxCreatureMovement(
  state: EngineState,
  actors: LynxRuntimeActor[],
  actor: LynxRuntimeActor,
  dir: number,
  releasing = false,
): boolean {
  actor.dir = dir;
  const floorFrom = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);

  const targetPos = nextPosition(actor.pos, dir, MS_GRID_WIDTH);
  if (!canLynxCreatureStartMovement(state, actors, actor, dir, releasing, true)) {
    if (isLynxIce(floorFrom)) {
      actor.dir = applyLynxIceWallTurn(backDirection(dir), floorFrom);
    }
    return false;
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
  return true;
}

function finishLynxActorMovement(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], actor: LynxRuntimeActor): void {
  const cell = state.map.cells[actor.pos];
  if (!cell) {
    return;
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
    } else if (arrivalAction === "block-bomb") {
      promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
      removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      removeLynxActor(state, actors, actor, arrivalAnimationTileId ?? LYNX_ANIMATION_TILE.Bomb_Explosion);
      state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
    } else if (arrivalAction === "clear-key-blue") {
      promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
      addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    }
    actor.deferPush = false;
    actor.deferPushArmed = false;
    state.soundEffects |= resolveLynxCreatureArrivalEffects(state, level, actors, actor.pos, cell.top.id);
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (arrivalAction === "creature-water") {
    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, actor, arrivalAnimationTileId ?? LYNX_ANIMATION_TILE.Water_Splash);
    state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (arrivalAction === "creature-bomb") {
    promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, actor, arrivalAnimationTileId ?? LYNX_ANIMATION_TILE.Bomb_Explosion);
    state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (arrivalAction === "clear-key-blue") {
    promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
    addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    state.map.hash = mapHash(state.map.cells);
  }

  state.soundEffects |= resolveLynxCreatureArrivalEffects(state, level, actors, actor.pos, cell.top.id);
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
  withLynxLayer(state, actor.z ?? 1, () => {
    if (actor.hidden) {
      return;
    }

    if (actor.moving <= 0) {
      const floorBeforeMove = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
      if (isLynxAir(floorBeforeMove)) {
        const targetZ = Math.max(1, (actor.z ?? 1) - 1);
        const lowerCells = lynxLowerRuntimeCells(state, actor.z);
        if (!resolveLynxNonChipSupportBelow(state, actors, lowerCells, actor.pos, targetZ, actor.z ?? 1, chipPos, chipZ)) {
          if (!startLynxActorAirMovement(state, actor)) {
            return;
          }
        } else {
          actor.moveKind = "planar";
          actor.ignoreIceFromAir = false;
        }
      }

      if (actor.moving <= 0 && isLynxElevator(floorBeforeMove)) {
        if (startLynxActorElevatorMovement(state, actors, actor)) {
          // Vertical move started; skip planar movement selection.
        } else {
          actor.moveKind = "planar";
        }
      }

      if (actor.moving <= 0) {
        const moveDir = actor.intentDir || actor.forcedDir || forcedLynxActorDirection(state, actor, floorBeforeMove, currentTime);
        actor.intentDir = 0;
        actor.forcedDir = 0;
        if (moveDir === 0 || !startLynxCreatureMovement(state, actors, actor, moveDir)) {
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

  const actor = findLynxVisibleActorAt(actors, chipPos, activeLynxLayerZ(state));
  if (!actor) {
    return {
      chipPos,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

  const preserveCollidedActor = isLynxVerticalMoveKind(chipMoveKind) || isLynxVerticalMoveKind(actor.moveKind);
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
    actor,
    preserveCollidedActor,
  );
}

function allocateLynxActorSlot(actors: LynxRuntimeActor[], actor: LynxRuntimeActor): LynxRuntimeActor {
  return storeActorInReusableHiddenSlot(actors, actor, (entry) => !entry.animationReserved);
}

function findLynxClonerTarget(level: LynxLevel, buttonPos: number, z = 1): number | null {
  return collectLevelConnections(level, "cloners").find(
    (connection) => connection.from === buttonPos && (connection.fromZ ?? 1) === z && (connection.toZ ?? 1) === z,
  )?.to ?? null;
}

function findLynxTrapTarget(level: LynxLevel, buttonPos: number, z = 1): number | null {
  return collectLevelConnections(level, "traps").find(
    (connection) => connection.from === buttonPos && (connection.fromZ ?? 1) === z && (connection.toZ ?? 1) === z,
  )?.to ?? null;
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
  if (!startLynxCreatureMovement(state, actors, block, dir)) {
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
  const buttonZ = activeLynxLayerZ(state);
  return withLynxLayer(state, buttonZ, () => {
    const sourcePos = findLynxClonerTarget(level, buttonPos, buttonZ);
    if (sourcePos === null || sourcePos < 0 || sourcePos >= state.map.cells.length) {
      return false;
    }

    if (!lynxTileHasTag(state.map.cells[sourcePos]?.top.id ?? MS_TILE.Empty, "cloner")) {
      return false;
    }

    const sourceActor = findLynxVisibleActorAt(actors, sourcePos, buttonZ);
    if (!sourceActor || sourceActor.dir === 0) {
      return false;
    }

    const sourceSnapshot: LynxRuntimeActor = {
      ...sourceActor,
      z: buttonZ,
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
    const clone = allocateLynxActorSlot(actors, sourceSnapshot);

    if (!startLynxCreatureMovement(state, actors, sourceActor, sourceActor.dir, true)) {
      return false;
    }

    Object.assign(clone, {
      ...sourceSnapshot,
      hidden: false,
    });
    advanceLynxCreature(state, level, actors, sourceActor, state.timer.currentTime + 1);
    return true;
  });
}

function springLynxTrap(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], buttonPos: number): boolean {
  const buttonZ = activeLynxLayerZ(state);
  return withLynxLayer(state, buttonZ, () => {
    const sourcePos = findLynxTrapTarget(level, buttonPos, buttonZ);
    if (sourcePos === null || sourcePos < 0 || sourcePos >= state.map.cells.length) {
      return false;
    }
    if (!lynxTileHasTag(topTileIdOr(state.map.cells, sourcePos, MS_TILE.Empty), "trap")) {
      return false;
    }

    const sourceActor = findLynxVisibleActorAt(actors, sourcePos, buttonZ);
    if (!sourceActor || sourceActor.dir === 0) {
      return false;
    }

    if (sourceActor.moving <= 0 && !startLynxCreatureMovement(state, actors, sourceActor, sourceActor.dir, true)) {
      return false;
    }

    advanceLynxCreature(state, level, actors, sourceActor, state.timer.currentTime + 1);
    return true;
  });
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
    const canPushIntoClaimedCell = targetBlock ? canLynxChipPushIntoClaimedCell(state, targetPos, chipDir) : false;
    const pushedBlock =
      targetBlock && canPushIntoClaimedCell ? tryPushLynxBlock(state, level, actors, targetPos, chipDir) : false;
    const canEnterTarget =
      !!target &&
      (targetBlock
        ? pushedBlock && (revealLynxHiddenWall(state, targetPos) ? false : canLynxChipEnterCell(state, targetPos, chipDir))
        : revealLynxHiddenWall(state, targetPos)
          ? false
          : canLynxChipEnterCell(state, targetPos, chipDir));

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
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  endGameTicksElapsed: number | null,
  endGameResult: LynxEndGameResult | null,
  endGameAnimationTileId: number | null,
  endGameAnimationFrame: number | null,
  replayInputCode = 0,
): {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
  consumedReplayInput: boolean;
  deferredChipInputCode: number;
  chipArrivedOnTrapThisTick: boolean;
} {
  let nextChipPos = chipPos;
  let nextChipDir = chipDir;
  let nextChipMoving = chipMoving;
  let nextEndGameTicksElapsed = endGameTicksElapsed;
  let nextEndGameResult = endGameResult;
  let nextEndGameAnimationTileId = endGameAnimationTileId;
  let nextEndGameAnimationFrame = endGameAnimationFrame;
  let consumedReplayInput = false;
  let deferredChipInputCode = 0;
  let chipArrivedOnTrapThisTick = false;

  const trapPos = findLynxTrapTarget(level, buttonPos, activeLynxLayerZ(state));
  springLynxTrap(state, level, actors, buttonPos);
  if (trapPos === nextChipPos && lynxTileHasTag(topTileIdOr(state.map.cells, nextChipPos, MS_TILE.Empty), "trap")) {
    if (isDirectionalInput(replayInputCode) && nextChipMoving <= 0) {
      deferredChipInputCode = resolveLynxChipInputDirection(state, level, actors, nextChipPos, nextChipDir, replayInputCode);
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

  return {
    request: { ...request },
    status: "playing",
    timer: createInitialEngineTimer(level.timeLimitTicks),
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
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
}

function createLynxInteractiveToken(
  request: GameRequest,
  level: LynxLevel,
  replay:
    | (Pick<ReplaySolutionPayload, "moves" | "randomSeed" | "randomSlideDirection" | "stepping" | "flags"> & {
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
    recordedMoves: replay ? replay.moves.map((move) => ({ ...move })) : [],
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
  recordedMoves: SolutionMove[],
  currentTime: number,
  replayCursor: number,
  moveCode: number,
): SolutionMove[] {
  return recordManualMove(recordedMoves, currentTime, replayCursor, moveCode);
}

function advanceLynxInteractiveTick(
  session: LynxInteractiveSessionState,
  scheduledInputCode: number | null,
): LynxInteractiveSessionState {
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

  let chipPos = session.chipPos;
  let chipZ = session.chipZ ?? 1;
  let chipDir = session.chipDir;
  let chipMoving = session.chipMoving;
  let chipMoveKind = session.chipMoveKind ?? "planar";
  let currentInputCode = carryCurrentInputAcrossTicks ? session.currentInputCode : 0;
  let queuedReplayInputCode = session.queuedReplayInputCode;
  let queuedChipInputCode = session.queuedChipInputCode;
  let chipPushing = false;
  const actors = session.actors;
  let endGameTicksElapsed = session.endGameTicksElapsed;
  let endGameResult = session.endGameResult;
  let endGameAnimationTileId = session.endGameAnimationTileId;
  let endGameAnimationFrame = session.endGameAnimationFrame;
  let chipArrivedOnHeldTrapThisTick = false;
  let latchedChipMoveSelection: ReturnType<typeof selectLynxChipMoveForTick> | null = null;
  let recordedReplayInputCode = 0;

  const runInitialHousekeepingPhase = (): void => {
    if (scheduledInputCode !== null) {
      currentInputCode = scheduledInputCode;
    }
    state.soundEffects &= ~LYNX_ONE_SHOT_MASK;
    runLynxInitialHousekeeping(state, actors);
    endGameAnimationFrame = advanceLynxEndGameAnimationFrame(endGameResult, endGameAnimationFrame);
    if (endGameTicksElapsed === null && state.timer.timeLimit > 0 && state.timer.currentTime >= state.timer.timeLimit) {
      const timedOut = failLynxChip(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
        "outoftime",
      );
      chipPos = timedOut.chipPos;
      chipMoving = 0;
      endGameTicksElapsed = timedOut.endGameTicksElapsed;
      endGameResult = timedOut.endGameResult;
      endGameAnimationTileId = timedOut.endGameAnimationTileId;
      endGameAnimationFrame = timedOut.endGameAnimationFrame;
    }
    advanceLynxAnimations(state, actors);
    if (replayMode && scheduledInputCode !== null) {
      state.replay.cursor += 1;
    }
  };

  const runCreatureIntentPhase = (): void => {
    for (let index = actors.length - 1; index >= 0; index -= 1) {
      const actor = actors[index]!;
      if (actor.hidden || actor.moving > 0 || actor.dormant) {
        continue;
      }
      chooseLynxCreatureMoveForTick(state, actors, actor, chipPos, state.timer.currentTime + 1, state.replay.stepping);
    }
    markPendingLynxChipPush(
      state,
      actors,
      chipPos,
      chipDir,
      chipMoving,
      endGameTicksElapsed,
      pendingLynxChipPushInputCode(
        state,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        queuedChipInputCode,
        queuedReplayInputCode,
        currentInputCode,
      ),
    );
    latchedChipMoveSelection =
      chipMoving === 0 && !lynxTileHasTag(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), "trap")
        ? selectLynxChipMoveForTick(
            state,
            level,
            actors,
            chipPos,
            chipZ,
            chipDir,
            chipMoving,
            endGameTicksElapsed,
            currentInputCode,
            queuedReplayInputCode,
            queuedChipInputCode,
          )
        : null;
    if (latchedChipMoveSelection) {
      const previewInputCode =
        latchedChipMoveSelection.requestedInputCode !== 0
          ? latchedChipMoveSelection.requestedInputCode
          : latchedChipMoveSelection.forcedInputCode !== 0 &&
              isLynxSlide(latchedChipMoveSelection.floorBeforeMove) &&
              shouldPreviewLynxForcedSlidePush(state, actors, chipPos, latchedChipMoveSelection.startInputCode)
            ? latchedChipMoveSelection.startInputCode
            : 0;
      previewLynxChipPushRequest(state, actors, chipPos, previewInputCode);
    }
    if (
      replayMode &&
      latchedChipMoveSelection &&
      latchedChipMoveSelection.requestedInputCode !== 0 &&
      queuedReplayInputCode === 0
    ) {
      state.lastMove = {
        code: latchedChipMoveSelection.rawRequestedInputCode,
        name: runtimeCommandName(latchedChipMoveSelection.rawRequestedInputCode),
      };
    }

    const chipOnBeartrapBeforeCreatureMovement =
      chipMoving === 0 && lynxTileHasTag(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), "trap");
    const chipHasPreCreatureMoveQueued =
      (latchedChipMoveSelection !== null && latchedChipMoveSelection.startInputCode !== 0) ||
      (chipOnBeartrapBeforeCreatureMovement &&
        (queuedChipInputCode !== 0 || queuedReplayInputCode !== 0 || currentInputCode !== 0));
    if (!chipHasPreCreatureMoveQueued) {
      clearLynxCouldntMove(state);
    }
  };

  const runCreatureMovementPhase = (): void => {
    for (let index = actors.length - 1; index >= 0; index -= 1) {
      const actor = actors[index]!;
      if (!skipsDormantLynxActorAdvance(state, actor, state.timer.currentTime + 1)) {
        advanceLynxCreature(state, level, actors, actor, state.timer.currentTime + 1, chipPos, chipZ);
      }
      actor.intentDir = 0;
      actor.forcedDir = 0;
      withLynxLayer(state, actor.z ?? 1, () => {
        if (
          actor.hidden ||
          actor.moving > 0 ||
          lynxButtonAction(topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty)) !== "spring-trap"
        ) {
          return;
        }
        const heldButton = springLynxHeldBrownButton(
          state,
          level,
          actors,
          actor.pos,
          chipPos,
          chipDir,
          chipMoving,
          endGameTicksElapsed,
          endGameResult,
          endGameAnimationTileId,
          endGameAnimationFrame,
          replayMode ? currentInputCode : 0,
        );
        chipPos = heldButton.chipPos;
        chipDir = heldButton.chipDir;
        chipMoving = heldButton.chipMoving;
        endGameTicksElapsed = heldButton.endGameTicksElapsed;
        endGameResult = heldButton.endGameResult;
        endGameAnimationTileId = heldButton.endGameAnimationTileId;
        endGameAnimationFrame = heldButton.endGameAnimationFrame;
        chipArrivedOnHeldTrapThisTick ||= heldButton.chipArrivedOnTrapThisTick;
        if (replayMode && heldButton.consumedReplayInput) {
          state.lastMove = {
            code: currentInputCode,
            name: runtimeCommandName(currentInputCode),
          };
          if (heldButton.deferredChipInputCode !== 0) {
            queuedReplayInputCode = currentInputCode;
            queuedChipInputCode = heldButton.deferredChipInputCode;
          }
          currentInputCode = 0;
        } else if (!replayMode && heldButton.consumedReplayInput) {
          recordedReplayInputCode = currentInputCode;
        }
      });
    }
    {
      const collision = resolveLynxChipCollision(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        chipMoveKind,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      );
      chipPos = collision.chipPos;
      chipMoving = collision.endGameTicksElapsed !== null ? 0 : chipMoving;
      endGameTicksElapsed = collision.endGameTicksElapsed;
      endGameResult = collision.endGameResult;
      endGameAnimationTileId = collision.endGameAnimationTileId;
      endGameAnimationFrame = collision.endGameAnimationFrame;
    }
  };

  const runChipMovementPhase = (): void => {
    const chipMoveSelection =
      (() => {
        const selection =
          latchedChipMoveSelection &&
          chipPos === latchedChipMoveSelection.chipPos &&
          chipZ === latchedChipMoveSelection.chipZ &&
          chipDir === latchedChipMoveSelection.chipDir &&
          chipMoving === latchedChipMoveSelection.chipMoving &&
          endGameTicksElapsed === latchedChipMoveSelection.endGameTicksElapsed
            ? latchedChipMoveSelection
            : selectLynxChipMoveForTick(
                state,
                level,
                actors,
                chipPos,
                chipZ,
                chipDir,
                chipMoving,
                endGameTicksElapsed,
                currentInputCode,
                queuedReplayInputCode,
                queuedChipInputCode,
              );
        return shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(
          state,
          chipPos,
          chipMoving,
          chipArrivedOnHeldTrapThisTick,
        )
          ? suppressLynxChipMoveSelectionForHeldTrapArrival(selection)
          : selection;
      })();
    const floorBeforeMove = chipMoveSelection.floorBeforeMove;
    const heldButtonConsumedReplayInput = queuedReplayInputCode !== 0;
    const rawRequestedInputCode = chipMoveSelection.rawRequestedInputCode;
    if (
      chipMoving === 0 &&
      !shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(state, chipPos, chipMoving, chipArrivedOnHeldTrapThisTick)
    ) {
      currentInputCode = 0;
      queuedReplayInputCode = 0;
    }
    const requestedInputCode = chipMoveSelection.requestedInputCode;
    if (replayMode && requestedInputCode !== 0 && !heldButtonConsumedReplayInput) {
      state.lastMove = {
        code: rawRequestedInputCode,
        name: runtimeCommandName(rawRequestedInputCode),
      };
    } else if (!replayMode && requestedInputCode !== 0 && !heldButtonConsumedReplayInput) {
      recordedReplayInputCode = rawRequestedInputCode;
    }
    const chosenInputCode = chipMoveSelection.chosenInputCode;
    queuedChipInputCode = 0;
    const startInputCode = chipMoveSelection.startInputCode;

    if (startInputCode === 0 && !chipMoveSelection.startAirMove && !chipMoveSelection.startElevatorMove && chipMoving === 0) {
      if (!lynxRuntimeState(state).trapReleaseCantMoveThisTick) {
        clearLynxCouldntMove(state);
      }
      resetLynxFloorSounds(state);
    }

    if (chipMoving === 0 && chipMoveSelection.startAirMove) {
      const airborne = startLynxChipAirMovement(state, chipPos, chipZ);
      chipPos = airborne.chipPos;
      chipZ = airborne.chipZ;
      chipMoving = airborne.chipMoving;
      chipMoveKind = airborne.chipMoveKind;
      clearLynxCouldntMove(state);
    } else if (chipMoving === 0 && chipMoveSelection.startElevatorMove) {
      const elevated = startLynxChipElevatorMovement(state, level, actors, chipPos, chipZ, chipDir);
      chipPos = elevated.chipPos;
      chipZ = elevated.chipZ;
      chipMoving = elevated.chipMoving;
      chipMoveKind = elevated.chipMoveKind;
      if (elevated.chipMoving > 0) {
        clearLynxCouldntMove(state);
      }
    } else if (chipMoving === 0 && startInputCode !== 0) {
      updateLynxChipStartMovementState(state, floorBeforeMove, chosenInputCode);
      if (canLynxExitTile(state, floorBeforeMove, MS_TILE.Chip, startInputCode, false)) {
        if (!canAdvanceLynxPosition(chipPos, startInputCode, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
          chipPushing = true;
          chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
          addLynxCantMove(state);
        } else {
          const targetPos = nextPosition(chipPos, startInputCode, MS_GRID_WIDTH);
          const target = state.map.cells[targetPos];
          const targetBlock =
            target === undefined
              ? null
              : findClaimedLynxBlockOnActiveLayer(state, actors, targetPos);
          const canPushIntoClaimedCell = targetBlock
            ? canLynxChipPushIntoClaimedCell(state, targetPos, startInputCode)
            : false;
          const pushedBlock =
            targetBlock && canPushIntoClaimedCell
              ? tryPushLynxBlock(state, level, actors, targetPos, startInputCode)
              : false;
          const pressedPermanentHiddenWallPos =
            targetBlock === null ? findPressedLynxPermanentHiddenWallPos(state, chipPos, startInputCode) : null;
          const canEnterTarget =
            !!target &&
            (targetBlock
              ? pushedBlock && (revealLynxHiddenWall(state, targetPos) ? false : canLynxChipEnterCell(state, targetPos, startInputCode))
              : revealLynxHiddenWall(state, targetPos)
                ? false
                : canLynxChipEnterCell(state, targetPos, startInputCode));
          if (targetBlock && (pushedBlock || !canEnterTarget)) {
            chipPushing = true;
          }
          if (canEnterTarget) {
            clearLynxCouldntMove(state);
            chipDir = startInputCode;
            chipPos = targetPos;
            chipMoving = 8;
            chipMoveKind = "planar";
          } else {
            if (pressedPermanentHiddenWallPos !== null) {
              addLynxTileOverlay(state, chipZ, pressedPermanentHiddenWallPos, "hidden-wall-reveal", HIDDEN_WALL_REVEAL_TTL);
            }
            chipPushing = true;
            chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
            addLynxCantMove(state);
          }
        }
      } else {
        chipPushing = true;
        chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
        addLynxCantMove(state);
      }
    }
  };

  const runPostMoveResolutionPhase = (): void => {
    const postMove = resolveLynxPostChipMovement(
      state,
      level,
      actors,
      chipPos,
      chipDir,
      chipMoving,
      chipMoveKind,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    );
    chipPos = postMove.chipPos;
    chipDir = postMove.chipDir;
    chipMoving = postMove.chipMoving;
    chipMoveKind = postMove.chipMoveKind;
    endGameTicksElapsed = postMove.endGameTicksElapsed;
    endGameResult = postMove.endGameResult;
    endGameAnimationTileId = postMove.endGameAnimationTileId;
    endGameAnimationFrame = postMove.endGameAnimationFrame;
  };

  const runFinalizePhase = (): void => {
    const finalizedEndGame = finalizeLynxTickBookkeeping(
      state,
      chipPos,
      chipDir,
      chipMoving,
      chipMoveKind,
      endGameTicksElapsed,
      endGameResult,
    );
    endGameTicksElapsed = finalizedEndGame.endGameTicksElapsed;
    endGameResult = finalizedEndGame.endGameResult;
  };

  runTurnPhaseHandlers<void>([
    {
      name: TURN_PHASE.initialHousekeeping,
      run: () => {
        runInitialHousekeepingPhase();
        return null;
      },
    },
    {
      name: TURN_PHASE.creatureIntent,
      run: () => {
        runCreatureIntentPhase();
        return null;
      },
    },
    {
      name: TURN_PHASE.creatureMovement,
      run: () => {
        runCreatureMovementPhase();
        return null;
      },
    },
    {
      name: TURN_PHASE.chipMovement,
      run: () => {
        runChipMovementPhase();
        return null;
      },
    },
    {
      name: TURN_PHASE.postMoveResolution,
      run: () => {
        runPostMoveResolutionPhase();
        return null;
      },
    },
    {
      name: TURN_PHASE.finalize,
      run: () => {
        runFinalizePhase();
        return null;
      },
    },
  ]);

  return {
    level,
    state,
    lastInput: runtimeInput,
    recordedMoves: recordLynxReplayMove(
      session.recordedMoves,
      state.timer.currentTime,
      state.replay.cursor,
      recordedReplayInputCode,
    ),
    replayPlan,
    chipPos,
    chipZ,
    chipDir,
    chipMoving,
    chipMoveKind,
    currentInputCode: carryCurrentInputAcrossTicks ? currentInputCode : 0,
    queuedReplayInputCode,
    queuedChipInputCode,
    chipPushing,
    actors,
    endGameTicksElapsed,
    endGameResult,
    endGameAnimationTileId,
    endGameAnimationFrame,
  };
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
  const state = initializeLynxEngineState(request, level, replay);
  state.map.hash = mapHash(state.map.cells);
  const initialState = engineStateToSnapshot(state, "initial", createRuntimeCommand(0, -1));
  const initialActors = parseLynxActors(level);
  const initialChipSeed = findChipSeed(level);
  const initialChipPos = initialChipSeed.pos;
  const initialDebugState = projectLynxDebugPhaseSnapshot(
    state,
    initialActors,
    initialChipPos,
    0,
    0,
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
        status: state.status,
        finalTick: state.timer.tick,
      },
    });
  }

  const steps: GameDebugTrace["steps"] = [];
  const chipSeed = findChipSeed(level);
  let chipPos = chipSeed.pos;
  let chipZ = chipSeed.z;
  let chipDir = chipSeed.dir;
  let chipMoving = 0;
  let chipMoveKind: LynxMoveKind = "planar";
  let currentInputCode = 0;
  let queuedReplayInputCode = 0;
  let queuedChipInputCode = 0;
  const actors = parseLynxActors(level);
  let endGameTicksElapsed: number | null = null;
  let endGameResult: LynxEndGameResult | null = null;
  let endGameAnimationTileId: number | null = null;
  let endGameAnimationFrame: number | null = null;

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const scheduled = scheduledInputForTick(commands, tick);
    if (scheduled) {
      currentInputCode = scheduled.inputCode;
    }
    state.soundEffects &= ~LYNX_ONE_SHOT_MASK;
    if (replay && scheduled) {
      state.replay.cursor += 1;
    }

    const phases: GameDebugPhaseSnapshot[] = [];
    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.postInputLatch, (phase) =>
      projectLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, currentInputCode, tick, phase),
    );
    runLynxInitialHousekeeping(state, actors);
    endGameAnimationFrame = advanceLynxEndGameAnimationFrame(endGameResult, endGameAnimationFrame);
    if (endGameTicksElapsed === null && state.timer.timeLimit > 0 && state.timer.currentTime >= state.timer.timeLimit) {
      const timedOut = failLynxChip(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
        "outoftime",
      );
      chipPos = timedOut.chipPos;
      chipMoving = 0;
      endGameTicksElapsed = timedOut.endGameTicksElapsed;
      endGameResult = timedOut.endGameResult;
      endGameAnimationTileId = timedOut.endGameAnimationTileId;
      endGameAnimationFrame = timedOut.endGameAnimationFrame;
    }
    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.postInitialHousekeeping, (phase) =>
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        currentInputCode,
        tick,
        phase,
      ),
    );
    advanceLynxAnimations(state, actors);

    for (let index = actors.length - 1; index >= 0; index -= 1) {
      const actor = actors[index]!;
      if (actor.hidden || actor.moving > 0 || actor.dormant) {
        continue;
      }
      chooseLynxCreatureMoveForTick(state, actors, actor, chipPos, state.timer.currentTime + 1, state.replay.stepping);
    }
    markPendingLynxChipPush(
      state,
      actors,
      chipPos,
      chipDir,
      chipMoving,
      endGameTicksElapsed,
      pendingLynxChipPushInputCode(
        state,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
        queuedChipInputCode,
        queuedReplayInputCode,
        currentInputCode,
      ),
    );
    const latchedChipMoveSelection =
      chipMoving === 0 && !lynxTileHasTag(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), "trap")
        ? selectLynxChipMoveForTick(
            state,
            level,
            actors,
            chipPos,
            chipZ,
            chipDir,
            chipMoving,
            endGameTicksElapsed,
            currentInputCode,
            queuedReplayInputCode,
            queuedChipInputCode,
          )
        : null;
    if (latchedChipMoveSelection) {
      const previewInputCode =
        latchedChipMoveSelection.requestedInputCode !== 0
          ? latchedChipMoveSelection.requestedInputCode
          : latchedChipMoveSelection.forcedInputCode !== 0 &&
              isLynxSlide(latchedChipMoveSelection.floorBeforeMove) &&
              shouldPreviewLynxForcedSlidePush(state, actors, chipPos, latchedChipMoveSelection.startInputCode)
            ? latchedChipMoveSelection.startInputCode
            : 0;
      previewLynxChipPushRequest(state, actors, chipPos, previewInputCode);
    }
    if (replay && latchedChipMoveSelection && latchedChipMoveSelection.requestedInputCode !== 0 && queuedReplayInputCode === 0) {
      state.lastMove = {
        code: latchedChipMoveSelection.rawRequestedInputCode,
        name: runtimeCommandName(latchedChipMoveSelection.rawRequestedInputCode),
      };
    }

    const chipOnBeartrapBeforeCreatureMovement =
      chipMoving === 0 && lynxTileHasTag(topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty), "trap");
    const chipHasPreCreatureMoveQueued =
      (latchedChipMoveSelection !== null && latchedChipMoveSelection.startInputCode !== 0) ||
      (chipOnBeartrapBeforeCreatureMovement &&
        (queuedChipInputCode !== 0 || queuedReplayInputCode !== 0 || currentInputCode !== 0));
    if (!chipHasPreCreatureMoveQueued) {
      clearLynxCouldntMove(state);
    }

    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.postCreatureIntent, (phase) =>
      projectLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, 0, tick, phase),
    );

    let chipArrivedOnHeldTrapThisTick = false;

    for (let index = actors.length - 1; index >= 0; index -= 1) {
      const actor = actors[index]!;
      if (!skipsDormantLynxActorAdvance(state, actor, state.timer.currentTime + 1)) {
        advanceLynxCreature(state, level, actors, actor, state.timer.currentTime + 1, chipPos, chipZ);
      }
      actor.intentDir = 0;
      actor.forcedDir = 0;
      if (
        !actor.hidden &&
        actor.moving <= 0 &&
        lynxButtonAction(topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty)) === "spring-trap"
      ) {
        const heldButton = springLynxHeldBrownButton(
          state,
          level,
          actors,
          actor.pos,
          chipPos,
          chipDir,
          chipMoving,
          endGameTicksElapsed,
          endGameResult,
          endGameAnimationTileId,
          endGameAnimationFrame,
          replay ? currentInputCode : 0,
        );
        chipPos = heldButton.chipPos;
        chipDir = heldButton.chipDir;
        chipMoving = heldButton.chipMoving;
        endGameTicksElapsed = heldButton.endGameTicksElapsed;
        endGameResult = heldButton.endGameResult;
        endGameAnimationTileId = heldButton.endGameAnimationTileId;
        endGameAnimationFrame = heldButton.endGameAnimationFrame;
        chipArrivedOnHeldTrapThisTick ||= heldButton.chipArrivedOnTrapThisTick;
        if (replay && heldButton.consumedReplayInput) {
          state.lastMove = {
            code: currentInputCode,
            name: runtimeCommandName(currentInputCode),
          };
          if (heldButton.deferredChipInputCode !== 0) {
            queuedReplayInputCode = currentInputCode;
            queuedChipInputCode = heldButton.deferredChipInputCode;
          }
          currentInputCode = 0;
        }
      }
    }
    {
      const collision = resolveLynxChipCollision(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        chipMoveKind,
        endGameTicksElapsed,
        endGameResult,
        endGameAnimationTileId,
        endGameAnimationFrame,
      );
      chipPos = collision.chipPos;
      chipMoving = collision.endGameTicksElapsed !== null ? 0 : chipMoving;
      endGameTicksElapsed = collision.endGameTicksElapsed;
      endGameResult = collision.endGameResult;
      endGameAnimationTileId = collision.endGameAnimationTileId;
      endGameAnimationFrame = collision.endGameAnimationFrame;
    }

    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.postCreatureMovement, (phase) =>
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        0,
        tick,
        phase,
      ),
    );

    const chipMoveSelection =
      (() => {
        const selection =
          latchedChipMoveSelection &&
          chipPos === latchedChipMoveSelection.chipPos &&
          chipZ === latchedChipMoveSelection.chipZ &&
          chipDir === latchedChipMoveSelection.chipDir &&
          chipMoving === latchedChipMoveSelection.chipMoving &&
          endGameTicksElapsed === latchedChipMoveSelection.endGameTicksElapsed
            ? latchedChipMoveSelection
            : selectLynxChipMoveForTick(
                state,
                level,
                actors,
                chipPos,
                chipZ,
                chipDir,
                chipMoving,
                endGameTicksElapsed,
                currentInputCode,
                queuedReplayInputCode,
                queuedChipInputCode,
              );
        return shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(
          state,
          chipPos,
          chipMoving,
          chipArrivedOnHeldTrapThisTick,
        )
          ? suppressLynxChipMoveSelectionForHeldTrapArrival(selection)
          : selection;
      })();
    const floorBeforeMove = chipMoveSelection.floorBeforeMove;
    const heldButtonConsumedReplayInput = queuedReplayInputCode !== 0;
    const rawRequestedInputCode = chipMoveSelection.rawRequestedInputCode;
    if (
      chipMoving === 0 &&
      !shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(state, chipPos, chipMoving, chipArrivedOnHeldTrapThisTick)
    ) {
      currentInputCode = 0;
      queuedReplayInputCode = 0;
    }
    const requestedInputCode = chipMoveSelection.requestedInputCode;
    if (replay && requestedInputCode !== 0 && !heldButtonConsumedReplayInput) {
      state.lastMove = {
        code: rawRequestedInputCode,
        name: runtimeCommandName(rawRequestedInputCode),
      };
    }
    const chosenInputCode = chipMoveSelection.chosenInputCode;
    queuedChipInputCode = 0;
    const startInputCode = chipMoveSelection.startInputCode;

    if (startInputCode === 0 && !chipMoveSelection.startAirMove && !chipMoveSelection.startElevatorMove && chipMoving === 0) {
      if (!lynxRuntimeState(state).trapReleaseCantMoveThisTick) {
        clearLynxCouldntMove(state);
      }
      resetLynxFloorSounds(state);
    }

    if (chipMoving === 0 && chipMoveSelection.startAirMove) {
      const airborne = startLynxChipAirMovement(state, chipPos, chipZ);
      chipPos = airborne.chipPos;
      chipZ = airborne.chipZ;
      chipMoving = airborne.chipMoving;
      chipMoveKind = airborne.chipMoveKind;
      clearLynxCouldntMove(state);
    } else if (chipMoving === 0 && chipMoveSelection.startElevatorMove) {
      const elevated = startLynxChipElevatorMovement(state, level, actors, chipPos, chipZ, chipDir);
      chipPos = elevated.chipPos;
      chipZ = elevated.chipZ;
      chipMoving = elevated.chipMoving;
      chipMoveKind = elevated.chipMoveKind;
      if (elevated.chipMoving > 0) {
        clearLynxCouldntMove(state);
      }
    } else if (chipMoving === 0 && startInputCode !== 0) {
      updateLynxChipStartMovementState(state, floorBeforeMove, chosenInputCode);
      if (canLynxExitTile(state, floorBeforeMove, MS_TILE.Chip, startInputCode, false)) {
        if (!canAdvanceLynxPosition(chipPos, startInputCode, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
          chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
          addLynxCantMove(state);
        } else {
          const targetPos = nextPosition(chipPos, startInputCode, MS_GRID_WIDTH);
          const target = state.map.cells[targetPos];
          const targetBlock =
            target === undefined
              ? null
              : findVisibleActorOnFlaggedTopCell(state.map.cells, actors, targetPos, LYNX_CELL_FLAG.Claimed, (actor) => actor.id === MS_TILE.Block) ??
                null;
          const canPushIntoClaimedCell = targetBlock
            ? canLynxChipPushIntoClaimedCell(state, targetPos, startInputCode)
            : false;
          const pushedBlock =
            targetBlock && canPushIntoClaimedCell
              ? tryPushLynxBlock(state, level, actors, targetPos, startInputCode)
              : false;
          const canEnterTarget =
            !!target &&
            (targetBlock
              ? pushedBlock && (revealLynxHiddenWall(state, targetPos) ? false : canLynxChipEnterCell(state, targetPos, startInputCode))
              : revealLynxHiddenWall(state, targetPos)
                ? false
                : canLynxChipEnterCell(state, targetPos, startInputCode));
          if (canEnterTarget) {
            clearLynxCouldntMove(state);
            chipDir = startInputCode;
            chipPos = targetPos;
            chipMoving = 8;
            chipMoveKind = "planar";
          } else {
            chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
            addLynxCantMove(state);
          }
        }
      } else {
        chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
        addLynxCantMove(state);
      }
    }

    const postMove = resolveLynxPostChipMovement(
      state,
      level,
      actors,
      chipPos,
      chipDir,
      chipMoving,
      chipMoveKind,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    );
    chipPos = postMove.chipPos;
    chipDir = postMove.chipDir;
    chipMoving = postMove.chipMoving;
    chipMoveKind = postMove.chipMoveKind;
    endGameTicksElapsed = postMove.endGameTicksElapsed;
    endGameResult = postMove.endGameResult;
    endGameAnimationTileId = postMove.endGameAnimationTileId;
    endGameAnimationFrame = postMove.endGameAnimationFrame;
    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.postTeleportResolution, (phase) =>
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        0,
        tick,
        phase,
      ),
    );

    const finalizedEndGame = finalizeLynxTickBookkeeping(
      state,
      chipPos,
      chipDir,
      chipMoving,
      chipMoveKind,
      endGameTicksElapsed,
      endGameResult,
    );

    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.postPutwallResolution, (phase) =>
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        0,
        tick,
        phase,
      ),
    );
    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.final, (phase) =>
      projectLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, 0, tick, phase),
    );

    endGameTicksElapsed = finalizedEndGame.endGameTicksElapsed;
    endGameResult = finalizedEndGame.endGameResult;

    if (includeStep(tick)) {
      steps.push({
        ...engineStateToSnapshot(
          state,
          "tick",
          createRuntimeCommand(scheduled?.inputCode ?? 0, scheduled ? scheduled.tick : -1),
        ),
        phases,
      });
    }
    if (state.status !== "playing") {
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
      status: steps[steps.length - 1]?.status ?? initialState.status,
      finalTick: steps[steps.length - 1]?.currentTime ?? initialState.currentTime,
    },
  });
}
