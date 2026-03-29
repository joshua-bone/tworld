import type { EngineMapCell } from "@game-core/api/model";
import type { ActorArrivalOutcome } from "@game-core/api/actorInteractions";
import { actorFallingCollisionFailsChip } from "@game-core/api/actorSpecialFloorHooks";
import { blockedMovement, movedMovement, type MovementAttemptResult } from "@game-core/api/movementOutcomes";
import { nextPosition } from "@game-core/impl/grid";
import { msActorSupportFamilyHooks, msTileForcedFloorKind } from "@ruleset-ms/impl/catalog";
import { msActorArrivalOutcome } from "@ruleset-ms/impl/actorInteractions";
import {
  applyMsCreatureCollisionAfterCompletedStep,
  applyMsCreatureCompletedStep,
  applyMsCreatureEnteredCell,
  applyMsCreatureFloorImpact,
} from "@ruleset-ms/impl/actorMovementLifecycle";
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

function applyMsCreatureFallingCollision(
  creature: MsCreatureMovementCreature,
  cells: EngineMapCell[],
  nextPos: number,
  setChipCollided: () => void,
): void {
  if (!actorFallingCollisionFailsChip(msActorSupportFamilyHooks(creature.id))) {
    return;
  }

  applyMsCreatureCollisionAfterCompletedStep(cells, nextPos, setChipCollided);
}

export interface MsCreatureMovementCreature {
  serial: number;
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
  applyMobExitFloorEffect(cells: EngineMapCell[], pos: number): void;
  updateCreatureTile(cells: EngineMapCell[], creature: MsCreatureMovementCreature): void;
  handlePreMoveCollision(
    sourceCells: EngineMapCell[],
    targetCells: EngineMapCell[],
    creature: MsCreatureMovementCreature,
    nextPos: number,
    dir: number,
  ): MovementAttemptResult | null;
  resolveButtonFloorEffects(cells: EngineMapCell[], pos: number, floor: number, creature: MsCreatureMovementCreature): number;
  isTrapOpen(cells: EngineMapCell[], trapPos: number, skipButtonPos: number, z: number): boolean;
  hasTrapConnection(pos: number, z: number): boolean;
  chipActsWallForMobs(pos: number, z: number): boolean;
  arrivalOutcome(creature: MsCreatureMovementCreature, floorId: number): ActorArrivalOutcome;
  runtimeCellZ(cells: EngineMapCell[], pos: number): number;
  clearCreatureFloorMovement(creature: MsCreatureMovementCreature): void;
  syncCreatureFloorMovement(cells: EngineMapCell[], creature: MsCreatureMovementCreature): void;
  syncVerticalFloorMovement(creature: MsCreatureMovementCreature): void;
  applyArrivalEffects(cells: EngineMapCell[], creature: MsCreatureMovementCreature): number;
  removeStatefulActor(creature: MsCreatureMovementCreature): void;
  findTeleportDestination(
    cells: EngineMapCell[],
    start: number,
    dir: number,
    occupiedOriginPos: number | undefined,
    creature: MsCreatureMovementCreature,
  ): number;
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
  const arrivalCreature = arrivalActorId === creature.id ? creature : { ...creature, id: arrivalActorId };
  const oldWasCloneMachine = cells[oldPos]!.bottom.id === MS_TILE.CloneMachine;
  let nextPos = nextPosition(oldPos, dir, MS_GRID_WIDTH);
  const preMoveCollision = context.handlePreMoveCollision(cells, cells, creature, nextPos, dir);
  if (preMoveCollision) {
    return preMoveCollision;
  }
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
  nextPos = applyMsCreatureEnteredCell(
    context,
    cells,
    creature,
    nextPos,
    dir,
    oldPos,
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
    standingFloor,
    standingFloorState,
  );

  const floorImpact = applyMsCreatureFloorImpact(
    context,
    cells,
    oldPos,
    oldWasCloneMachine,
    creature,
    context.arrivalOutcome(arrivalCreature, standingFloor),
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
  );
  if (floorImpact.removed) {
    return movedMovement(soundEffects | floorImpact.soundEffects);
  }

  if (!oldWasCloneMachine) {
    context.popTile(cells, oldPos);
    context.applyMobExitFloorEffect(cells, oldPos);
  }
  soundEffects |= applyMsCreatureCompletedStep(context, cells, oldPos, oldWasCloneMachine, creature, nextPos, standingFloor);
  applyMsCreatureCollisionAfterCompletedStep(cells, nextPos, setChipCollided);
  soundEffects |= context.applyArrivalEffects(cells, creature);
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
  const preMoveCollision = context.handlePreMoveCollision(sourceCells, targetCells, creature, nextPos, creature.dir);
  if (preMoveCollision) {
    return preMoveCollision;
  }
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
  nextPos = applyMsCreatureEnteredCell(
    context,
    targetCells,
    creature,
    nextPos,
    creature.dir,
    undefined,
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
    standingFloor,
    standingFloorState,
  );

  const floorImpact = applyMsCreatureFloorImpact(
    context,
    targetCells,
    oldPos,
    false,
    creature,
    context.arrivalOutcome(creature, standingFloor),
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
  );
  if (floorImpact.removed) {
    context.popTile(sourceCells, oldPos);
    context.applyMobExitFloorEffect(sourceCells, oldPos);
    creature.pos = oldPos;
    creature.z = sourceZ;
    return movedMovement(soundEffects | floorImpact.soundEffects);
  }

  context.popTile(sourceCells, oldPos);
  context.applyMobExitFloorEffect(sourceCells, oldPos);
  soundEffects |= applyMsCreatureCompletedStep(context, targetCells, oldPos, false, creature, nextPos, standingFloor, false);
  applyMsCreatureFallingCollision(creature, targetCells, nextPos, setChipCollided);
  if (isIceFloor(standingFloor)) {
    context.clearCreatureFloorMovement(creature);
  } else {
    context.syncCreatureFloorMovement(targetCells, creature);
    context.syncVerticalFloorMovement(creature);
  }
  soundEffects |= context.applyArrivalEffects(targetCells, creature);
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
  const preMoveCollision = context.handlePreMoveCollision(sourceCells, targetCells, creature, oldPos, creature.dir);
  if (preMoveCollision) {
    return preMoveCollision;
  }
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
  context.applyMobExitFloorEffect(sourceCells, oldPos);
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
  soundEffects |= context.applyArrivalEffects(targetCells, creature);
  return movedMovement(soundEffects);
}
