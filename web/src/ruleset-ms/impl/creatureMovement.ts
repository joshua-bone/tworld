import type { EngineMapCell } from "@game-core/api/model";
import { blockedMovement, movedMovement, type MovementAttemptResult } from "@game-core/api/movementOutcomes";
import { nextPosition } from "@game-core/impl/grid";
import { msActorArrivalAction, msTileForcedFloorKind } from "@ruleset-ms/impl/catalog";
import {
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_GRID_WIDTH,
  MS_SOUND,
  MS_TILE,
  isMsCreature,
  msCreatureId,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";

function isIceFloor(tileId: number): boolean {
  return msTileForcedFloorKind(tileId) === "ice";
}

export interface MsCreatureMovementCreature {
  id: number;
  dir: number;
  pos: number;
  z?: number;
  hidden: boolean;
  moving: number;
  released: boolean;
  turning: boolean;
  hasMoved: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
}

export interface MsCreatureMovementContext {
  pushTile(cells: EngineMapCell[], pos: number, tile: EngineMapCell["top"]): void;
  popTile(cells: EngineMapCell[], pos: number): void;
  updateCreatureTile(cells: EngineMapCell[], creature: MsCreatureMovementCreature): void;
  resolveButtonFloorEffects(cells: EngineMapCell[], pos: number, floor: number, creature: MsCreatureMovementCreature): number;
  isTrapOpen(cells: EngineMapCell[], trapPos: number, skipButtonPos: number, z: number): boolean;
  hasTrapConnection(pos: number, z: number): boolean;
  chipActsWallForMobs(pos: number, z: number): boolean;
  runtimeCellZ(cells: EngineMapCell[], pos: number): number;
  clearCreatureFloorMovement(creature: MsCreatureMovementCreature): void;
  syncCreatureFloorMovement(cells: EngineMapCell[], creature: MsCreatureMovementCreature): void;
  syncVerticalFloorMovement(creature: MsCreatureMovementCreature): void;
  findTeleportDestination(
    cells: EngineMapCell[],
    start: number,
    dir: number,
    occupiedOriginPos: number | undefined,
    creature: MsCreatureMovementCreature,
  ): number;
}

function removeCreatureOnArrival(
  context: MsCreatureMovementContext,
  cells: EngineMapCell[],
  oldPos: number,
  oldWasCloneMachine: boolean,
  creature: MsCreatureMovementCreature,
  replacementTop: EngineMapCell["top"],
  replacementBottom: EngineMapCell["bottom"],
): void {
  cells[creature.pos]!.top = replacementTop;
  cells[creature.pos]!.bottom = replacementBottom;
  if (!oldWasCloneMachine) {
    context.popTile(cells, oldPos);
  } else {
    cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }
  creature.pos = oldPos;
  creature.hidden = true;
  context.clearCreatureFloorMovement(creature);
}

function applyCreatureFloorConsequences(
  context: MsCreatureMovementContext,
  cells: EngineMapCell[],
  oldPos: number,
  oldWasCloneMachine: boolean,
  creature: MsCreatureMovementCreature,
  nextPos: number,
  standingFloor: number,
  syncFloorMovement: boolean = true,
): number {
  let soundEffects = 0;
  const savedPos = creature.pos;
  creature.pos = oldPos;
  if (standingFloor === MS_TILE.Button_Red) {
    creature.moving = 1;
  }
  soundEffects |= context.resolveButtonFloorEffects(cells, nextPos, standingFloor, creature);
  creature.moving = 0;
  creature.pos = savedPos;
  if (standingFloor === MS_TILE.Beartrap) {
    creature.released = context.isTrapOpen(cells, nextPos, oldPos, creature.z ?? context.runtimeCellZ(cells, nextPos));
  } else if (cells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    creature.released = context.hasTrapConnection(nextPos, creature.z ?? context.runtimeCellZ(cells, nextPos));
  }
  if (isMsCreature(cells[nextPos]!.bottom.id)) {
    const targetId = msCreatureId(cells[nextPos]!.bottom.id);
    if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      soundEffects |= 0;
    }
  }
  if (oldWasCloneMachine) {
    cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }
  if (syncFloorMovement) {
    context.syncCreatureFloorMovement(cells, creature);
  }
  return soundEffects;
}

export function moveMsCreaturePlanar(
  context: MsCreatureMovementContext,
  cells: EngineMapCell[],
  creature: MsCreatureMovementCreature,
  dir: number,
  setChipCollided: () => void,
): MovementAttemptResult {
  const oldPos = creature.pos;
  const arrivalActorId = msCreatureId(cells[oldPos]!.top.id);
  const oldWasCloneMachine = cells[oldPos]!.bottom.id === MS_TILE.CloneMachine;
  let nextPos = nextPosition(oldPos, dir, MS_GRID_WIDTH);
  const targetTop = cells[nextPos]!.top.id;
  const targetTopState = cells[nextPos]!.top.state;
  const targetBottom = cells[nextPos]!.bottom.id;
  const targetBottomState = cells[nextPos]!.bottom.state;
  const standingFloorWasTop = !isMsCreature(targetTop);
  const preserveHasMoved =
    creature.id === MS_TILE.Tank &&
    creature.turning &&
    creature.hasMoved &&
    creature.floorMovement !== "none" &&
    creature.floorMovementDir !== MS_DIRECTION.none;
  let soundEffects = 0;

  creature.released = false;
  if (!preserveHasMoved) {
    creature.hasMoved = false;
  }
  context.pushTile(cells, nextPos, { id: MS_TILE.Empty, state: 0 });
  cells[nextPos]!.top = {
    id: msCreatureTile(creature.id, dir),
    state: 0,
  };

  creature.pos = nextPos;
  creature.dir = dir;
  if (creature.turning) {
    context.updateCreatureTile(cells, creature);
  }
  const standingFloor = standingFloorWasTop ? targetTop : targetBottom;
  const standingFloorState = standingFloorWasTop ? targetTopState : targetBottomState;

  switch (msActorArrivalAction(standingFloor, arrivalActorId)) {
    case "creature-water":
    case "creature-fire":
      removeCreatureOnArrival(
        context,
        cells,
        oldPos,
        oldWasCloneMachine,
        creature,
        { id: targetTop, state: targetTopState },
        { id: targetBottom, state: targetBottomState },
      );
      return movedMovement(soundEffects);
    case "creature-bomb":
      removeCreatureOnArrival(
        context,
        cells,
        oldPos,
        oldWasCloneMachine,
        creature,
        { id: MS_TILE.Empty, state: 0 },
        { id: targetBottom, state: targetBottomState },
      );
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      return movedMovement(soundEffects);
    default:
      break;
  }

  if (standingFloor === MS_TILE.Teleport && (standingFloorState & MS_FLOOR_STATE.Broken) === 0) {
    const teleportedPos = context.findTeleportDestination(cells, nextPos, dir, oldPos, creature);
    if (teleportedPos !== nextPos) {
      cells[nextPos]!.top = { id: targetTop, state: targetTopState };
      cells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      context.pushTile(cells, teleportedPos, { id: MS_TILE.Empty, state: 0 });
      cells[teleportedPos]!.top = {
        id: msCreatureTile(creature.id, dir),
        state: 0,
      };
      creature.pos = teleportedPos;
      nextPos = teleportedPos;
      if (creature.turning) {
        context.updateCreatureTile(cells, creature);
      }
    }
  }

  if (!oldWasCloneMachine) {
    context.popTile(cells, oldPos);
  }
  soundEffects |= applyCreatureFloorConsequences(context, cells, oldPos, oldWasCloneMachine, creature, nextPos, standingFloor);
  if (isMsCreature(cells[nextPos]!.bottom.id)) {
    const targetId = msCreatureId(cells[nextPos]!.bottom.id);
    if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      setChipCollided();
    }
  }
  return movedMovement(soundEffects);
}

export function moveMsCreatureDownOneLayer(
  context: MsCreatureMovementContext,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  creature: MsCreatureMovementCreature,
  setChipCollided: () => void,
): MovementAttemptResult {
  const oldPos = creature.pos;
  const sourceZ = creature.z ?? context.runtimeCellZ(sourceCells, oldPos);
  const targetZ = Math.max(1, sourceZ - 1);
  let nextPos = oldPos;
  const targetTop = targetCells[nextPos]!.top.id;
  const targetTopState = targetCells[nextPos]!.top.state;
  const targetBottom = targetCells[nextPos]!.bottom.id;
  const targetBottomState = targetCells[nextPos]!.bottom.state;
  const standingFloorWasTop = !isMsCreature(targetTop);
  let soundEffects = 0;

  creature.released = false;
  creature.hasMoved = false;
  context.pushTile(targetCells, nextPos, { id: MS_TILE.Empty, state: 0 });
  targetCells[nextPos]!.top = {
    id: msCreatureTile(creature.id, creature.dir),
    state: 0,
  };

  creature.pos = nextPos;
  creature.z = targetZ;
  if (creature.turning) {
    context.updateCreatureTile(targetCells, creature);
  }

  const standingFloor = standingFloorWasTop ? targetTop : targetBottom;
  const standingFloorState = standingFloorWasTop ? targetTopState : targetBottomState;

  switch (msActorArrivalAction(standingFloor, creature.id)) {
    case "creature-water":
    case "creature-fire":
      targetCells[nextPos]!.top = { id: targetTop, state: targetTopState };
      targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      context.popTile(sourceCells, oldPos);
      creature.pos = oldPos;
      creature.z = sourceZ;
      creature.hidden = true;
      context.clearCreatureFloorMovement(creature);
      return movedMovement(soundEffects);
    case "creature-bomb":
      targetCells[nextPos]!.top = { id: MS_TILE.Empty, state: 0 };
      targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      context.popTile(sourceCells, oldPos);
      creature.pos = oldPos;
      creature.z = sourceZ;
      creature.hidden = true;
      context.clearCreatureFloorMovement(creature);
      soundEffects |= 1 << MS_SOUND.BombExplodes;
      return movedMovement(soundEffects);
    default:
      break;
  }

  if (standingFloor === MS_TILE.Teleport && (standingFloorState & MS_FLOOR_STATE.Broken) === 0) {
    const teleportedPos = context.findTeleportDestination(targetCells, nextPos, creature.dir, undefined, creature);
    if (teleportedPos !== nextPos) {
      targetCells[nextPos]!.top = { id: targetTop, state: targetTopState };
      targetCells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
      context.pushTile(targetCells, teleportedPos, { id: MS_TILE.Empty, state: 0 });
      targetCells[teleportedPos]!.top = {
        id: msCreatureTile(creature.id, creature.dir),
        state: 0,
      };
      creature.pos = teleportedPos;
      nextPos = teleportedPos;
      if (creature.turning) {
        context.updateCreatureTile(targetCells, creature);
      }
    }
  }

  context.popTile(sourceCells, oldPos);
  soundEffects |= applyCreatureFloorConsequences(context, targetCells, oldPos, false, creature, nextPos, standingFloor, false);
  if (isMsCreature(targetCells[nextPos]!.bottom.id)) {
    const targetId = msCreatureId(targetCells[nextPos]!.bottom.id);
    if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
      setChipCollided();
    }
  }
  if (isIceFloor(standingFloor)) {
    context.clearCreatureFloorMovement(creature);
  } else {
    context.syncCreatureFloorMovement(targetCells, creature);
    context.syncVerticalFloorMovement(creature);
  }
  return movedMovement(soundEffects);
}

export function moveMsCreatureUpOneLayer(
  context: MsCreatureMovementContext,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  creature: MsCreatureMovementCreature,
  setChipCollided: () => void,
  isValidElevatorDestinationFloor: (floor: number) => boolean,
): MovementAttemptResult {
  const oldPos = creature.pos;
  const sourceZ = creature.z ?? context.runtimeCellZ(sourceCells, oldPos);
  const targetZ = sourceZ + 1;
  const targetTop = targetCells[oldPos]!.top.id;
  const targetTopState = targetCells[oldPos]!.top.state;
  const targetBottom = targetCells[oldPos]!.bottom.id;
  const targetBottomState = targetCells[oldPos]!.bottom.state;
  const targetActorId =
    targetTop === MS_TILE.Block_Static ? MS_TILE.Block : isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  const standingFloor = targetActorId !== MS_TILE.Empty ? targetBottom : targetTop;
  let soundEffects = 0;

  if (!isValidElevatorDestinationFloor(standingFloor)) {
    return blockedMovement(soundEffects);
  }
  if (context.chipActsWallForMobs(oldPos, targetZ)) {
    return blockedMovement(soundEffects);
  }
  if (targetActorId !== MS_TILE.Empty && targetActorId !== MS_TILE.Chip && targetActorId !== MS_TILE.Swimming_Chip) {
    return blockedMovement(soundEffects);
  }

  creature.released = false;
  creature.hasMoved = false;
  context.pushTile(targetCells, oldPos, { id: MS_TILE.Empty, state: 0 });
  targetCells[oldPos]!.top = {
    id: msCreatureTile(creature.id, creature.dir),
    state: 0,
  };

  creature.pos = oldPos;
  creature.z = targetZ;
  if (creature.turning) {
    context.updateCreatureTile(targetCells, creature);
  }

  context.popTile(sourceCells, oldPos);
  const savedPos = creature.pos;
  const savedZ = creature.z;
  creature.pos = oldPos;
  creature.z = sourceZ;
  if (standingFloor === MS_TILE.Button_Red) {
    creature.moving = 1;
  }
  soundEffects |= context.resolveButtonFloorEffects(targetCells, oldPos, standingFloor, creature);
  creature.moving = 0;
  creature.pos = savedPos;
  creature.z = savedZ;

  if (targetActorId === MS_TILE.Chip || targetActorId === MS_TILE.Swimming_Chip) {
    setChipCollided();
  }

  context.syncCreatureFloorMovement(targetCells, creature);
  context.syncVerticalFloorMovement(creature);
  return movedMovement(soundEffects);
}
