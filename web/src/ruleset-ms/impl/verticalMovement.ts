import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport, type ActorAirHook } from "@game-core/api/actorCapabilities";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult, hasVerticalSupport } from "@game-core/api/verticalMovement";
import {
  actorInventoryUseKey,
  createKeysBootsToolsActorLocalInventoryOwner,
  createNoActorLocalInventoryOwner,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import { bottomTile, bottomTileIdOr, promoteBottomTile, replaceTopTile, topTile } from "@game-core/impl/board";
import { normalizeCardinalDirection as normalizeDirection } from "@game-core/impl/grid";
import {
  msActorAirHook,
  msActorLocalInventoryMode,
  msDoorKeyIndex,
  msInventorySlot,
  msIsOverlayFloorTile,
  msTileForcedFloorKind,
  msTileHasTag,
} from "@ruleset-ms/impl/catalog";
import { MS_DIRECTION, MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";

export type MsFloorMovement = "none" | "ice" | "slide" | "teleport" | "air" | "elevator";

export interface MsChipVerticalState {
  chipPos: number;
  chipZ?: number;
  chipDir: number;
  chipStatus: "okay" | "drowned" | "burned" | "bombed" | "outoftime" | "collided";
  completed: boolean;
  floorMovement: MsFloorMovement;
  floorMovementDir: number;
}

export interface MsVerticalSupportContext {
  inventory: EngineState["inventory"];
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number, tileId?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
}

export interface MsChipVerticalContext extends MsVerticalSupportContext {
  cellsForZ(z?: number): EngineMapCell[] | null;
  lowerCells(z?: number): EngineMapCell[] | null;
  upperCells(z?: number): EngineMapCell[] | null;
  canMoveBlockInto(targetCells: EngineMapCell[], pos: number, dir: number): boolean;
}

export interface MsVerticalSupportSubject {
  airHook: ActorAirHook;
  inventoryOwner: ActorLocalInventoryOwner | null;
}

function msChipInventoryOwner(inventory: Pick<EngineState["inventory"], "keys" | "boots" | "tools">): ActorLocalInventoryOwner {
  return msActorLocalInventoryMode(MS_TILE.Chip) === "keys-boots-tools"
    ? createKeysBootsToolsActorLocalInventoryOwner("chip", inventory as ActorKeysBootsToolsInventory)
    : createNoActorLocalInventoryOwner("chip");
}

function isMsSupportingWallTile(id: number): boolean {
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

function promoteTopFloorToUnderlying(cells: EngineMapCell[], pos: number): void {
  promoteBottomTile(cells, pos, MS_TILE.Empty);
}

function msTopTileSupportsNonChipFromAbove(id: number): boolean {
  return (
    msInventorySlot(id) === "tools" ||
    isMsSupportingWallTile(id) ||
    id === MS_TILE.BlueWall_Fake ||
    msTileHasTag(id, "door") ||
    id === MS_TILE.Socket
  );
}

function clearMsChipVerticalFloorMovement(chip: MsChipVerticalState, floorMovement: MsFloorMovement): void {
  if (chip.floorMovement === floorMovement) {
    chip.floorMovement = "none";
    chip.floorMovementDir = MS_DIRECTION.none;
  }
}

export function resolveMsActorSupportBelow(
  context: MsVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  currentZ: number,
  cellZ: number,
  subject: MsVerticalSupportSubject,
): VerticalSupportResult {
  if (!lowerCells) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const topId = cell.top.id;
  const bottomId = cell.bottom.id;
  const topActorId = topId === MS_TILE.Block_Static ? MS_TILE.Block : isMsCreature(topId) ? msCreatureId(topId) : null;
  if (actorUsesChipSupport(subject.airHook)) {
    if (topActorId === MS_TILE.Block) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }

    if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }

    if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }

    if (topActorId !== null) {
      return VERTICAL_SUPPORT_RESULT.unsupported;
    }

    if (isMsSupportingWallTile(topId)) {
      if (topId === MS_TILE.BlueWall_Real) {
        replaceTopTile(lowerCells, pos, { ...cell.top, id: MS_TILE.Wall });
      }
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }

    if (topId === MS_TILE.BlueWall_Fake) {
      promoteTopFloorToUnderlying(lowerCells, pos);
      return VERTICAL_SUPPORT_RESULT.unsupported;
    }

    if (msTileHasTag(topId, "door")) {
      const doorKeyIndex = msDoorKeyIndex(topId);
      if (
        doorKeyIndex !== null &&
        subject.inventoryOwner &&
        actorInventoryUseKey(subject.inventoryOwner, doorKeyIndex, { consume: topId !== MS_TILE.Door_Green })
      ) {
        promoteTopFloorToUnderlying(lowerCells, pos);
        return VERTICAL_SUPPORT_RESULT.unsupported;
      }
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }

    if (topId === MS_TILE.Socket) {
      if (context.inventory.chipsNeeded === 0) {
        promoteTopFloorToUnderlying(lowerCells, pos);
        return VERTICAL_SUPPORT_RESULT.unsupported;
      }
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }

    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (topActorId !== null) {
    const supported =
      context.chipActsWallForMobs(pos, cellZ) ||
      (topActorId !== MS_TILE.Chip && topActorId !== MS_TILE.Swimming_Chip);
    if (supported) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  if (msTopTileSupportsNonChipFromAbove(topId)) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  return VERTICAL_SUPPORT_RESULT.unsupported;
}

export function resolveMsChipSupportBelow(
  context: MsVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  currentZ: number,
): VerticalSupportResult {
  return resolveMsActorSupportBelow(context, lowerCells, pos, currentZ, currentZ, {
    airHook: msActorAirHook(MS_TILE.Chip),
    inventoryOwner: msChipInventoryOwner(context.inventory),
  });
}

export function resolveMsNonChipSupportBelow(
  context: MsVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  currentZ: number,
  cellZ: number,
): VerticalSupportResult {
  return resolveMsActorSupportBelow(context, lowerCells, pos, currentZ, cellZ, {
    airHook: msActorAirHook(MS_TILE.Block),
    inventoryOwner: null,
  });
}

function elevatorDestinationFloor(cell: EngineMapCell): number {
  if (cell.top.id === MS_TILE.Block_Static || isMsCreature(cell.top.id)) {
    return cell.bottom.id;
  }
  return cell.top.id;
}

function isAirFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "air";
}

function isSlideFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "slide";
}

function isElevatorFloor(floor: number): boolean {
  return msTileForcedFloorKind(floor) === "elevator";
}

export function canChipUseMsElevator(
  targetCells: EngineMapCell[] | null,
  pos: number,
  dir: number,
  canMoveBlockInto: (targetCells: EngineMapCell[], pos: number, dir: number) => boolean,
): boolean {
  if (!targetCells) {
    return false;
  }

  const nextCell = targetCells[pos];
  if (!nextCell) {
    return false;
  }

  const destinationFloor = elevatorDestinationFloor(nextCell);
  if (!(isAirFloor(destinationFloor) || isSlideFloor(destinationFloor) || isElevatorFloor(destinationFloor) || destinationFloor === MS_TILE.Exit)) {
    return false;
  }

  if (nextCell.top.id !== MS_TILE.Block_Static) {
    return true;
  }

  const pushDir = normalizeDirection(dir);
  if (pushDir === MS_DIRECTION.none) {
    return false;
  }

  const x = pos % MS_GRID_WIDTH;
  const y = Math.floor(pos / MS_GRID_WIDTH);
  const nextX = x + (pushDir === MS_DIRECTION.west ? -1 : pushDir === MS_DIRECTION.east ? 1 : 0);
  const nextY = y + (pushDir === MS_DIRECTION.north ? -1 : pushDir === MS_DIRECTION.south ? 1 : 0);
  if (nextX < 0 || nextX >= MS_GRID_WIDTH || nextY < 0 || nextY >= MS_GRID_HEIGHT) {
    return false;
  }

  return canMoveBlockInto(targetCells, nextY * MS_GRID_WIDTH + nextX, pushDir);
}

export function canNonChipUseMsElevator(
  targetCells: EngineMapCell[] | null,
  pos: number,
  chipActsWallForMobs: (pos: number, z: number) => boolean,
  cellZ: number,
): boolean {
  if (!targetCells) {
    return false;
  }

  const nextCell = targetCells[pos];
  if (!nextCell) {
    return false;
  }
  if (chipActsWallForMobs(pos, cellZ)) {
    return false;
  }

  const destinationFloor = elevatorDestinationFloor(nextCell);
  if (!(isAirFloor(destinationFloor) || isSlideFloor(destinationFloor) || isElevatorFloor(destinationFloor) || destinationFloor === MS_TILE.Exit)) {
    return false;
  }

  const targetTop = nextCell.top.id;
  const targetCreatureId = isMsCreature(targetTop) ? msCreatureId(targetTop) : MS_TILE.Empty;
  return (
    targetTop !== MS_TILE.Block_Static &&
    (targetCreatureId === MS_TILE.Empty || targetCreatureId === MS_TILE.Chip || targetCreatureId === MS_TILE.Swimming_Chip)
  );
}

export function syncMsChipAirFloorMovement(context: MsChipVerticalContext, chip: MsChipVerticalState): void {
  const chipZ = chip.chipZ ?? 1;
  const cells = context.cellsForZ(chipZ);
  if (!cells) {
    return;
  }

  if (chip.chipStatus !== "okay" || chip.completed) {
    clearMsChipVerticalFloorMovement(chip, "air");
    return;
  }

  if (!isAirFloor(bottomTileIdOr(cells, chip.chipPos, MS_TILE.Empty))) {
    clearMsChipVerticalFloorMovement(chip, "air");
    return;
  }

  const lowerCells = context.lowerCells(chipZ);
  if (hasVerticalSupport(resolveMsChipSupportBelow(context, lowerCells, chip.chipPos, chipZ))) {
    chip.floorMovement = "none";
    chip.floorMovementDir = MS_DIRECTION.none;
    return;
  }

  chip.floorMovement = "air";
  chip.floorMovementDir = MS_DIRECTION.north;
}

export function syncMsChipElevatorFloorMovement(context: MsChipVerticalContext, chip: MsChipVerticalState): void {
  const chipZ = chip.chipZ ?? 1;
  const cells = context.cellsForZ(chipZ);
  if (!cells) {
    return;
  }

  if (chip.chipStatus !== "okay" || chip.completed) {
    clearMsChipVerticalFloorMovement(chip, "elevator");
    return;
  }

  if (!isElevatorFloor(bottomTileIdOr(cells, chip.chipPos, MS_TILE.Empty))) {
    clearMsChipVerticalFloorMovement(chip, "elevator");
    return;
  }

  if (!canChipUseMsElevator(context.upperCells(chipZ), chip.chipPos, chip.chipDir, context.canMoveBlockInto)) {
    chip.floorMovement = "none";
    chip.floorMovementDir = MS_DIRECTION.none;
    context.addTileOverlay(chipZ, chip.chipPos, "elevator-failure");
    return;
  }

  chip.floorMovement = "elevator";
  chip.floorMovementDir = MS_DIRECTION.south;
}
