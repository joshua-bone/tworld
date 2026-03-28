import { reverseDirection as backDirection } from "@game-core/impl/grid";
import { MS_DIRECTION, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";
import { msActorControlMode } from "@ruleset-ms/impl/catalog";
import { msActorHeldFloorOutcome } from "@ruleset-ms/impl/actorInteractions";

type MsCreatureFloorMovement = "none" | "ice" | "slide" | "teleport" | "air" | "elevator";

export interface MsCreatureControllerCreature {
  id: number;
  dir: number;
  tdir: number;
  pos: number;
  released: boolean;
  turning: boolean;
  hasMoved: boolean;
  floorMovement: MsCreatureFloorMovement;
  floorMovementDir: number;
}

export interface MsCreatureControllerContext {
  currentTime: number;
  stepping: number;
  chipPos: number;
  floorAt(pos: number): number;
  getControllerDir(): number;
  setControllerDir(dir: number): void;
  canMove(creature: MsCreatureControllerCreature, dir: number): boolean;
  updateCreatureTile(creature: MsCreatureControllerCreature): void;
  randomize3(array: number[]): void;
  randomize4(array: number[]): void;
}

function leftDirection(dir: number): number {
  switch (dir) {
    case MS_DIRECTION.north:
      return MS_DIRECTION.west;
    case MS_DIRECTION.west:
      return MS_DIRECTION.south;
    case MS_DIRECTION.south:
      return MS_DIRECTION.east;
    case MS_DIRECTION.east:
      return MS_DIRECTION.north;
    default:
      return MS_DIRECTION.none;
  }
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

function creatureSkippedForCurrentTick(
  context: MsCreatureControllerContext,
  creature: MsCreatureControllerCreature,
): boolean {
  if ((context.currentTime & 2) !== 0) {
    return true;
  }

  if (
    creature.turning &&
    creature.id === MS_TILE.Tank &&
    creature.floorMovement !== "none" &&
    creature.floorMovementDir !== MS_DIRECTION.none
  ) {
    return true;
  }

  if (creature.floorMovement !== "none" && creature.floorMovementDir !== MS_DIRECTION.none) {
    return true;
  }

  return (
    (creature.id === MS_TILE.Teeth || creature.id === MS_TILE.Blob) &&
    ((context.currentTime + context.stepping) & 4) !== 0
  );
}

function resetTurningCreature(
  context: MsCreatureControllerContext,
  creature: MsCreatureControllerCreature,
): void {
  if (!creature.turning) {
    return;
  }

  creature.turning = false;
  creature.hasMoved = false;
  context.updateCreatureTile(creature);
}

function teethDirections(chipPos: number, creaturePos: number): number[] {
  let deltaY = Math.floor(chipPos / MS_GRID_WIDTH) - Math.floor(creaturePos / MS_GRID_WIDTH);
  let deltaX = (chipPos % MS_GRID_WIDTH) - (creaturePos % MS_GRID_WIDTH);
  const vertical = deltaY < 0 ? MS_DIRECTION.north : deltaY > 0 ? MS_DIRECTION.south : MS_DIRECTION.none;
  if (deltaY < 0) {
    deltaY = -deltaY;
  }
  const horizontal = deltaX < 0 ? MS_DIRECTION.west : deltaX > 0 ? MS_DIRECTION.east : MS_DIRECTION.none;
  if (deltaX < 0) {
    deltaX = -deltaX;
  }
  return deltaX > deltaY ? [horizontal, vertical] : [vertical, horizontal];
}

function chooseTrapOrCloneFloorDirections(
  context: MsCreatureControllerContext,
  creature: MsCreatureControllerCreature,
): { choices: number[]; preferredDir: number; immediateDir: number | null } {
  if (msActorControlMode(creature.id) === "ballistic") {
    return {
      choices: [creature.dir],
      preferredDir: creature.dir,
      immediateDir: null,
    };
  }

  switch (creature.id) {
    case MS_TILE.Tank:
    case MS_TILE.Ball:
    case MS_TILE.Glider:
    case MS_TILE.Fireball:
    case MS_TILE.Walker:
      return {
        choices: [creature.dir],
        preferredDir: creature.dir,
        immediateDir: null,
      };
    case MS_TILE.Blob: {
      const choices = [creature.dir, leftDirection(creature.dir), backDirection(creature.dir), rightDirection(creature.dir)];
      context.randomize4(choices);
      return {
        choices,
        preferredDir: creature.dir,
        immediateDir: null,
      };
    }
    case MS_TILE.Bug:
    case MS_TILE.Paramecium:
    case MS_TILE.Teeth:
      return {
        choices: [],
        preferredDir: context.getControllerDir(),
        immediateDir: context.getControllerDir(),
      };
    default:
      return {
        choices: [],
        preferredDir: MS_DIRECTION.none,
        immediateDir: MS_DIRECTION.none,
      };
  }
}

function chooseStandardDirections(
  context: MsCreatureControllerContext,
  creature: MsCreatureControllerCreature,
): { choices: number[]; preferredDir: number } {
  if (msActorControlMode(creature.id) === "ballistic") {
    return { choices: [creature.dir], preferredDir: creature.dir };
  }

  switch (creature.id) {
    case MS_TILE.Tank:
      return { choices: [creature.dir], preferredDir: creature.dir };
    case MS_TILE.Ball:
      return { choices: [creature.dir, backDirection(creature.dir)], preferredDir: creature.dir };
    case MS_TILE.Glider:
      return {
        choices: [creature.dir, leftDirection(creature.dir), rightDirection(creature.dir), backDirection(creature.dir)],
        preferredDir: creature.dir,
      };
    case MS_TILE.Fireball:
      return {
        choices: [creature.dir, rightDirection(creature.dir), leftDirection(creature.dir), backDirection(creature.dir)],
        preferredDir: creature.dir,
      };
    case MS_TILE.Walker: {
      const randomized = [leftDirection(creature.dir), backDirection(creature.dir), rightDirection(creature.dir)];
      context.randomize3(randomized);
      return {
        choices: [creature.dir, ...randomized],
        preferredDir: creature.dir,
      };
    }
    case MS_TILE.Blob: {
      const choices = [creature.dir, leftDirection(creature.dir), backDirection(creature.dir), rightDirection(creature.dir)];
      context.randomize4(choices);
      return { choices, preferredDir: creature.dir };
    }
    case MS_TILE.Bug:
      return {
        choices: [leftDirection(creature.dir), creature.dir, rightDirection(creature.dir), backDirection(creature.dir)],
        preferredDir: creature.dir,
      };
    case MS_TILE.Paramecium:
      return {
        choices: [rightDirection(creature.dir), creature.dir, leftDirection(creature.dir), backDirection(creature.dir)],
        preferredDir: creature.dir,
      };
    case MS_TILE.Teeth: {
      const choices = teethDirections(context.chipPos, creature.pos);
      const preferredDir = choices[0] ?? creature.dir;
      if (choices[0] !== MS_DIRECTION.none) {
        choices.push(choices[0]!);
      }
      return { choices, preferredDir };
    }
    default:
      return { choices: [], preferredDir: MS_DIRECTION.none };
  }
}

function shouldTurnTowardPreferredDirection(
  creature: MsCreatureControllerCreature,
  floor: number,
  preferredDir: number,
): boolean {
  return (
    creature.id !== MS_TILE.Tank &&
    floor !== MS_TILE.Beartrap &&
    floor !== MS_TILE.CloneMachine &&
    preferredDir !== MS_DIRECTION.none &&
    creature.dir !== preferredDir
  );
}

export function chooseMsCreatureDirection(
  context: MsCreatureControllerContext,
  creature: MsCreatureControllerCreature,
): number {
  creature.tdir = MS_DIRECTION.none;
  if (creatureSkippedForCurrentTick(context, creature)) {
    return MS_DIRECTION.none;
  }

  resetTurningCreature(context, creature);
  if (creature.hasMoved) {
    context.setControllerDir(MS_DIRECTION.none);
    return MS_DIRECTION.none;
  }

  const floor = context.floorAt(creature.pos);
  const trapOrCloneFloor = msActorHeldFloorOutcome(floor, creature.id) === "hold-direction";
  const trapOrCloneChoice = trapOrCloneFloor ? chooseTrapOrCloneFloorDirections(context, creature) : null;
  if (trapOrCloneChoice && trapOrCloneChoice.immediateDir !== null) {
    creature.tdir = trapOrCloneChoice.immediateDir;
    return trapOrCloneChoice.immediateDir;
  }

  const { choices, preferredDir } = trapOrCloneChoice ?? chooseStandardDirections(context, creature);
  if (creature.id === MS_TILE.Tank) {
    creature.tdir = creature.dir;
  }

  for (const dir of choices) {
    creature.tdir = dir;
    context.setControllerDir(dir);
    if (dir !== MS_DIRECTION.none && context.canMove(creature, dir)) {
      return dir;
    }
  }

  if (shouldTurnTowardPreferredDirection(creature, floor, preferredDir)) {
    creature.dir = preferredDir;
    context.updateCreatureTile(creature);
  }

  creature.tdir = preferredDir;
  if (creature.id === MS_TILE.Tank) {
    if (creature.released || floor !== MS_TILE.Beartrap) {
      creature.hasMoved = true;
    }
    creature.tdir = MS_DIRECTION.none;
    return MS_DIRECTION.none;
  }

  return preferredDir;
}

export function applyBlockedMsCreatureAttempt(
  context: Pick<MsCreatureControllerContext, "floorAt" | "updateCreatureTile">,
  creature: MsCreatureControllerCreature,
  dir: number,
): void {
  const floor = context.floorAt(creature.pos);
  if (dir === MS_DIRECTION.none || floor === MS_TILE.Beartrap || floor === MS_TILE.CloneMachine) {
    return;
  }

  creature.dir = dir;
  context.updateCreatureTile(creature);
}
