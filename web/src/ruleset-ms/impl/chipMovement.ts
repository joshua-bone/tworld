import type { EngineMapCell } from "@game-core/api/model";
import { blockedMovement, movedMovement, type MovementAttemptResult } from "@game-core/api/movementOutcomes";
import { isMsStaticBlockTile, MS_DIRECTION, MS_GRID_WIDTH, MS_SOUND, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  isMsIceForcedFloor,
  msEntryRevealsForcedFloor,
} from "@ruleset-ms/impl/elements/tiles/families/forcedFloor";
import type { MsChipEnteredTileResolution } from "@ruleset-ms/impl/chipArrival";
import type { MsNativeCausalEventSeed } from "@ruleset-ms/impl/causalEvents";

export interface MsChipMovementInternal {
  chipPos: number;
  chipZ?: number;
  chipDir: number;
  goalPos: number;
  chipStatus: "okay" | "drowned" | "burned" | "bombed" | "outoftime" | "collided";
  chipReleased: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
  completed: boolean;
}

export interface MsChipMovementContext {
  internal: MsChipMovementInternal;
  runtimeCellZ(cells: EngineMapCell[], pos: number): number;
  applyEnterEffects(cells: EngineMapCell[], nextPos: number): MsChipEnteredTileResolution;
  teleportDestination(cells: EngineMapCell[], start: number, dir: number): { destination: number; soundEffects: number };
  popTile(cells: EngineMapCell[], pos: number): void;
  applyMobExitFloorEffect(cells: EngineMapCell[], pos: number): void;
  pushTile(cells: EngineMapCell[], pos: number, tile: EngineMapCell["top"]): void;
  settlePrimedToolDrop(cells: EngineMapCell[], pos: number, z: number): void;
  preservesUnderlyingFloor(cell: EngineMapCell): boolean;
  updateChipTile(cells: EngineMapCell[]): void;
  resolveButtonFloorEffects(cells: EngineMapCell[], pos: number, floor: number, z?: number): number;
  isTrapOpen(cells: EngineMapCell[], trapPos: number, skipButtonPos: number, z: number): boolean;
  hasTrapConnection(pos: number, z: number): boolean;
  refreshFloorMovement(cells: EngineMapCell[], floorId: number, floorState: number): void;
  handleDeferredButtons(cells: EngineMapCell[]): number;
  isExitFloor(tileId: number): boolean;
  hasIceBoot(): boolean;
  elevatorDestinationFloor(cell: EngineMapCell): number;
  isValidElevatorDestinationFloor(floor: number): boolean;
  pushStaticBlock(targetCells: EngineMapCell[], pos: number, pushDir: number): boolean;
  normalizeDirection(dir: number): number;
  recordCausalEvent?(event: MsNativeCausalEventSeed): void;
}

function chipTileId(internal: MsChipMovementInternal, dir: number): number {
  switch (internal.chipStatus) {
    case "drowned":
      return MS_TILE.Drowned_Chip;
    case "burned":
      return MS_TILE.Burned_Chip;
    case "bombed":
      return MS_TILE.Bombed_Chip;
    default:
      return msCreatureTile(MS_TILE.Chip, dir);
  }
}

function placeChipOnDestination(
  context: MsChipMovementContext,
  cells: EngineMapCell[],
  oldPos: number,
  nextPos: number,
  dir: number,
  floor: number,
  floorMovementTileId: number,
  floorMovementTileState: number,
  oldZ: number,
  targetZ: number,
  causalMovementAfterPos: number,
  movementRole: "self" | "forced",
  refreshFloorMovement: boolean = true,
  recordMovement: boolean = true,
): number {
  const landingCell = cells[nextPos]!;
  if (!context.preservesUnderlyingFloor(landingCell)) {
    context.pushTile(cells, nextPos, { id: MS_TILE.Empty, state: 0 });
  }
  cells[nextPos]!.top = {
    id: chipTileId(context.internal, dir),
    state: 0,
  };

  context.internal.chipPos = nextPos;
  context.internal.chipDir = dir;
  context.internal.chipZ = targetZ;
  if (context.internal.goalPos === context.internal.chipPos) {
    context.internal.goalPos = -1;
  }
  if (context.internal.chipStatus === "okay") {
    context.updateChipTile(cells);
  }

  let soundEffects = context.resolveButtonFloorEffects(cells, context.internal.chipPos, floor, targetZ === oldZ ? undefined : targetZ);
  if (floor === MS_TILE.Beartrap) {
    context.internal.chipReleased = context.isTrapOpen(cells, nextPos, oldPos, targetZ);
  } else if (cells[nextPos]!.bottom.id === MS_TILE.Beartrap) {
    context.internal.chipReleased = context.hasTrapConnection(nextPos, targetZ);
  }
  const completedBeforeMove = context.internal.completed;
  const exitTileId = cells[nextPos]!.bottom.id;
  if (context.internal.chipStatus === "okay" && context.isExitFloor(exitTileId)) {
    context.internal.completed = true;
  }

  if (refreshFloorMovement) {
    context.refreshFloorMovement(cells, floorMovementTileId, floorMovementTileState);
  }
  if (recordMovement) {
    context.recordCausalEvent?.({
      kind: "move-completed",
      actorId: MS_TILE.Chip,
      actorSerial: null,
      tileId: floor,
      direction: dir,
      movementRole,
      before: { pos: oldPos, z: oldZ },
      after: { pos: causalMovementAfterPos, z: targetZ },
      phase: "movement-commit",
    });
  }
  if (!completedBeforeMove && context.internal.completed) {
    context.recordCausalEvent?.({
      kind: "complete-level",
      actorId: MS_TILE.Chip,
      actorSerial: null,
      tileId: exitTileId,
      direction: dir,
      before: { pos: nextPos, z: targetZ },
      after: { pos: nextPos, z: targetZ },
      phase: "terminal-latch",
    });
  }
  soundEffects |= context.handleDeferredButtons(cells);
  return soundEffects;
}

export function moveMsChipPlanar(
  context: MsChipMovementContext,
  cells: EngineMapCell[],
  dir: number,
): MovementAttemptResult {
  const oldPos = context.internal.chipPos;
  const oldZ = context.internal.chipZ ?? context.runtimeCellZ(cells, oldPos);
  const movementRole = context.internal.floorMovement === "none" ? "self" : "forced";
  let nextPos =
    oldPos +
    (dir === MS_DIRECTION.north
      ? -MS_GRID_WIDTH
      : dir === MS_DIRECTION.south
        ? MS_GRID_WIDTH
        : dir === MS_DIRECTION.west
          ? -1
          : 1);
  let soundEffects = 0;
  context.internal.chipReleased = false;

  const movementAfterPos = nextPos;
  const movementTileId = cells[nextPos]!.top.id;
  context.recordCausalEvent?.({
    kind: "move-completed",
    actorId: MS_TILE.Chip,
    actorSerial: null,
    tileId: movementTileId,
    direction: dir,
    movementRole,
    before: { pos: oldPos, z: oldZ },
    after: { pos: movementAfterPos, z: oldZ },
    phase: "movement-commit",
  });
  const enteredEffects = context.applyEnterEffects(cells, nextPos);
  const floor = enteredEffects.floorTileBeforeMove.id;
  const movementFloorTile = enteredEffects.movementFloorTile;
  const deferForcedFloorRefresh = msEntryRevealsForcedFloor(floor, movementFloorTile.id);
  soundEffects |= enteredEffects.soundEffects;

  context.popTile(cells, oldPos);
  context.settlePrimedToolDrop(cells, oldPos, oldZ);
  context.applyMobExitFloorEffect(cells, oldPos);

  if (enteredEffects.enteredTeleport) {
    context.settlePrimedToolDrop(cells, nextPos, oldZ);
    const teleported = context.teleportDestination(cells, nextPos, dir);
    nextPos = teleported.destination;
    soundEffects |= teleported.soundEffects;
    soundEffects |= 1 << MS_SOUND.Teleporting;
  }

  soundEffects |= placeChipOnDestination(
    context,
    cells,
    oldPos,
    nextPos,
    dir,
    floor,
    deferForcedFloorRefresh ? floor : movementFloorTile.id,
    deferForcedFloorRefresh ? enteredEffects.floorTileBeforeMove.state : movementFloorTile.state,
    oldZ,
    oldZ,
    movementAfterPos,
    movementRole,
    true,
    false,
  );

  return movedMovement(soundEffects);
}

export function moveMsChipDownOneLayer(
  context: MsChipMovementContext,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
): MovementAttemptResult {
  const oldPos = context.internal.chipPos;
  const oldZ = context.internal.chipZ ?? context.runtimeCellZ(sourceCells, oldPos);
  const targetZ = Math.max(1, oldZ - 1);
  const movementRole = context.internal.floorMovement === "none" ? "self" : "forced";
  let nextPos = oldPos;
  let soundEffects = 0;
  context.internal.chipReleased = false;

  const enteredFloor = targetCells[nextPos]!.top.id;
  const enteredFloorState = targetCells[nextPos]!.top.state;
  const movementAfterPos = nextPos;
  context.recordCausalEvent?.({
    kind: "move-completed",
    actorId: MS_TILE.Chip,
    actorSerial: null,
    tileId: enteredFloor,
    direction: context.internal.chipDir,
    movementRole,
    before: { pos: oldPos, z: oldZ },
    after: { pos: movementAfterPos, z: targetZ },
    phase: "movement-commit",
  });
  const enteredEffects = context.applyEnterEffects(targetCells, nextPos);
  const floor = enteredEffects.floorTileBeforeMove.id;
  const movementFloorTile = enteredEffects.movementFloorTile;
  const deferForcedFloorRefresh = msEntryRevealsForcedFloor(floor, movementFloorTile.id);
  const suppressIceRefresh =
    !deferForcedFloorRefresh &&
    isMsIceForcedFloor(enteredFloor) &&
    !context.hasIceBoot();
  soundEffects |= enteredEffects.soundEffects;

  context.popTile(sourceCells, oldPos);
  context.settlePrimedToolDrop(sourceCells, oldPos, oldZ);
  context.applyMobExitFloorEffect(sourceCells, oldPos);
  context.internal.chipZ = targetZ;

  if (enteredEffects.enteredTeleport) {
    context.settlePrimedToolDrop(targetCells, nextPos, targetZ);
    const teleported = context.teleportDestination(targetCells, nextPos, context.internal.chipDir);
    nextPos = teleported.destination;
    soundEffects |= teleported.soundEffects;
    soundEffects |= 1 << MS_SOUND.Teleporting;
  }

  soundEffects |= placeChipOnDestination(
    context,
    targetCells,
    oldPos,
    nextPos,
    context.internal.chipDir,
    floor,
    deferForcedFloorRefresh ? floor : enteredFloor,
    deferForcedFloorRefresh ? enteredEffects.floorTileBeforeMove.state : enteredFloorState,
    oldZ,
    targetZ,
    movementAfterPos,
    movementRole,
    !suppressIceRefresh && !deferForcedFloorRefresh,
    false,
  );

  if (suppressIceRefresh || deferForcedFloorRefresh) {
    context.internal.floorMovement = "none";
    context.internal.floorMovementDir = MS_DIRECTION.none;
  }

  return movedMovement(soundEffects);
}

export function moveMsChipUpOneLayer(
  context: MsChipMovementContext,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
): MovementAttemptResult {
  const oldPos = context.internal.chipPos;
  const oldZ = context.internal.chipZ ?? context.runtimeCellZ(sourceCells, oldPos);
  const targetZ = oldZ + 1;
  const movementRole = context.internal.floorMovement === "none" ? "self" : "forced";
  let nextPos = oldPos;
  let nextCell = targetCells[nextPos]!;
  let destinationFloor = context.elevatorDestinationFloor(nextCell);
  if (!context.isValidElevatorDestinationFloor(destinationFloor)) {
    return blockedMovement();
  }

  if (isMsStaticBlockTile(nextCell.top.id)) {
    const pushDir = context.normalizeDirection(context.internal.chipDir);
    if (pushDir === MS_DIRECTION.none || !context.pushStaticBlock(targetCells, nextPos, pushDir)) {
      return blockedMovement();
    }
    nextCell = targetCells[nextPos]!;
    destinationFloor = context.elevatorDestinationFloor(nextCell);
    if (!context.isValidElevatorDestinationFloor(destinationFloor)) {
      return blockedMovement();
    }
  }

  let soundEffects = 0;
  context.internal.chipReleased = false;
  context.recordCausalEvent?.({
    kind: "move-completed",
    actorId: MS_TILE.Chip,
    actorSerial: null,
    tileId: nextCell.top.id,
    direction: context.internal.chipDir,
    movementRole,
    before: { pos: oldPos, z: oldZ },
    after: { pos: nextPos, z: targetZ },
    phase: "movement-commit",
  });
  const enteredEffects = context.applyEnterEffects(targetCells, nextPos);
  const floor = enteredEffects.floorTileBeforeMove.id;
  const movementFloorTile = enteredEffects.movementFloorTile;
  const deferForcedFloorRefresh = msEntryRevealsForcedFloor(floor, movementFloorTile.id);
  soundEffects |= enteredEffects.soundEffects;

  context.popTile(sourceCells, oldPos);
  context.settlePrimedToolDrop(sourceCells, oldPos, oldZ);
  context.applyMobExitFloorEffect(sourceCells, oldPos);
  context.internal.chipZ = targetZ;

  soundEffects |= placeChipOnDestination(
    context,
    targetCells,
    oldPos,
    nextPos,
    context.internal.chipDir,
    floor,
    deferForcedFloorRefresh ? floor : movementFloorTile.id,
    deferForcedFloorRefresh ? enteredEffects.floorTileBeforeMove.state : movementFloorTile.state,
    oldZ,
    targetZ,
    nextPos,
    movementRole,
    true,
    false,
  );

  return movedMovement(soundEffects);
}
