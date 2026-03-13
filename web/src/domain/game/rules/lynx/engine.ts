import type { EngineMapCell, EngineState } from "@domain/game/model";
import type { GameDebugBoardFlag, GameDebugFloorState, GameDebugPhaseSnapshot, GameDebugRuntimeActor, GameDebugTrace } from "@domain/game/debug";
import { createReplayPlan, createRuntimeCommand, plannedReplayInput, recordManualMove, runtimeCommandName } from "@domain/game/playback";
import { getGameInputNameFromCode } from "@domain/game/command";
import { engineStateToSnapshot } from "@domain/game/snapshot";
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
  actors: LynxRuntimeActor[];
  endGameTicksElapsed: number | null;
}

interface LynxRuntimeActor {
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
}

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

function cloneCells(cells: EngineMapCell[]): EngineMapCell[] {
  return cells.map((cell) => ({
    position: { ...cell.position },
    top: { ...cell.top },
    bottom: { ...cell.bottom },
  }));
}

function hashByte(hash: bigint, value: number): bigint {
  return ((hash ^ BigInt(value & 0xff)) * 1099511628211n) & 0xffffffffffffffffn;
}

function hashHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
}

function mapHash(cells: EngineMapCell[]): string {
  let hash = 1469598103934665603n;
  for (const cell of cells) {
    hash = hashByte(hash, cell.top.id);
    hash = hashByte(hash, cell.top.state);
    hash = hashByte(hash, cell.bottom.id);
    hash = hashByte(hash, cell.bottom.state);
  }
  return hashHex(hash);
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
  state.map.cells[pos]!.top.state &= ~LYNX_CELL_FLAG.Animated;
  releaseReservedAnimationActorAt(actors, pos);
  return true;
}

function releaseReservedAnimationActorAt(actors: LynxRuntimeActor[], pos: number): void {
  const actor = actors.find((entry) => entry.hidden && entry.animationReserved && entry.pos === pos);
  if (!actor) {
    return;
  }
  actor.animationReserved = false;
}

function startLynxAnimation(state: EngineState, actors: LynxRuntimeActor[], pos: number): void {
  clearLynxAnimationAt(state, actors, pos);

  const cell = state.map.cells[pos];
  if (!cell) {
    return;
  }

  lynxRuntimeState(state).animations.push({
    pos,
    frame: (((state.timer.currentTime + 1) + state.replay.stepping) & 1) !== 0 ? 11 : 10,
  });
  cell.top.state |= LYNX_CELL_FLAG.Animated;
}

function advanceLynxAnimations(state: EngineState, actors: LynxRuntimeActor[]): void {
  const runtime = lynxRuntimeState(state);

  for (let index = runtime.animations.length - 1; index >= 0; index -= 1) {
    const animation = runtime.animations[index]!;
    animation.frame -= 1;
    if (animation.frame >= 0) {
      continue;
    }

    state.map.cells[animation.pos]!.top.state &= ~LYNX_CELL_FLAG.Animated;
    releaseReservedAnimationActorAt(actors, animation.pos);
    runtime.animations.splice(index, 1);
  }
}

function removeLynxActor(state: EngineState, actors: LynxRuntimeActor[], actor: LynxRuntimeActor): void {
  if (actor.pushed) {
    actor.pushed = false;
    state.soundEffects &= ~(1 << LYNX_SOUND.BlockMoving);
  }

  actor.hidden = true;
  actor.moving = 0;
  actor.frame = 0;
  actor.animationReserved = true;
  startLynxAnimation(state, actors, actor.pos);
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

function backDirection(dir: number): number {
  switch (dir) {
    case 1:
      return 4;
    case 2:
      return 8;
    case 4:
      return 1;
    case 8:
      return 2;
    default:
      return 0;
  }
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

function directionDelta(inputCode: number): number {
  switch (inputCode) {
    case 1:
      return -MS_GRID_WIDTH;
    case 2:
      return -1;
    case 4:
      return MS_GRID_WIDTH;
    case 8:
      return 1;
    default:
      return 0;
  }
}

function canAdvanceLynxPosition(pos: number, dir: number): boolean {
  if (isDiagonalInput(dir)) {
    return (
      ((dir & 1) === 0 || canAdvanceLynxPosition(pos, 1)) &&
      ((dir & 2) === 0 || canAdvanceLynxPosition(pos, 2)) &&
      ((dir & 4) === 0 || canAdvanceLynxPosition(pos, 4)) &&
      ((dir & 8) === 0 || canAdvanceLynxPosition(pos, 8))
    );
  }

  switch (dir) {
    case 1:
      return pos >= MS_GRID_WIDTH;
    case 2:
      return (pos % MS_GRID_WIDTH) !== 0;
    case 4:
      return pos < MS_GRID_WIDTH * (MS_GRID_HEIGHT - 1);
    case 8:
      return (pos % MS_GRID_WIDTH) !== MS_GRID_WIDTH - 1;
    default:
      return false;
  }
}

function isDirectionalInput(inputCode: number): boolean {
  return inputCode >= 1 && inputCode <= 15;
}

function isDiagonalInput(inputCode: number): boolean {
  return (inputCode & (1 | 4)) !== 0 && (inputCode & (2 | 8)) !== 0;
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

function directionName(dir: number): string {
  switch (dir) {
    case 1:
      return "north";
    case 2:
      return "west";
    case 4:
      return "south";
    case 8:
      return "east";
    default:
      return "none";
  }
}

function directionCode(name: string): number {
  switch (name) {
    case "north":
      return 1;
    case "west":
      return 2;
    case "south":
      return 4;
    case "east":
      return 8;
    default:
      return 0;
  }
}

function roundedBoardPosition(viewX: number, viewY: number): { x: number; y: number; pos: number } {
  const x = Math.max(0, Math.min(MS_GRID_WIDTH - 1, Math.round(viewX / 8)));
  const y = Math.max(0, Math.min(MS_GRID_HEIGHT - 1, Math.round(viewY / 8)));
  return {
    x,
    y,
    pos: x + y * MS_GRID_WIDTH,
  };
}

function updateLynxViewChip(state: EngineState): void {
  state.chip = {
    id: -1,
    layer: -1,
    dir: "none",
    position: roundedBoardPosition(state.view.x, state.view.y),
    state: 0,
    source: "view",
  };
}

function collectChipAtPosition(state: EngineState, pos: number): boolean {
  const cell = state.map.cells[pos];
  if (!cell) {
    return false;
  }

  if (cell.top.id === MS_TILE.ICChip) {
    cell.top = { ...cell.bottom };
    cell.bottom = { id: MS_TILE.Empty, state: 0 };
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

  const cell = state.map.cells[pos];
  if (!cell) {
    return 0;
  }

  if (isMsKey(cell.top.id)) {
    state.inventory.keys[Math.max(0, Math.min(3, cell.top.id - MS_TILE.Key_Red))] += 1;
    cell.top = { ...cell.bottom };
    cell.bottom = { id: MS_TILE.Empty, state: 0 };
    state.map.hash = mapHash(state.map.cells);
    return 1 << LYNX_SOUND.ItemCollected;
  }

  if (isMsBoots(cell.top.id)) {
    state.inventory.boots[Math.max(0, Math.min(3, cell.top.id - MS_TILE.Boots_Ice))] += 1;
    cell.top = { ...cell.bottom };
    cell.bottom = { id: MS_TILE.Empty, state: 0 };
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
  const cell = state.map.cells[pos];
  if (!cell) {
    return false;
  }
  if ((cell.top.state & LYNX_CELL_FLAG.Animated) !== 0) {
    return false;
  }

  const tileId = effectiveLynxTargetTileId(state, cell.top.id);
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
  const cell = state.map.cells[pos];
  if (!cell) {
    return false;
  }
  if ((cell.top.state & LYNX_CELL_FLAG.Animated) !== 0) {
    return false;
  }

  const tileId = effectiveLynxTargetTileId(state, cell.top.id);
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
  if (!canLynxExitTile(state, state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty, MS_TILE.Chip, dir, false)) {
    return { canMove: false, pushBlockPos: null };
  }
  if (!canAdvanceLynxPosition(chipPos, dir)) {
    return { canMove: false, pushBlockPos: null };
  }

  const targetPos = chipPos + directionDelta(dir);
  const target = state.map.cells[targetPos];
  if (!target) {
    return { canMove: false, pushBlockPos: null };
  }

  if ((target.top.state & LYNX_CELL_FLAG.Claimed) !== 0) {
    const block = findLynxBlockActor(actors, targetPos);
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

  const floorBeforeMove = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
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
  if (!isDirectionalInput(inputCode) || isDiagonalInput(inputCode) || !canAdvanceLynxPosition(chipPos, inputCode)) {
    return false;
  }

  const targetPos = chipPos + directionDelta(inputCode);
  if (!state.map.cells[targetPos]) {
    return false;
  }

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
    (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Beartrap
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
  const floorBeforeMove = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
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

  cell.top = { ...cell.top, id: MS_TILE.Wall };
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
    cell.top = { ...cell.bottom };
    cell.bottom = { id: MS_TILE.Empty, state: 0 };
    state.map.hash = mapHash(state.map.cells);
    return {
      soundEffects: 1 << LYNX_SOUND.DoorOpened,
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.Socket && state.inventory.chipsNeeded === 0) {
    cell.top = { ...cell.bottom };
    cell.bottom = { id: MS_TILE.Empty, state: 0 };
    state.map.hash = mapHash(state.map.cells);
    return {
      soundEffects: 1 << LYNX_SOUND.SocketOpened,
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.Dirt || cell.top.id === MS_TILE.BlueWall_Fake) {
    cell.top = { ...cell.top, id: MS_TILE.Empty };
    state.map.hash = mapHash(state.map.cells);
    return {
      soundEffects: 1 << LYNX_SOUND.TileEmptied,
      completed: false,
    };
  }

  if (cell.top.id === MS_TILE.PopupWall) {
    cell.top = { ...cell.top, id: MS_TILE.Wall };
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
): {
  chipPos: number;
  chipDir: number;
  endGameTicksElapsed: number | null;
} {
  clearLynxCouldntMove(state);
  const arrival = resolveLynxChipArrival(state, level, actors, chipPos);
  state.soundEffects |= arrival.soundEffects;
  if (arrival.completed && endGameTicksElapsed === null) {
    endGameTicksElapsed = 0;
  }
  state.soundEffects |= collectLynxItemAtPosition(state, chipPos);
  const floorAfterMove = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
  if (floorAfterMove === MS_TILE.Button_Brown) {
    springLynxTrap(state, level, actors, chipPos);
  }
  if (isLynxIce(floorAfterMove)) {
    chipDir = applyLynxIceWallTurn(chipDir, floorAfterMove);
  }

  return {
    chipPos,
    chipDir,
    endGameTicksElapsed,
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

function lynxFloorMovementMode(tileId: number, moving: number): string {
  if (moving <= 0) {
    return "none";
  }
  if (isLynxSlide(tileId)) {
    return "slide";
  }
  if (isLynxIce(tileId)) {
    return "ice";
  }
  return "none";
}

function buildLynxDebugFloorState(tileId: number, state: number, moving: number, dir: number): GameDebugFloorState {
  return {
    id: tileId,
    state,
    stateFlags: [],
    movementMode: lynxFloorMovementMode(tileId, moving),
    slipDir: moving > 0 && (isLynxSlide(tileId) || isLynxIce(tileId)) ? directionName(dir) : "none",
  };
}

function buildLynxDebugActor(cells: EngineMapCell[], actor: LynxRuntimeActor, index: number): GameDebugRuntimeActor {
  const cell = cells[actor.pos];
  const floorId = cell?.top.id ?? MS_TILE.Empty;
  const floorState = cell?.top.state ?? 0;

  return {
    index,
    id: actor.id,
    dir: directionName(actor.dir),
    position: {
      x: actor.pos % MS_GRID_WIDTH,
      y: Math.floor(actor.pos / MS_GRID_WIDTH),
      pos: actor.pos,
    },
    hidden: actor.hidden,
    state: 0,
    stateFlags: actor.dormant ? ["dormant"] : [],
    tdir: directionName(actor.intentDir || (actor.moving > 0 ? actor.dir : 0)),
    floor: buildLynxDebugFloorState(floorId, floorState, actor.moving, actor.dir),
    moving: actor.moving,
    frame: actor.frame,
  };
}

function buildLynxChipDebugActor(cells: EngineMapCell[], chipPos: number, chipDir: number, chipMoving: number): GameDebugRuntimeActor {
  const cell = cells[chipPos];
  const floorId = cell?.top.id ?? MS_TILE.Empty;
  const floorState = cell?.top.state ?? 0;

  return {
    index: 0,
    id: MS_TILE.Chip,
    dir: directionName(chipDir),
    position: {
      x: chipPos % MS_GRID_WIDTH,
      y: Math.floor(chipPos / MS_GRID_WIDTH),
      pos: chipPos,
    },
    hidden: false,
    state: 0,
    stateFlags: [],
    tdir: chipMoving > 0 ? directionName(chipDir) : "none",
    floor: buildLynxDebugFloorState(floorId, floorState, chipMoving, chipDir),
    moving: chipMoving,
    frame: Math.trunc(chipMoving / 2),
  };
}

function collectLynxBoardFlags(cells: EngineMapCell[]): GameDebugBoardFlag[] {
  const flags: GameDebugBoardFlag[] = [];

  for (const cell of cells) {
    if (cell.top.state !== 0) {
      flags.push({
        layer: 1,
        id: cell.top.id,
        position: { ...cell.position },
        state: cell.top.state,
        stateFlags: [],
      });
    }
    if (cell.bottom.state !== 0) {
      flags.push({
        layer: 0,
        id: cell.bottom.id,
        position: { ...cell.position },
        state: cell.bottom.state,
        stateFlags: [],
      });
    }
  }

  return flags;
}

function buildLynxDebugPhaseSnapshot(
  state: EngineState,
  actors: LynxRuntimeActor[],
  chipPos: number,
  chipDir: number,
  chipMoving: number,
  currentInputCode: number,
  currentTick: number,
  phase: string,
): GameDebugPhaseSnapshot {
  const chipCell = state.map.cells[chipPos];
  const chipFloorId = chipCell?.top.id ?? MS_TILE.Empty;
  const chipFloorState = chipCell?.top.state ?? 0;
  const currentMapHash = mapHash(state.map.cells);

  return {
    phase,
    tick: Math.max(currentTick, 0),
    currentTime: phase === "initial" ? state.timer.currentTime : currentTick,
    replayCursor: state.replay.cursor,
    currentInputCode,
    currentInput: createRuntimeCommand(currentInputCode, state.timer.currentTime).inputName,
    lastMoveCode: state.lastMove.code,
    lastMove: state.lastMove.name,
    chipsNeeded: state.inventory.chipsNeeded,
    statusFlags: state.statusFlags,
    chipStatus: state.status === "failed" ? "dead" : state.status === "completed" ? "completed" : "okay",
    chipStatusCode: state.status === "failed" ? 1 : state.status === "completed" ? 2 : 0,
    chipWait: 0,
    controllerDir: "none",
    lastSlipDir: chipMoving > 0 && (isLynxSlide(chipFloorId) || isLynxIce(chipFloorId)) ? directionName(chipDir) : "none",
    goalPos: 0,
    completed: state.status === "completed",
    msccSlippers: 0,
    soundEffects: state.soundEffects,
    chipFloor: buildLynxDebugFloorState(chipFloorId, chipFloorState, chipMoving, chipDir),
    mapHash: currentMapHash,
    creaturesHash: state.map.creaturesHash,
    activeCreatures: [
      buildLynxChipDebugActor(state.map.cells, chipPos, chipDir, chipMoving),
      ...actors
        .filter((actor) => actor.id !== MS_TILE.Block && !actor.hidden)
        .map((actor, index) => buildLynxDebugActor(state.map.cells, actor, index + 1)),
    ],
    blocks: actors
      .filter((actor) => actor.id === MS_TILE.Block && !actor.hidden)
      .map((actor, index) => buildLynxDebugActor(state.map.cells, actor, index)),
    slipList: [],
    boardFlags: collectLynxBoardFlags(state.map.cells),
    map: {
      cells: cloneCells(state.map.cells),
    },
  };
}

function inBounds(pos: number): boolean {
  return pos >= 0 && pos < MS_GRID_WIDTH * MS_GRID_HEIGHT;
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
        cell!.top = { ...cell!.top, id: MS_TILE.Teleport };
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
    if (!canAdvanceLynxPosition(teleportPos, chipDir)) {
      return false;
    }
    const exitPos = teleportPos + directionDelta(chipDir);
    const exitCell = inBounds(exitPos) ? state.map.cells[exitPos] : null;
    if (!exitCell) {
      return false;
    }

    const teleportClaimed = (state.map.cells[teleportPos]?.top.state ?? 0) & LYNX_CELL_FLAG.Claimed;
    if (teleportPos !== chipPos && teleportClaimed !== 0) {
      return false;
    }

    if ((exitCell.top.state & LYNX_CELL_FLAG.Claimed) !== 0) {
      const exitBlock = findLynxBlockActor(actors, exitPos);
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
        cell!.top = { ...cell!.top, id: MS_TILE.Teleport };
      }
      continue;
    }

    state.map.cells[actor.pos]!.top.state &= ~LYNX_CELL_FLAG.Claimed;
    actor.pos = pos;

    if (!canAdvanceLynxPosition(pos, actor.dir)) {
      if (pos === origin) {
        state.map.cells[actor.pos]!.top.state |= LYNX_CELL_FLAG.Claimed;
        return;
      }
      continue;
    }
    const exitPos = pos + directionDelta(actor.dir);
    const exitCell = inBounds(exitPos) ? state.map.cells[exitPos] : null;
    if (!exitCell || !canLynxCreatureEnter(effectiveLynxTargetTileId(state, exitCell.top.id), actor.id, actor.dir)) {
      if (pos === origin) {
        state.map.cells[actor.pos]!.top.state |= LYNX_CELL_FLAG.Claimed;
        return;
      }
      continue;
    }

    if ((state.map.cells[pos]?.top.state ?? 0) & LYNX_CELL_FLAG.Claimed) {
      if (pos === origin) {
        state.map.cells[actor.pos]!.top.state |= LYNX_CELL_FLAG.Claimed;
        return;
      }
      continue;
    }

    if ((exitCell.top.state & LYNX_CELL_FLAG.Claimed) === 0) {
      state.map.cells[actor.pos]!.top.state |= LYNX_CELL_FLAG.Claimed;
      actor.teleported = true;
      return;
    }

    if (pos === origin) {
      state.map.cells[actor.pos]!.top.state |= LYNX_CELL_FLAG.Claimed;
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
    if ((state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty) !== MS_TILE.Teleport) {
      continue;
    }
    resolveLynxActorTeleport(state, actor);
  }

  if (chipMoving === 0 && (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Teleport) {
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
  const floorFrom = state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty;
  if (!canLynxExitTile(state, floorFrom, actor.id, dir, releasing)) {
    return false;
  }
  if (!canAdvanceLynxPosition(actor.pos, dir)) {
    return false;
  }

  const targetPos = actor.pos + directionDelta(dir);
  if (!inBounds(targetPos)) {
    return false;
  }

  const target = state.map.cells[targetPos];
  if (
    !target ||
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

  const floor = state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty;
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
  const floorFrom = state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty;

  const targetPos = actor.pos + directionDelta(dir);
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

  state.map.cells[actor.pos]!.top.state &= ~LYNX_CELL_FLAG.Claimed;
  actor.pos = targetPos;
  actor.moving = 8;
  actor.frame = 4;
  state.map.cells[actor.pos]!.top.state |= LYNX_CELL_FLAG.Claimed;
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
      cell.top = { ...cell.top, id: MS_TILE.Dirt };
      cell.top.state &= ~LYNX_CELL_FLAG.Claimed;
      removeLynxActor(state, actors, actor);
      state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
    } else if (cell.top.id === MS_TILE.Bomb) {
      cell.top = { ...cell.bottom };
      cell.bottom = { id: MS_TILE.Empty, state: 0 };
      cell.top.state &= ~LYNX_CELL_FLAG.Claimed;
      removeLynxActor(state, actors, actor);
      state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
    } else if (cell.top.id === MS_TILE.Key_Blue) {
      cell.top = { ...cell.bottom, state: cell.bottom.state | LYNX_CELL_FLAG.Claimed };
      cell.bottom = { id: MS_TILE.Empty, state: 0 };
    }
    actor.deferPush = false;
    actor.deferPushArmed = false;
    state.soundEffects |= resolveLynxCreatureArrivalEffects(state, level, actors, actor.pos, cell.top.id);
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (cell.top.id === MS_TILE.Water && actor.id !== MS_TILE.Glider) {
    cell.top.state &= ~LYNX_CELL_FLAG.Claimed;
    removeLynxActor(state, actors, actor);
    state.soundEffects |= 1 << LYNX_SOUND.WaterSplash;
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (cell.top.id === MS_TILE.Bomb) {
    cell.top = { ...cell.bottom };
    cell.bottom = { id: MS_TILE.Empty, state: 0 };
    cell.top.state &= ~LYNX_CELL_FLAG.Claimed;
    removeLynxActor(state, actors, actor);
    state.soundEffects |= 1 << LYNX_SOUND.BombExplodes;
    state.map.hash = mapHash(state.map.cells);
    return;
  }

  if (cell.top.id === MS_TILE.Key_Blue) {
    cell.top = { ...cell.bottom, state: cell.bottom.state | LYNX_CELL_FLAG.Claimed };
    cell.bottom = { id: MS_TILE.Empty, state: 0 };
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
    const floorBeforeMove = state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty;
    const moveDir = actor.intentDir || actor.forcedDir || forcedLynxActorDirection(state, actor, floorBeforeMove, currentTime);
    actor.intentDir = 0;
    actor.forcedDir = 0;
    if (moveDir === 0 || !startLynxCreatureMovement(state, actors, actor, moveDir)) {
      return;
    }
  }

  const floor = state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty;
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
  return actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden && actor.pos === pos) ?? null;
}

function findLynxVisibleActorAt(actors: LynxRuntimeActor[], pos: number): LynxRuntimeActor | null {
  return actors.find((actor) => !actor.hidden && actor.pos === pos) ?? null;
}

function allocateLynxActorSlot(actors: LynxRuntimeActor[], actor: LynxRuntimeActor): LynxRuntimeActor {
  const hiddenIndex = actors.findIndex((entry) => entry.hidden && !entry.animationReserved);
  if (hiddenIndex < 0) {
    actors.push(actor);
    return actor;
  }

  actors[hiddenIndex] = actor;
  return actor;
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
    const floor = state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty;
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

  const floor = state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty;
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
  if ((state.map.cells[sourcePos]?.top.id ?? MS_TILE.Empty) !== MS_TILE.Beartrap) {
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
): {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
} {
  if ((state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) !== MS_TILE.Beartrap || chipDir === 0) {
    return {
      chipPos,
      chipDir,
      chipMoving,
      endGameTicksElapsed,
    };
  }

  if (chipMoving <= 0) {
    if (!canAdvanceLynxPosition(chipPos, chipDir)) {
      lynxRuntimeState(state).trapReleaseCantMoveThisTick = true;
      addLynxCantMove(state);
      return {
        chipPos,
        chipDir,
        chipMoving,
        endGameTicksElapsed,
      };
    }
    const targetPos = chipPos + directionDelta(chipDir);
    const target = state.map.cells[targetPos];
    const targetBlock =
      target && (target.top.state & LYNX_CELL_FLAG.Claimed) !== 0 ? findLynxBlockActor(actors, targetPos) : null;
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
      };
    }

    chipPos = targetPos;
    chipMoving = 8;
  }

  const floor = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
  const speed = lynxChipMovementSpeed(state, floor);

  chipMoving = Math.max(0, chipMoving - speed);
  if (chipMoving === 0) {
    const completed = resolveCompletedLynxChipMove(state, level, actors, chipPos, chipDir, endGameTicksElapsed);
    chipPos = completed.chipPos;
    chipDir = completed.chipDir;
    endGameTicksElapsed = completed.endGameTicksElapsed;
  }

  return {
    chipPos,
    chipDir,
    chipMoving,
    endGameTicksElapsed,
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
  replayInputCode = 0,
): {
  chipPos: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  consumedReplayInput: boolean;
  deferredChipInputCode: number;
  chipArrivedOnTrapThisTick: boolean;
} {
  let nextChipPos = chipPos;
  let nextChipDir = chipDir;
  let nextChipMoving = chipMoving;
  let nextEndGameTicksElapsed = endGameTicksElapsed;
  let consumedReplayInput = false;
  let deferredChipInputCode = 0;
  let chipArrivedOnTrapThisTick = false;

  const trapPos = findLynxTrapTarget(level, buttonPos);
  springLynxTrap(state, level, actors, buttonPos);
  if (trapPos === nextChipPos && (state.map.cells[nextChipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Beartrap) {
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
    );
    nextChipPos = released.chipPos;
    nextChipDir = released.chipDir;
    nextChipMoving = released.chipMoving;
    nextEndGameTicksElapsed = released.endGameTicksElapsed;
    chipArrivedOnTrapThisTick =
      releaseStartMoving > 0 &&
      nextChipPos === releaseStartPos &&
      nextChipMoving === 0 &&
      (state.map.cells[nextChipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Beartrap;
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
  const sourceCells = cloneCells(level.cells);
  const cells = stripCreaturesForInitialHash(sourceCells);
  const chipPos = findChipPosition(sourceCells);
  const initialStatusFlags =
    (level.statusFlags & ~MS_STATUS_FLAG.ShowHint) |
    ((cells[chipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.HintButton ? MS_STATUS_FLAG.ShowHint : 0);
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
      position: roundedBoardPosition((chipPos % MS_GRID_WIDTH) * 8, Math.floor(chipPos / MS_GRID_HEIGHT) * 8),
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
    actors: parseLynxActors(level),
    endGameTicksElapsed: null,
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
  const actors = session.actors;
  let endGameTicksElapsed = session.endGameTicksElapsed;

  if (scheduledInputCode !== null) {
    currentInputCode = scheduledInputCode;
  }
  state.soundEffects &= ~LYNX_ONE_SHOT_MASK;
  runLynxInitialHousekeeping(state, actors);
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
    chipMoving === 0 && (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) !== MS_TILE.Beartrap
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
    chipMoving === 0 && (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Beartrap;
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
      (state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Button_Brown
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
        replayMode ? currentInputCode : 0,
      );
      chipPos = heldButton.chipPos;
      chipDir = heldButton.chipDir;
      chipMoving = heldButton.chipMoving;
      endGameTicksElapsed = heldButton.endGameTicksElapsed;
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
      if (!canAdvanceLynxPosition(chipPos, startInputCode)) {
        chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
        addLynxCantMove(state);
      } else {
        const targetPos = chipPos + directionDelta(startInputCode);
        const target = state.map.cells[targetPos];
        const targetBlock =
          target && (target.top.state & LYNX_CELL_FLAG.Claimed) !== 0 ? findLynxBlockActor(actors, targetPos) : null;
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
    const floor = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
    const speed = lynxChipMovementSpeed(state, floor);

    chipMoving = Math.max(0, chipMoving - speed);
    if (chipMoving === 0) {
      chipArrivedThisTick = true;
      const completed = resolveCompletedLynxChipMove(state, level, actors, chipPos, chipDir, endGameTicksElapsed);
      chipPos = completed.chipPos;
      chipDir = completed.chipDir;
      endGameTicksElapsed = completed.endGameTicksElapsed;
    }
  }
  if (!chipArrivedThisTick && chipMoving === 0 && (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Button_Brown) {
    springLynxTrap(state, level, actors, chipPos);
  }

  chipPos = resolveLynxTeleports(state, actors, chipPos, chipDir, chipMoving);
  clearDeferredLynxBlockPushes(actors);
  state.map.hash = mapHash(state.map.cells);

  state.timer.tick += 1;
  state.timer.currentTime += 1;
  updateLynxViewFromMovement(state, chipPos, chipDir, chipMoving);
  const displayFloor = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
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

  if (endGameTicksElapsed !== null) {
    state.timer.timeOffset = endGameTicksElapsed <= 1 ? 0 : -(endGameTicksElapsed - 1);
    endGameTicksElapsed += 1;
    if (endGameTicksElapsed > 13) {
      state.status = "completed";
    }
  }
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
    actors,
    endGameTicksElapsed,
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
    return {
      request: { ...request },
      scheduledInputs: replay ? [] : commands.map((command) => ({ ...command })),
      initialState,
      steps: [],
      result: {
        status: token.state.status,
        finalTick: token.state.timer.tick,
        stepCount: 0,
      },
    };
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

  return {
    request: { ...request },
    scheduledInputs: replay ? [] : commands.map((command) => ({ ...command })),
    initialState,
    steps,
    result: {
      status: token.state.status,
      finalTick: token.state.timer.tick,
      stepCount: steps.length,
    },
  };
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
  const initialDebugState = buildLynxDebugPhaseSnapshot(state, initialActors, initialChipPos, 0, 0, 0, 0, "initial");
  const includeStep = (tick: number) => tick >= windowStart && tick < windowEndExclusive;

  if (maxTicks === 0) {
    return {
      request: { ...request },
      debugSchemaVersion: LYNX_DEBUG_SCHEMA_VERSION,
      scheduledInputs: replay ? [] : commands.map((command) => ({ ...command })),
      initialState,
      initialDebugState,
      steps: [],
      result: {
        status: state.status,
        finalTick: state.timer.tick,
        stepCount: 0,
      },
    };
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
      buildLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, currentInputCode, tick, "post-input-latch"),
    );
    runLynxInitialHousekeeping(state, actors);
    phases.push(
      buildLynxDebugPhaseSnapshot(
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
      chipMoving === 0 && (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) !== MS_TILE.Beartrap
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
      chipMoving === 0 && (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Beartrap;
    const chipHasPreCreatureMoveQueued =
      (latchedChipMoveSelection !== null && latchedChipMoveSelection.startInputCode !== 0) ||
      (chipOnBeartrapBeforeCreatureMovement &&
        (queuedChipInputCode !== 0 || queuedReplayInputCode !== 0 || currentInputCode !== 0));
    if (!chipHasPreCreatureMoveQueued) {
      clearLynxCouldntMove(state);
    }

    phases.push(buildLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, 0, tick, "post-creature-intent"));

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
        (state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Button_Brown
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
          replay ? currentInputCode : 0,
        );
        chipPos = heldButton.chipPos;
        chipDir = heldButton.chipDir;
        chipMoving = heldButton.chipMoving;
        endGameTicksElapsed = heldButton.endGameTicksElapsed;
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

    phases.push(
      buildLynxDebugPhaseSnapshot(
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
        if (!canAdvanceLynxPosition(chipPos, startInputCode)) {
          chipDir = turnLynxChipAroundOnBlockedIce(state, floorBeforeMove, startInputCode);
          addLynxCantMove(state);
        } else {
        const targetPos = chipPos + directionDelta(startInputCode);
        const target = state.map.cells[targetPos];
        const targetBlock =
          target && (target.top.state & LYNX_CELL_FLAG.Claimed) !== 0 ? findLynxBlockActor(actors, targetPos) : null;
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
      const floor = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
      const speed = lynxChipMovementSpeed(state, floor);

      chipMoving = Math.max(0, chipMoving - speed);
      if (chipMoving === 0) {
        chipArrivedThisTick = true;
        const completed = resolveCompletedLynxChipMove(state, level, actors, chipPos, chipDir, endGameTicksElapsed);
        chipPos = completed.chipPos;
        chipDir = completed.chipDir;
        endGameTicksElapsed = completed.endGameTicksElapsed;
      }
    }
    if (!chipArrivedThisTick && chipMoving === 0 && (state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty) === MS_TILE.Button_Brown) {
      springLynxTrap(state, level, actors, chipPos);
    }

    chipPos = resolveLynxTeleports(state, actors, chipPos, chipDir, chipMoving);
    clearDeferredLynxBlockPushes(actors);
    state.map.hash = mapHash(state.map.cells);
    phases.push(
      buildLynxDebugPhaseSnapshot(
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
    const displayFloor = state.map.cells[chipPos]?.top.id ?? MS_TILE.Empty;
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
      buildLynxDebugPhaseSnapshot(
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
    phases.push(buildLynxDebugPhaseSnapshot(state, actors, chipPos, chipDir, chipMoving, 0, tick, "final"));

    if (endGameTicksElapsed !== null) {
      state.timer.timeOffset = endGameTicksElapsed <= 1 ? 0 : -(endGameTicksElapsed - 1);
      endGameTicksElapsed += 1;
      if (endGameTicksElapsed > 13) {
        state.status = "completed";
      }
    }
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

  return {
    request: { ...request },
    debugSchemaVersion: LYNX_DEBUG_SCHEMA_VERSION,
    scheduledInputs: replay ? [] : commands.map((command) => ({ ...command })),
    initialState,
    initialDebugState,
    steps,
    result: {
      status: steps[steps.length - 1]?.status ?? initialState.status,
      finalTick: steps[steps.length - 1]?.currentTime ?? initialState.currentTime,
      stepCount: steps.length,
    },
  };
}
