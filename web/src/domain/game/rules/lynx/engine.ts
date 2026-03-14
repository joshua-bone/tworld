import type { EngineMapCell, EngineState } from "@domain/game/model";
import type { GameDebugPhaseSnapshot, GameDebugTrace } from "@domain/game/debug";
import { findHiddenActorAtPosition, findVisibleActorAtPosition, storeActorInReusableHiddenSlot } from "@domain/game/core/actors";
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
} from "@domain/game/core/board";
import { findVisibleActorOnFlaggedTopCell } from "@domain/game/core/occupancy";
import {
  advanceToCell,
  advancePositionIfPossible,
  canAdvancePosition as canAdvanceLynxPosition,
  directionCode,
  directionDelta,
  directionName,
  isDiagonalInput,
  isDirectionalInput,
  isPositionInBounds as inBounds,
  nextPosition,
  reverseDirection as backDirection,
  roundedBoardPosition,
} from "@domain/game/core/grid";
import { mapHash } from "@domain/game/hash";
import { createReplayPlan, createRuntimeCommand, plannedReplayInput, recordManualMove, runtimeCommandName } from "@domain/game/playback";
import { getGameInputNameFromCode } from "@domain/game/command";
import { engineStateToSnapshot } from "@domain/game/snapshot";
import { createGameDebugTrace, createGameTrace } from "@domain/game/trace";
import { projectLynxDebugPhaseSnapshot } from "@domain/game/rules/lynx/debugProjection";
import {
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_STATUS_FLAG,
  MS_TILE,
  isMsBoots,
  isMsCreature,
  isMsKey,
  msCreatureDir,
  msCreatureId,
} from "@domain/game/rules/ms/tiles";
import type { GameCommand, GameRequest, GameTrace } from "@domain/game/types";
import type { ReplaySolutionPayload } from "@domain/game/codec";
import type { LynxLevel } from "@domain/game/rules/lynx/level";
import type { GameRuntimeCommand } from "@domain/game/types";
import type { SolutionMove } from "@domain/solution-file";

const LYNX_DEBUG_SCHEMA_VERSION = 2;
const LYNX_REPLAY_MOVE_TICK_MASK = 0x7fffff;

export interface LynxInteractiveSessionState {
  level: LynxLevel;
  state: EngineState;
  lastInput: GameRuntimeCommand;
  recordedMoves: SolutionMove[];
  replayPlan: ReturnType<typeof createReplayPlan> | null;
  chipPos: number;
  chipDir: number;
  chipMoving: number;
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
  dir: number;
  intentDir: number;
  forcedDir: number;
  teleported: boolean;
  moving: number;
  frame: number;
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

interface LynxRuntimeState {
  toggleWallsPending: boolean;
  animations: LynxAnimationState[];
  chipTeleported: boolean;
  chipSlideToken: boolean;
  couldntMove: boolean;
  trapReleaseCantMoveThisTick: boolean;
  lastRandomSlideDir: number;
}

const LYNX_CELL_FLAG = {
  Beartrap: 0x01,
  Teleport: 0x02,
  Animated: 0x20,
  Claimed: 0x40,
} as const;

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
    if (cell.top.id === MS_TILE.Beartrap) {
      cell.top.state |= LYNX_CELL_FLAG.Beartrap;
    }
    if (cell.top.id === MS_TILE.Teleport) {
      cell.top.state |= LYNX_CELL_FLAG.Teleport;
    }
  }

  return stripped;
}

function findChipPosition(cells: EngineMapCell[]): number {
  for (const cell of cells) {
    if (
      (isMsCreature(cell.top.id) && msCreatureId(cell.top.id) === MS_TILE.Chip) ||
      (isMsCreature(cell.bottom.id) && msCreatureId(cell.bottom.id) === MS_TILE.Chip)
    ) {
      return cell.position.pos;
    }
  }
  return 0;
}

function findChipDirection(cells: EngineMapCell[]): number {
  for (const cell of cells) {
    if (isMsCreature(cell.top.id) && msCreatureId(cell.top.id) === MS_TILE.Chip) {
      return msCreatureDir(cell.top.id);
    }
    if (isMsCreature(cell.bottom.id) && msCreatureId(cell.bottom.id) === MS_TILE.Chip) {
      return msCreatureDir(cell.bottom.id);
    }
  }

  return 0;
}

function parseLynxActors(level: LynxLevel): LynxRuntimeActor[] {
  const scanned: LynxRuntimeActor[] = [];

  for (const cell of level.cells) {
    const tile = cell.top;
    if (tile.id === MS_TILE.Block_Static) {
      scanned.push({
        id: MS_TILE.Block,
        pos: cell.position.pos,
        dir: 1,
        intentDir: 0,
        forcedDir: 0,
        teleported: false,
        moving: 0,
        frame: 0,
        hidden: false,
        pushed: false,
        deferPush: false,
        deferPushArmed: false,
        reversePending: false,
        dormant: !level.creaturePositions.includes(cell.position.pos),
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
      dir: msCreatureDir(tile.id),
      intentDir: 0,
      forcedDir: 0,
      teleported: false,
      moving: 0,
      frame: 0,
      hidden: false,
      pushed: false,
      deferPush: false,
      deferPushArmed: false,
      reversePending: false,
      dormant: false,
      animationReserved: false,
    });
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
      chipTeleported: false,
      chipSlideToken: false,
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
    actor.pos -= directionDelta(actor.dir, MS_GRID_WIDTH);
    actor.moving = 0;
  }

  if (actor.pushed) {
    actor.pushed = false;
    state.soundEffects &= ~(1 << LYNX_SOUND.BlockMoving);
  }

  actor.hidden = true;
  actor.frame = 0;
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
): {
  chipPos: number;
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
} {
  if (collidedActor && !collidedActor.hidden) {
    removeTopTileFlags(state.map.cells, collidedActor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, collidedActor, LYNX_ANIMATION_TILE.Entity_Explosion);
  }

  if (chipMoving > 0) {
    chipPos -= directionDelta(chipDir, MS_GRID_WIDTH);
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
  switch (tileId) {
    case MS_TILE.Empty:
    case MS_TILE.Slide_North:
    case MS_TILE.Slide_West:
    case MS_TILE.Slide_South:
    case MS_TILE.Slide_East:
    case MS_TILE.Slide_Random:
    case MS_TILE.Ice:
    case MS_TILE.Water:
    case MS_TILE.Fire:
    case MS_TILE.Bomb:
    case MS_TILE.Beartrap:
    case MS_TILE.Burglar:
    case MS_TILE.HintButton:
    case MS_TILE.Button_Blue:
    case MS_TILE.Button_Green:
    case MS_TILE.Button_Red:
    case MS_TILE.Button_Brown:
    case MS_TILE.Teleport:
    case MS_TILE.Door_Red:
    case MS_TILE.Door_Blue:
    case MS_TILE.Door_Yellow:
    case MS_TILE.Door_Green:
    case MS_TILE.Socket:
    case MS_TILE.Exit:
    case MS_TILE.ICChip:
    case MS_TILE.Key_Red:
    case MS_TILE.Key_Blue:
    case MS_TILE.Key_Yellow:
    case MS_TILE.Key_Green:
    case MS_TILE.Boots_Ice:
    case MS_TILE.Boots_Slide:
    case MS_TILE.Boots_Fire:
    case MS_TILE.Boots_Water:
    case MS_TILE.Gravel:
    case MS_TILE.Dirt:
    case MS_TILE.BlueWall_Fake:
    case MS_TILE.SwitchWall_Open:
    case MS_TILE.PopupWall:
      return 1 | 2 | 4 | 8;
    case MS_TILE.IceWall_Northwest:
      return 4 | 8;
    case MS_TILE.IceWall_Northeast:
      return 4 | 2;
    case MS_TILE.IceWall_Southwest:
      return 1 | 8;
    case MS_TILE.IceWall_Southeast:
      return 1 | 2;
    case MS_TILE.Wall_North:
      return 1 | 2 | 8;
    case MS_TILE.Wall_West:
      return 1 | 2 | 4;
    case MS_TILE.Wall_South:
      return 2 | 4 | 8;
    case MS_TILE.Wall_East:
      return 1 | 4 | 8;
    case MS_TILE.Wall_Southeast:
      return 4 | 8;
    default:
      return 0;
  }
}

function lynxBlockOrCreatureEntryMask(tileId: number, kind: "block" | "creature"): number {
  switch (tileId) {
    case MS_TILE.Empty:
    case MS_TILE.Slide_North:
    case MS_TILE.Slide_West:
    case MS_TILE.Slide_South:
    case MS_TILE.Slide_East:
    case MS_TILE.Slide_Random:
    case MS_TILE.Ice:
    case MS_TILE.Water:
    case MS_TILE.Fire:
    case MS_TILE.Bomb:
    case MS_TILE.Beartrap:
    case MS_TILE.Button_Blue:
    case MS_TILE.Button_Green:
    case MS_TILE.Button_Red:
    case MS_TILE.Button_Brown:
    case MS_TILE.Teleport:
    case MS_TILE.SwitchWall_Open:
      return 1 | 2 | 4 | 8;
    case MS_TILE.IceWall_Northwest:
      return 4 | 8;
    case MS_TILE.IceWall_Northeast:
      return 4 | 2;
    case MS_TILE.IceWall_Southwest:
      return 1 | 8;
    case MS_TILE.IceWall_Southeast:
      return 1 | 2;
    case MS_TILE.Wall_North:
      return 1 | 2 | 8;
    case MS_TILE.Wall_West:
      return 1 | 2 | 4;
    case MS_TILE.Wall_South:
      return 2 | 4 | 8;
    case MS_TILE.Wall_East:
      return 1 | 4 | 8;
    case MS_TILE.Wall_Southeast:
      return 4 | 8;
    case MS_TILE.Gravel:
      return kind === "block" ? 1 | 2 | 4 | 8 : 0;
    case MS_TILE.Key_Red:
    case MS_TILE.Key_Blue:
      return 1 | 2 | 4 | 8;
    default:
      return 0;
  }
}

function canLynxCreatureEnter(tileId: number, actorId: number, dir: number): boolean {
  const mask = lynxBlockOrCreatureEntryMask(tileId, actorId === MS_TILE.Block ? "block" : "creature");
  if ((mask & dir) === 0) {
    return false;
  }
  if (tileId === MS_TILE.Fire && actorId !== MS_TILE.Fireball && actorId !== MS_TILE.Block) {
    return false;
  }
  return true;
}

function effectiveLynxTargetTileId(state: EngineState, tileId: number): number {
  if (!lynxRuntimeState(state).toggleWallsPending) {
    return tileId;
  }
  if (tileId === MS_TILE.SwitchWall_Open || tileId === MS_TILE.SwitchWall_Closed) {
    return tileId ^ (MS_TILE.SwitchWall_Open ^ MS_TILE.SwitchWall_Closed);
  }
  return tileId;
}

function canLynxExitTile(state: EngineState, tileId: number, actorId: number, dir: number, releasing: boolean): boolean {
  switch (tileId) {
    case MS_TILE.Wall_North:
      return dir !== 1;
    case MS_TILE.Wall_West:
      return dir !== 2;
    case MS_TILE.Wall_South:
      return dir !== 4;
    case MS_TILE.Wall_East:
      return dir !== 8;
    case MS_TILE.Wall_Southeast:
      return (dir & (4 | 8)) === 0;
    case MS_TILE.IceWall_Northwest:
      return (dir & (4 | 8)) === 0;
    case MS_TILE.IceWall_Northeast:
      return (dir & (4 | 2)) === 0;
    case MS_TILE.IceWall_Southwest:
      return (dir & (1 | 8)) === 0;
    case MS_TILE.IceWall_Southeast:
      return (dir & (1 | 2)) === 0;
    case MS_TILE.Beartrap:
    case MS_TILE.CloneMachine:
      return releasing;
    default:
      if (isLynxSlide(tileId) && (actorId !== MS_TILE.Chip || !hasLynxBoots(state, MS_TILE.Boots_Slide))) {
        return getLynxSlideDirection(state, tileId, false) !== backDirection(dir);
      }
      return true;
  }
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

  if (isMsKey(tile.id)) {
    state.inventory.keys[Math.max(0, Math.min(3, tile.id - MS_TILE.Key_Red))] += 1;
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.map.hash = mapHash(state.map.cells);
    return 1 << LYNX_SOUND.ItemCollected;
  }

  if (isMsBoots(tile.id)) {
    state.inventory.boots[Math.max(0, Math.min(3, tile.id - MS_TILE.Boots_Ice))] += 1;
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.map.hash = mapHash(state.map.cells);
    return 1 << LYNX_SOUND.ItemCollected;
  }

  return 0;
}

function lynxDoorKeyIndex(tileId: number): number {
  switch (tileId) {
    case MS_TILE.Door_Red:
      return 0;
    case MS_TILE.Door_Blue:
      return 1;
    case MS_TILE.Door_Yellow:
      return 2;
    case MS_TILE.Door_Green:
      return 3;
    default:
      return -1;
  }
}

function hasLynxBoots(state: EngineState, tileId: number): boolean {
  switch (tileId) {
    case MS_TILE.Boots_Ice:
      return state.inventory.boots[0] > 0;
    case MS_TILE.Boots_Slide:
      return state.inventory.boots[1] > 0;
    case MS_TILE.Boots_Fire:
      return state.inventory.boots[2] > 0;
    case MS_TILE.Boots_Water:
      return state.inventory.boots[3] > 0;
    default:
      return false;
  }
}

function lynxChipMovementSpeed(state: EngineState, floorId: number): number {
  let speed = 2;

  if (isLynxSlide(floorId) && !hasLynxBoots(state, MS_TILE.Boots_Slide)) {
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
  if (keyIndex >= 0) {
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
  if (keyIndex >= 0) {
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
    const block =
      findVisibleActorOnFlaggedTopCell(state.map.cells, actors, targetPos, LYNX_CELL_FLAG.Claimed, (actor) => actor.id === MS_TILE.Block) ??
      null;
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
          horizontalProbe.pushBlockPos !== null ? findLynxBlockActor(actors, horizontalProbe.pushBlockPos) : null;
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
  const block = findLynxBlockActor(actors, targetPos);
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

  const block = findLynxBlockActor(actors, targetPos);
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
      horizontalProbe.pushBlockPos !== null ? findLynxBlockActor(actors, horizontalProbe.pushBlockPos) : null;
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
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  floorBeforeMove: number;
  rawRequestedInputCode: number;
  requestedInputCode: number;
  chosenInputCode: number;
  forcedInputCode: number;
  startInputCode: number;
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
    topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) === MS_TILE.Beartrap
  );
}

function suppressLynxChipMoveSelectionForHeldTrapArrival(selection: LynxChipMoveSelection): LynxChipMoveSelection {
  return {
    ...selection,
    requestedInputCode: 0,
    chosenInputCode: 0,
    forcedInputCode: 0,
    startInputCode: 0,
  };
}

function selectLynxChipMoveForTick(
  state: EngineState,
  level: LynxLevel,
  actors: LynxRuntimeActor[],
  chipPos: number,
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
    chipMoving === 0 && !chipInEndGame ? getLynxChipForcedMove(state, floorBeforeMove, chipDir) : { dir: 0, discardInput: false };
  const rawRequestedInputCode = chipMoving === 0 ? queuedReplayInputCode || currentInputCode : 0;
  const requestedInputCode = chipMoving === 0 && !chipInEndGame && !forcedMove.discardInput ? rawRequestedInputCode : 0;
  const chosenInputCode =
    chipMoving === 0 && requestedInputCode !== 0
      ? queuedChipInputCode || resolveLynxChipInputDirection(state, level, actors, chipPos, chipDir, requestedInputCode)
      : 0;

  return {
    chipPos,
    chipDir,
    chipMoving,
    endGameTicksElapsed,
    floorBeforeMove,
    rawRequestedInputCode,
    requestedInputCode,
    chosenInputCode,
    forcedInputCode: forcedMove.dir,
    startInputCode: chipMoving === 0 ? chosenInputCode || forcedMove.dir : 0,
  };
}

function resolveLynxButtonEffects(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], pos: number, tileId: number): number {
  switch (tileId) {
    case MS_TILE.Button_Blue:
      queueLynxTankReversals(state, actors);
      return 1 << LYNX_SOUND.ButtonPushed;
    case MS_TILE.Button_Green:
      lynxRuntimeState(state).toggleWallsPending = !lynxRuntimeState(state).toggleWallsPending;
      return 1 << LYNX_SOUND.ButtonPushed;
    case MS_TILE.Button_Red:
      return activateLynxCloner(state, level, actors, pos) ? 1 << LYNX_SOUND.ButtonPushed : 0;
    case MS_TILE.Button_Brown:
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
  let soundEffects = 0;

  if (tileId === MS_TILE.Beartrap) {
    soundEffects |= 1 << LYNX_SOUND.TrapEntered;
  }

  soundEffects |= resolveLynxButtonEffects(state, level, actors, pos, tileId);
  return soundEffects;
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
  if (keyIndex >= 0 && state.inventory.keys[keyIndex] > 0) {
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

  if (cell.top.id === MS_TILE.Socket && state.inventory.chipsNeeded === 0) {
    promoteBottomTile(state.map.cells, pos, MS_TILE.Empty);
    state.map.hash = mapHash(state.map.cells);
    return {
      soundEffects: 1 << LYNX_SOUND.SocketOpened,
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.Dirt || cell.top.id === MS_TILE.BlueWall_Fake) {
    replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Empty });
    state.map.hash = mapHash(state.map.cells);
    return {
      soundEffects: 1 << LYNX_SOUND.TileEmptied,
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.PopupWall) {
    replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
    state.map.hash = mapHash(state.map.cells);
    return {
      soundEffects: 1 << LYNX_SOUND.WallCreated,
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.Burglar) {
    state.inventory.boots = [0, 0, 0, 0];
    return {
      soundEffects: 1 << LYNX_SOUND.BootsStolen,
      completed: false,
    };
  }

  if (
    cell.top.id === MS_TILE.Button_Blue ||
    cell.top.id === MS_TILE.Button_Green ||
    cell.top.id === MS_TILE.Button_Red ||
    cell.top.id === MS_TILE.Button_Brown
  ) {
    return {
      soundEffects: resolveLynxButtonEffects(state, level, actors, pos, cell.top.id),
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.Beartrap) {
    return {
      soundEffects: 1 << LYNX_SOUND.TrapEntered,
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.Exit) {
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

  if (floorAfterMove === MS_TILE.Water && !hasLynxBoots(state, MS_TILE.Boots_Water)) {
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

  if (floorAfterMove === MS_TILE.Fire && !hasLynxBoots(state, MS_TILE.Boots_Fire)) {
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

  if (floorAfterMove === MS_TILE.Bomb) {
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
  if (floorAfterMove === MS_TILE.Button_Brown) {
    springLynxTrap(state, level, actors, chipPos);
  }
  if (isLynxIce(resolvedFloorAfterMove)) {
    chipDir = applyLynxIceWallTurn(chipDir, resolvedFloorAfterMove);
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
    if (cell.top.id === MS_TILE.SwitchWall_Open || cell.top.id === MS_TILE.SwitchWall_Closed) {
      cell.top.id ^= MS_TILE.SwitchWall_Open ^ MS_TILE.SwitchWall_Closed;
    }
    if (cell.bottom.id === MS_TILE.SwitchWall_Open || cell.bottom.id === MS_TILE.SwitchWall_Closed) {
      cell.bottom.id ^= MS_TILE.SwitchWall_Open ^ MS_TILE.SwitchWall_Closed;
    }
  }
}

function isLynxIce(tileId: number): boolean {
  return (
    tileId === MS_TILE.Ice ||
    tileId === MS_TILE.IceWall_Northwest ||
    tileId === MS_TILE.IceWall_Northeast ||
    tileId === MS_TILE.IceWall_Southwest ||
    tileId === MS_TILE.IceWall_Southeast
  );
}

function isLynxSlide(tileId: number): boolean {
  return (
    tileId === MS_TILE.Slide_North ||
    tileId === MS_TILE.Slide_West ||
    tileId === MS_TILE.Slide_South ||
    tileId === MS_TILE.Slide_East ||
    tileId === MS_TILE.Slide_Random
  );
}

function getLynxSlideDirection(state: EngineState, floorId: number, advance: boolean): number {
  switch (floorId) {
    case MS_TILE.Slide_North:
      return 1;
    case MS_TILE.Slide_West:
      return 2;
    case MS_TILE.Slide_South:
      return 4;
    case MS_TILE.Slide_East:
      return 8;
    case MS_TILE.Slide_Random: {
      const runtime = lynxRuntimeState(state);
      if (advance) {
        runtime.lastRandomSlideDir = right(runtime.lastRandomSlideDir || 1);
      }
      return runtime.lastRandomSlideDir || 1;
    }
    default:
      return 0;
  }
}

function applyLynxIceWallTurn(dir: number, floorId: number): number {
  switch (floorId) {
    case MS_TILE.IceWall_Northeast:
      return dir === 4 ? 8 : dir === 2 ? 1 : dir;
    case MS_TILE.IceWall_Southwest:
      return dir === 1 ? 2 : dir === 8 ? 4 : dir;
    case MS_TILE.IceWall_Northwest:
      return dir === 4 ? 2 : dir === 8 ? 1 : dir;
    case MS_TILE.IceWall_Southeast:
      return dir === 1 ? 8 : dir === 2 ? 4 : dir;
    default:
      return dir;
  }
}

function getLynxChipForcedMove(
  state: EngineState,
  floorId: number,
  chipDir: number,
): {
  dir: number;
  discardInput: boolean;
} {
  const runtime = lynxRuntimeState(state);
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
    return hasLynxBoots(state, MS_TILE.Boots_Ice)
      ? { dir: 0, discardInput: false }
      : { dir: chipDir, discardInput: true };
  }
  return { dir: 0, discardInput: false };
}

function forcedLynxActorDirection(state: EngineState, actor: LynxRuntimeActor, floorId: number, currentTime: number): number {
  if (currentTime === 0) {
    return 0;
  }
  if (isLynxSlide(floorId)) {
    return getLynxSlideDirection(state, floorId, true);
  }
  if (isLynxIce(floorId)) {
    return actor.dir;
  }
  return 0;
}

function updateLynxChipStartMovementState(state: EngineState, floorId: number, chosenInputCode: number): void {
  const runtime = lynxRuntimeState(state);

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

function updateLynxViewFromMovement(state: EngineState, chipPos: number, chipDir: number, chipMoving: number): void {
  let viewX = (chipPos % MS_GRID_WIDTH) * 8;
  let viewY = Math.floor(chipPos / MS_GRID_WIDTH) * 8;

  if (chipMoving > 0) {
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
    if (cell?.top.id !== MS_TILE.Teleport) {
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
  const block = findLynxBlockActor(actors, exitPos);
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
      const exitBlock =
        findVisibleActorOnFlaggedTopCell(state.map.cells, actors, exitPos, LYNX_CELL_FLAG.Claimed, (actor) => actor.id === MS_TILE.Block) ??
        null;
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
    if (cell?.top.id !== MS_TILE.Teleport) {
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
    if (topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty) !== MS_TILE.Teleport) {
      continue;
    }
    resolveLynxActorTeleport(state, actor);
  }

  if (chipMoving === 0 && topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) === MS_TILE.Teleport) {
    chipPos = resolveLynxChipTeleport(state, actors, chipPos, chipDir);
  }

  return chipPos;
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

  if (floor === MS_TILE.CloneMachine || floor === MS_TILE.Beartrap) {
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
    const fallbackDirs =
      Math.abs(dx) > Math.abs(dy)
        ? [horizontal, vertical]
        : [vertical, horizontal];

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

  const targetPos = actor.pos + directionDelta(dir, MS_GRID_WIDTH);
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

  if (isLynxIce(cell.top.id)) {
    actor.dir = applyLynxIceWallTurn(actor.dir, cell.top.id);
  }

  if (actor.id === MS_TILE.Block) {
    if (cell.top.id === MS_TILE.Water) {
      replaceTopTile(state.map.cells, actor.pos, { ...cell.top, id: MS_TILE.Dirt });
      removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      removeLynxActor(state, actors, actor, LYNX_ANIMATION_TILE.Water_Splash);
      state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
    } else if (cell.top.id === MS_TILE.Bomb) {
      promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
      removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      removeLynxActor(state, actors, actor, LYNX_ANIMATION_TILE.Bomb_Explosion);
      state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
    } else if (cell.top.id === MS_TILE.Key_Blue) {
      promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
      addTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    }
    actor.deferPush = false;
    actor.deferPushArmed = false;
    state.soundEffects |= resolveLynxCreatureArrivalEffects(state, level, actors, actor.pos, cell.top.id);
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (cell.top.id === MS_TILE.Water && actor.id !== MS_TILE.Glider) {
    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, actor, LYNX_ANIMATION_TILE.Water_Splash);
    state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (cell.top.id === MS_TILE.Bomb) {
    promoteBottomTile(state.map.cells, actor.pos, MS_TILE.Empty);
    removeTopTileFlags(state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    removeLynxActor(state, actors, actor, LYNX_ANIMATION_TILE.Bomb_Explosion);
    state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (cell.top.id === MS_TILE.Key_Blue) {
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
): void {
  if (actor.hidden) {
    return;
  }

  if (actor.moving <= 0) {
    const floorBeforeMove = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
    const moveDir = actor.intentDir || actor.forcedDir || forcedLynxActorDirection(state, actor, floorBeforeMove, currentTime);
    actor.intentDir = 0;
    actor.forcedDir = 0;
    if (moveDir === 0 || !startLynxCreatureMovement(state, actors, actor, moveDir)) {
      return;
    }
  }

  const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
  let speed = actor.id === MS_TILE.Blob ? 1 : 2;
  if (isLynxSlide(floor) || isLynxIce(floor)) {
    speed *= 2;
  }
  actor.moving = Math.max(0, actor.moving - speed);
  actor.frame = Math.trunc(actor.moving / 2);
  if (actor.moving === 0) {
    finishLynxActorMovement(state, level, actors, actor);
  }
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

function findLynxBlockActor(actors: LynxRuntimeActor[], pos: number): LynxRuntimeActor | null {
  return findVisibleActorAtPosition(actors, pos, (actor) => actor.id === MS_TILE.Block) ?? null;
}

function findLynxVisibleActorAt(actors: LynxRuntimeActor[], pos: number): LynxRuntimeActor | null {
  return findVisibleActorAtPosition(actors, pos) ?? null;
}

function resolveLynxChipCollision(
  state: EngineState,
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

  const actor = findLynxVisibleActorAt(actors, chipPos);
  if (!actor) {
    return {
      chipPos,
      endGameTicksElapsed,
      endGameResult,
      endGameAnimationTileId,
      endGameAnimationFrame,
    };
  }

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
  );
}

function allocateLynxActorSlot(actors: LynxRuntimeActor[], actor: LynxRuntimeActor): LynxRuntimeActor {
  return storeActorInReusableHiddenSlot(actors, actor, (entry) => !entry.animationReserved);
}

function findLynxClonerTarget(level: LynxLevel, buttonPos: number): number | null {
  return level.cloners.find((connection) => connection.from === buttonPos)?.to ?? null;
}

function findLynxTrapTarget(level: LynxLevel, buttonPos: number): number | null {
  return level.traps.find((connection) => connection.from === buttonPos)?.to ?? null;
}

function queueLynxTankReversals(state: EngineState, actors: LynxRuntimeActor[]): void {
  for (const actor of actors) {
    if (actor.hidden || actor.id !== MS_TILE.Tank) {
      continue;
    }
    const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
    if (floor === MS_TILE.CloneMachine || isLynxIce(floor)) {
      continue;
    }
    actor.reversePending = !actor.reversePending;
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
  const block = findLynxBlockActor(actors, pos);
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

  const floor = topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty);
  return currentTime === 0 || (!isLynxSlide(floor) && !isLynxIce(floor));
}

function activateLynxCloner(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], buttonPos: number): boolean {
  const sourcePos = findLynxClonerTarget(level, buttonPos);
  if (sourcePos === null || sourcePos < 0 || sourcePos >= state.map.cells.length) {
    return false;
  }

  if (state.map.cells[sourcePos]?.top.id !== MS_TILE.CloneMachine) {
    return false;
  }

  const sourceActor = findLynxVisibleActorAt(actors, sourcePos);
  if (!sourceActor || sourceActor.dir === 0) {
    return false;
  }

  const sourceSnapshot: LynxRuntimeActor = {
    ...sourceActor,
    intentDir: 0,
    forcedDir: 0,
    teleported: false,
    moving: 0,
    frame: 0,
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
}

function springLynxTrap(state: EngineState, level: LynxLevel, actors: LynxRuntimeActor[], buttonPos: number): boolean {
  const sourcePos = findLynxTrapTarget(level, buttonPos);
  if (sourcePos === null || sourcePos < 0 || sourcePos >= state.map.cells.length) {
    return false;
  }
  if (topTileIdOr(state.map.cells, sourcePos, MS_TILE.Empty) !== MS_TILE.Beartrap) {
    return false;
  }

  const sourceActor = findLynxVisibleActorAt(actors, sourcePos);
  if (!sourceActor || sourceActor.dir === 0) {
    return false;
  }

  if (sourceActor.moving <= 0 && !startLynxCreatureMovement(state, actors, sourceActor, sourceActor.dir, true)) {
    return false;
  }

  advanceLynxCreature(state, level, actors, sourceActor, state.timer.currentTime + 1);
  return true;
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
  if (topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) !== MS_TILE.Beartrap || chipDir === 0) {
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
    const targetPos = chipPos + directionDelta(chipDir, MS_GRID_WIDTH);
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

  const trapPos = findLynxTrapTarget(level, buttonPos);
  springLynxTrap(state, level, actors, buttonPos);
  if (trapPos === nextChipPos && topTileIdOr(state.map.cells, nextChipPos, MS_TILE.Empty) === MS_TILE.Beartrap) {
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
      topTileIdOr(state.map.cells, nextChipPos, MS_TILE.Empty) === MS_TILE.Beartrap;
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
  const sourceCells = cloneBoardCells(level.cells);
  const cells = stripCreaturesForInitialHash(sourceCells);
  const chipPos = findChipPosition(sourceCells);
  const initialStatusFlags =
    (level.statusFlags & ~MS_STATUS_FLAG.ShowHint) |
    (topTileIdOr(cells, chipPos, MS_TILE.Empty) === MS_TILE.HintButton ? MS_STATUS_FLAG.ShowHint : 0);
  const randomSeed = normalizeRandomSeed(replay?.randomSeed ?? request.randomSeed);

  return {
    request: { ...request },
    status: "playing",
    timer: {
      tick: -1,
      currentTime: -1,
      timeOffset: 0,
      secondsPlayed: 0,
      timeLimit: level.timeLimitTicks,
    },
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
  return {
    level,
    state: initializeLynxEngineState(request, level, replay),
    lastInput: createRuntimeCommand(0, -1),
    recordedMoves: replay ? replay.moves.map((move) => ({ ...move })) : [],
    replayPlan: replay ? createReplayPlan(replay) : null,
    chipPos: findChipPosition(level.cells),
    chipDir: findChipDirection(level.cells),
    chipMoving: 0,
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

function advanceLynxInteractiveTick(
  session: LynxInteractiveSessionState,
  scheduledInputCode: number | null,
): LynxInteractiveSessionState {
  const replayMode = session.replayPlan !== null;
  const state = session.state;
  const level = session.level;
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
  let chipDir = session.chipDir;
  let chipMoving = session.chipMoving;
  let currentInputCode = session.currentInputCode;
  let queuedReplayInputCode = session.queuedReplayInputCode;
  let queuedChipInputCode = session.queuedChipInputCode;
  let chipPushing = false;
  const actors = session.actors;
  let endGameTicksElapsed = session.endGameTicksElapsed;
  let endGameResult = session.endGameResult;
  let endGameAnimationTileId = session.endGameAnimationTileId;
  let endGameAnimationFrame = session.endGameAnimationFrame;

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

  let chipArrivedOnHeldTrapThisTick = false;

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
    chipMoving === 0 && topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) !== MS_TILE.Beartrap
      ? selectLynxChipMoveForTick(
          state,
          level,
          actors,
          chipPos,
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
  if (replayMode && latchedChipMoveSelection && latchedChipMoveSelection.requestedInputCode !== 0 && queuedReplayInputCode === 0) {
    state.lastMove = {
      code: latchedChipMoveSelection.rawRequestedInputCode,
      name: runtimeCommandName(latchedChipMoveSelection.rawRequestedInputCode),
    };
  }

  const chipOnBeartrapBeforeCreatureMovement =
    chipMoving === 0 && topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) === MS_TILE.Beartrap;
  const chipHasPreCreatureMoveQueued =
    (latchedChipMoveSelection !== null && latchedChipMoveSelection.startInputCode !== 0) ||
    (chipOnBeartrapBeforeCreatureMovement &&
      (queuedChipInputCode !== 0 || queuedReplayInputCode !== 0 || currentInputCode !== 0));
  if (!chipHasPreCreatureMoveQueued) {
    clearLynxCouldntMove(state);
  }

  for (let index = actors.length - 1; index >= 0; index -= 1) {
    const actor = actors[index]!;
    if (!skipsDormantLynxActorAdvance(state, actor, state.timer.currentTime + 1)) {
      advanceLynxCreature(state, level, actors, actor, state.timer.currentTime + 1);
    }
    actor.intentDir = 0;
    actor.forcedDir = 0;
    if (
      !actor.hidden &&
      actor.moving <= 0 &&
      topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty) === MS_TILE.Button_Brown
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

  const chipMoveSelection =
    (() => {
      const selection =
        latchedChipMoveSelection &&
        chipPos === latchedChipMoveSelection.chipPos &&
        chipDir === latchedChipMoveSelection.chipDir &&
        chipMoving === latchedChipMoveSelection.chipMoving &&
        endGameTicksElapsed === latchedChipMoveSelection.endGameTicksElapsed
          ? latchedChipMoveSelection
          : selectLynxChipMoveForTick(
              state,
              level,
              actors,
              chipPos,
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
  }
  const chosenInputCode = chipMoveSelection.chosenInputCode;
  queuedChipInputCode = 0;
  const startInputCode = chipMoveSelection.startInputCode;

  if (startInputCode === 0 && chipMoving === 0) {
    if (!lynxRuntimeState(state).trapReleaseCantMoveThisTick) {
      clearLynxCouldntMove(state);
    }
    resetLynxFloorSounds(state);
  }

  if (chipMoving === 0 && startInputCode !== 0) {
    updateLynxChipStartMovementState(state, floorBeforeMove, chosenInputCode);
    if (canLynxExitTile(state, floorBeforeMove, MS_TILE.Chip, startInputCode, false)) {
      if (!canAdvanceLynxPosition(chipPos, startInputCode, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
        chipPushing = true;
        chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
        addLynxCantMove(state);
      } else {
        const targetPos = chipPos + directionDelta(startInputCode, MS_GRID_WIDTH);
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
        if (targetBlock && (pushedBlock || !canEnterTarget)) {
          chipPushing = true;
        }
        if (canEnterTarget) {
          clearLynxCouldntMove(state);
          chipDir = startInputCode;
          chipPos = targetPos;
          chipMoving = 8;
        } else {
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

  let chipArrivedThisTick = false;
  if (chipMoving > 0) {
    const floor = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
    const speed = lynxChipMovementSpeed(state, floor);

    chipMoving = Math.max(0, chipMoving - speed);
    if (chipMoving === 0) {
      chipArrivedThisTick = true;
      const completed = resolveCompletedLynxChipMove(
        state,
        level,
        actors,
        chipPos,
        chipDir,
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
  }
  if (!chipArrivedThisTick && chipMoving === 0 && topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) === MS_TILE.Button_Brown) {
    springLynxTrap(state, level, actors, chipPos);
  }

  chipPos = resolveLynxTeleports(state, actors, chipPos, chipDir, chipMoving);
  clearDeferredLynxBlockPushes(actors);
  state.map.hash = mapHash(state.map.cells);

  state.timer.tick += 1;
  state.timer.currentTime += 1;
  updateLynxViewFromMovement(state, chipPos, chipDir, chipMoving);
  const displayFloor = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
  if (displayFloor === MS_TILE.HintButton && chipMoving === 0) {
    state.statusFlags |= MS_STATUS_FLAG.ShowHint;
  } else {
    state.statusFlags &= ~MS_STATUS_FLAG.ShowHint;
  }
  if (chipMoving > 0) {
    resetLynxFloorSounds(state);
    if (displayFloor === MS_TILE.Fire && hasLynxBoots(state, MS_TILE.Boots_Fire)) {
      state.soundEffects |= 1 << LYNX_SOUND.FireWalking;
    } else if (displayFloor === MS_TILE.Water && hasLynxBoots(state, MS_TILE.Boots_Water)) {
      state.soundEffects |= 1 << LYNX_SOUND.WaterWalking;
    } else if (displayFloor === MS_TILE.Ice && hasLynxBoots(state, MS_TILE.Boots_Ice)) {
      state.soundEffects |= 1 << LYNX_SOUND.IceWalking;
    } else if (displayFloor === MS_TILE.Ice) {
      state.soundEffects |= 1 << LYNX_SOUND.SkatingForward;
    } else if (isLynxIce(displayFloor) && hasLynxBoots(state, MS_TILE.Boots_Ice)) {
      state.soundEffects |= 1 << LYNX_SOUND.IceWalking;
    } else if (isLynxIce(displayFloor)) {
      state.soundEffects |= 1 << LYNX_SOUND.SkatingTurn;
    } else if (isLynxSlide(displayFloor) && hasLynxBoots(state, MS_TILE.Boots_Slide)) {
      state.soundEffects |= 1 << LYNX_SOUND.SlideWalking;
    } else if (isLynxSlide(displayFloor)) {
      state.soundEffects |= 1 << LYNX_SOUND.Sliding;
    }
  }

  const finalizedEndGame = finalizeLynxEndGame(state, endGameTicksElapsed, endGameResult);
  endGameTicksElapsed = finalizedEndGame.endGameTicksElapsed;
  endGameResult = finalizedEndGame.endGameResult;
  state.timer.secondsPlayed = Math.trunc((state.timer.currentTime + state.timer.timeOffset) / 20);
  state.map.hash = mapHash(state.map.cells);

  return {
    level,
    state,
    lastInput: runtimeInput,
    recordedMoves: recordManualMove(session.recordedMoves, state.timer.currentTime, state.replay.cursor, runtimeInput.inputCode),
    replayPlan,
    chipPos,
    chipDir,
    chipMoving,
    currentInputCode,
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
  const initialChipPos = findChipPosition(level.cells);
  const initialDebugState = projectLynxDebugPhaseSnapshot(state, initialActors, initialChipPos, 0, 0, 0, 0, "initial");
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
  let chipPos = findChipPosition(level.cells);
  let chipDir = findChipDirection(level.cells);
  let chipMoving = 0;
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
    phases.push(
      projectLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, currentInputCode, tick, "post-input-latch"),
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
    phases.push(
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        currentInputCode,
        tick,
        "post-initial-housekeeping",
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
      chipMoving === 0 && topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) !== MS_TILE.Beartrap
        ? selectLynxChipMoveForTick(
            state,
            level,
            actors,
            chipPos,
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
      chipMoving === 0 && topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) === MS_TILE.Beartrap;
    const chipHasPreCreatureMoveQueued =
      (latchedChipMoveSelection !== null && latchedChipMoveSelection.startInputCode !== 0) ||
      (chipOnBeartrapBeforeCreatureMovement &&
        (queuedChipInputCode !== 0 || queuedReplayInputCode !== 0 || currentInputCode !== 0));
    if (!chipHasPreCreatureMoveQueued) {
      clearLynxCouldntMove(state);
    }

    phases.push(projectLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, 0, tick, "post-creature-intent"));

    let chipArrivedOnHeldTrapThisTick = false;

    for (let index = actors.length - 1; index >= 0; index -= 1) {
      const actor = actors[index]!;
      if (!skipsDormantLynxActorAdvance(state, actor, state.timer.currentTime + 1)) {
        advanceLynxCreature(state, level, actors, actor, state.timer.currentTime + 1);
      }
      actor.intentDir = 0;
      actor.forcedDir = 0;
      if (
        !actor.hidden &&
        actor.moving <= 0 &&
        topTileIdOr(state.map.cells, actor.pos, MS_TILE.Empty) === MS_TILE.Button_Brown
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

    phases.push(
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        0,
        tick,
        "post-creature-movement",
      ),
    );

    const chipMoveSelection =
      (() => {
        const selection =
          latchedChipMoveSelection &&
          chipPos === latchedChipMoveSelection.chipPos &&
          chipDir === latchedChipMoveSelection.chipDir &&
          chipMoving === latchedChipMoveSelection.chipMoving &&
          endGameTicksElapsed === latchedChipMoveSelection.endGameTicksElapsed
            ? latchedChipMoveSelection
            : selectLynxChipMoveForTick(
                state,
                level,
                actors,
                chipPos,
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

    if (startInputCode === 0 && chipMoving === 0) {
      if (!lynxRuntimeState(state).trapReleaseCantMoveThisTick) {
        clearLynxCouldntMove(state);
      }
      resetLynxFloorSounds(state);
    }

    if (chipMoving === 0 && startInputCode !== 0) {
      updateLynxChipStartMovementState(state, floorBeforeMove, chosenInputCode);
      if (canLynxExitTile(state, floorBeforeMove, MS_TILE.Chip, startInputCode, false)) {
        if (!canAdvanceLynxPosition(chipPos, startInputCode, MS_GRID_WIDTH, MS_GRID_HEIGHT)) {
          chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
          addLynxCantMove(state);
        } else {
        const targetPos = chipPos + directionDelta(startInputCode, MS_GRID_WIDTH);
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

    let chipArrivedThisTick = false;
    if (chipMoving > 0) {
      const floor = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
      const speed = lynxChipMovementSpeed(state, floor);

      chipMoving = Math.max(0, chipMoving - speed);
      if (chipMoving === 0) {
        chipArrivedThisTick = true;
        const completed = resolveCompletedLynxChipMove(
          state,
          level,
          actors,
          chipPos,
          chipDir,
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
    }
    if (!chipArrivedThisTick && chipMoving === 0 && topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty) === MS_TILE.Button_Brown) {
      springLynxTrap(state, level, actors, chipPos);
    }

    chipPos = resolveLynxTeleports(state, actors, chipPos, chipDir, chipMoving);
    clearDeferredLynxBlockPushes(actors);
    state.map.hash = mapHash(state.map.cells);
    phases.push(
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        0,
        tick,
        "post-teleport-resolution",
      ),
    );

    state.timer.tick += 1;
    state.timer.currentTime += 1;
    updateLynxViewFromMovement(state, chipPos, chipDir, chipMoving);
    const displayFloor = topTileIdOr(state.map.cells, chipPos, MS_TILE.Empty);
    if (displayFloor === MS_TILE.HintButton && chipMoving === 0) {
      state.statusFlags |= MS_STATUS_FLAG.ShowHint;
    } else {
      state.statusFlags &= ~MS_STATUS_FLAG.ShowHint;
    }
    if (chipMoving > 0) {
      resetLynxFloorSounds(state);
      if (displayFloor === MS_TILE.Fire && hasLynxBoots(state, MS_TILE.Boots_Fire)) {
        state.soundEffects |= 1 << LYNX_SOUND.FireWalking;
      } else if (displayFloor === MS_TILE.Water && hasLynxBoots(state, MS_TILE.Boots_Water)) {
        state.soundEffects |= 1 << LYNX_SOUND.WaterWalking;
      } else if (displayFloor === MS_TILE.Ice && hasLynxBoots(state, MS_TILE.Boots_Ice)) {
        state.soundEffects |= 1 << LYNX_SOUND.IceWalking;
      } else if (displayFloor === MS_TILE.Ice) {
        state.soundEffects |= 1 << LYNX_SOUND.SkatingForward;
      } else if (isLynxIce(displayFloor) && hasLynxBoots(state, MS_TILE.Boots_Ice)) {
        state.soundEffects |= 1 << LYNX_SOUND.IceWalking;
      } else if (isLynxIce(displayFloor)) {
        state.soundEffects |= 1 << LYNX_SOUND.SkatingTurn;
      } else if (isLynxSlide(displayFloor) && hasLynxBoots(state, MS_TILE.Boots_Slide)) {
        state.soundEffects |= 1 << LYNX_SOUND.SlideWalking;
      } else if (isLynxSlide(displayFloor)) {
        state.soundEffects |= 1 << LYNX_SOUND.Sliding;
      }
    }

    phases.push(
      projectLynxDebugPhaseSnapshot(
        state,
        actors,
        chipPos,
        chipDir,
        chipMoving,
        0,
        tick,
        "post-putwall-resolution",
      ),
    );
    phases.push(projectLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, 0, tick, "final"));

    const finalizedEndGame = finalizeLynxEndGame(state, endGameTicksElapsed, endGameResult);
    endGameTicksElapsed = finalizedEndGame.endGameTicksElapsed;
    endGameResult = finalizedEndGame.endGameResult;
    state.timer.secondsPlayed = Math.trunc((state.timer.currentTime + state.timer.timeOffset) / 20);
    state.map.hash = mapHash(state.map.cells);

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
