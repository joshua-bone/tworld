import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult, hasVerticalSupport } from "@game-core/api/verticalMovement";
import {
  actorInventoryUseKey,
  createKeysBootsToolsActorLocalInventoryOwner,
  createNoActorLocalInventoryOwner,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import { addTopTileFlags, promoteBottomTile, removeTopTileFlags, replaceTopTile, topTileIdOr } from "@game-core/impl/board";
import { normalizeCardinalDirection as normalizeDirection } from "@game-core/impl/grid";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import {
  lynxActorLocalInventoryMode,
  lynxDoorKeyIndex,
  lynxInventorySlot,
  lynxTileForcedFloorKind,
  lynxTileHasTag,
} from "@ruleset-lynx/impl/catalog";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

export type LynxMoveKind = "planar" | "air" | "elevator";

export interface LynxRuntimeActorVerticalState {
  id: number;
  pos: number;
  z?: number;
  moving: number;
  frame: number;
  moveKind?: LynxMoveKind;
  ignoreIceFromAir?: boolean;
}

export interface LynxVisibleActorLookup {
  id: number;
}

export interface LynxVerticalSupportContext {
  state: EngineState;
  chipPos: number;
  chipZ: number;
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
  findVisibleActorAt(pos: number, z: number): LynxVisibleActorLookup | null;
  lowerCells(z?: number): EngineMapCell[] | null;
  upperCells(z?: number): EngineMapCell[] | null;
}

export interface LynxVerticalLayerAccess {
  cellsForZ(z: number): EngineMapCell[];
  setActiveLayer(z: number): void;
}

function lynxChipInventoryOwner(inventory: Pick<EngineState["inventory"], "keys" | "boots" | "tools">): ActorLocalInventoryOwner {
  return lynxActorLocalInventoryMode(MS_TILE.Chip) === "keys-boots-tools"
    ? createKeysBootsToolsActorLocalInventoryOwner("chip", inventory as ActorKeysBootsToolsInventory)
    : createNoActorLocalInventoryOwner("chip");
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

function lynxTopTileSupportsNonChipFromAbove(id: number): boolean {
  return (
    lynxInventorySlot(id) === "tools" ||
    isLynxSupportingWallTile(id) ||
    id === MS_TILE.BlueWall_Fake ||
    lynxTileHasTag(id, "door") ||
    id === MS_TILE.Socket
  );
}

function isLynxAir(id: number): boolean {
  return lynxTileForcedFloorKind(id) === "air";
}

function isLynxSlide(id: number): boolean {
  return lynxTileForcedFloorKind(id) === "slide";
}

function isLynxElevator(id: number): boolean {
  return lynxTileForcedFloorKind(id) === "elevator";
}

export function resolveLynxChipSupportBelow(
  context: LynxVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
): VerticalSupportResult {
  const chipInventory = lynxChipInventoryOwner(context.state.inventory);
  if (!lowerCells) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const actorBelow = context.findVisibleActorAt(pos, z);
  if (actorBelow) {
    if (actorBelow.id === MS_TILE.Block) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const topId = cell.top.id;
  const bottomId = cell.bottom.id;

  if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (isLynxSupportingWallTile(topId)) {
    if (topId === MS_TILE.BlueWall_Real) {
      replaceTopTile(lowerCells, pos, { ...cell.top, id: MS_TILE.Wall });
    }
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (topId === MS_TILE.BlueWall_Fake) {
    promoteBottomTile(lowerCells, pos, MS_TILE.Empty);
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  if (lynxTileHasTag(topId, "door")) {
    const keyIndex = lynxDoorKeyIndex(topId);
    if (keyIndex !== null && actorInventoryUseKey(chipInventory, keyIndex, { consume: topId !== MS_TILE.Door_Green })) {
      promoteBottomTile(lowerCells, pos, MS_TILE.Empty);
      return VERTICAL_SUPPORT_RESULT.unsupported;
    }
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (topId === MS_TILE.Socket) {
    if (context.state.inventory.chipsNeeded === 0) {
      promoteBottomTile(lowerCells, pos, MS_TILE.Empty);
      return VERTICAL_SUPPORT_RESULT.unsupported;
    }
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  return VERTICAL_SUPPORT_RESULT.unsupported;
}

export function resolveLynxNonChipSupportBelow(
  context: LynxVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
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

  if (topId === MS_TILE.CloneMachine || bottomId === MS_TILE.CloneMachine) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (topId === MS_TILE.Elevator || bottomId === MS_TILE.Elevator) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (context.chipZ === z && context.chipPos === pos) {
    if (context.chipActsWallForMobs(pos, z)) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  if (context.findVisibleActorAt(pos, z)) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  if (lynxTopTileSupportsNonChipFromAbove(topId)) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  return VERTICAL_SUPPORT_RESULT.unsupported;
}

export function isValidLynxElevatorDestinationFloor(floorId: number): boolean {
  return isLynxAir(floorId) || isLynxSlide(floorId) || isLynxElevator(floorId) || lynxTileHasTag(floorId, "exit");
}

export function canLynxChipUseElevator(
  context: LynxVerticalSupportContext,
  chipDir: number,
  canPushBlockingBlock: (pushDir: number, targetZ: number) => boolean,
): boolean {
  const targetZ = context.chipZ + 1;
  const upperCells = context.upperCells(context.chipZ);
  if (!upperCells || !isValidLynxElevatorDestinationFloor(topTileIdOr(upperCells, context.chipPos, MS_TILE.Empty))) {
    return false;
  }

  const actorAbove = context.findVisibleActorAt(context.chipPos, targetZ);
  if (!actorAbove || actorAbove.id !== MS_TILE.Block) {
    return true;
  }

  const pushDir = normalizeDirection(chipDir);
  if (pushDir === MS_DIRECTION.none) {
    return false;
  }

  return canPushBlockingBlock(pushDir, targetZ);
}

export function startLynxChipAirMovement(
  layers: LynxVerticalLayerAccess,
  chipPos: number,
  chipZ: number,
): { chipPos: number; chipZ: number; chipMoving: number; chipMoveKind: LynxMoveKind } {
  const currentZ = chipZ;
  const targetZ = Math.max(1, currentZ - 1);
  if (targetZ === currentZ) {
    return { chipPos, chipZ, chipMoving: 0, chipMoveKind: "planar" };
  }

  layers.setActiveLayer(targetZ);
  return {
    chipPos,
    chipZ: targetZ,
    chipMoving: 8,
    chipMoveKind: "air",
  };
}

export function startLynxChipElevatorMovement(
  context: LynxVerticalSupportContext,
  chipDir: number,
  layers: Pick<LynxVerticalLayerAccess, "setActiveLayer">,
  tryPushBlockingBlock: (pushDir: number, targetZ: number) => boolean,
): { chipPos: number; chipZ: number; chipMoving: number; chipMoveKind: LynxMoveKind } {
  const targetZ = context.chipZ + 1;
  const upperCells = context.upperCells(context.chipZ);
  if (!upperCells || !isValidLynxElevatorDestinationFloor(topTileIdOr(upperCells, context.chipPos, MS_TILE.Empty))) {
    context.addTileOverlay(context.chipZ, context.chipPos, "elevator-failure");
    return { chipPos: context.chipPos, chipZ: context.chipZ, chipMoving: 0, chipMoveKind: "planar" };
  }

  const actorAbove = context.findVisibleActorAt(context.chipPos, targetZ);
  if (actorAbove?.id === MS_TILE.Block) {
    const pushDir = normalizeDirection(chipDir);
    if (pushDir === MS_DIRECTION.none || !tryPushBlockingBlock(pushDir, targetZ)) {
      context.addTileOverlay(context.chipZ, context.chipPos, "elevator-failure");
      return { chipPos: context.chipPos, chipZ: context.chipZ, chipMoving: 0, chipMoveKind: "planar" };
    }
  }

  layers.setActiveLayer(targetZ);
  return {
    chipPos: context.chipPos,
    chipZ: targetZ,
    chipMoving: 8,
    chipMoveKind: "elevator",
  };
}

export function startLynxActorAirMovement(
  state: EngineState,
  actor: LynxRuntimeActorVerticalState,
  layers: Pick<LynxVerticalLayerAccess, "cellsForZ">,
): boolean {
  const currentZ = actor.z ?? 1;
  const targetZ = Math.max(1, currentZ - 1);
  if (targetZ === currentZ) {
    return false;
  }

  removeTopTileFlags(layers.cellsForZ(currentZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  actor.z = targetZ;
  actor.moving = 8;
  actor.frame = 4;
  actor.moveKind = "air";
  addTopTileFlags(layers.cellsForZ(targetZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  return true;
}

export function startLynxActorElevatorMovement(
  context: LynxVerticalSupportContext,
  actor: LynxRuntimeActorVerticalState,
  layers: Pick<LynxVerticalLayerAccess, "cellsForZ">,
): boolean {
  const currentZ = actor.z ?? 1;
  const targetZ = currentZ + 1;
  const upperCells = context.upperCells(actor.z);
  if (!upperCells || !isValidLynxElevatorDestinationFloor(topTileIdOr(upperCells, actor.pos, MS_TILE.Empty))) {
    context.addTileOverlay(currentZ, actor.pos, "elevator-failure");
    return false;
  }
  if (context.chipActsWallForMobs(actor.pos, targetZ)) {
    context.addTileOverlay(currentZ, actor.pos, "elevator-failure");
    return false;
  }
  const actorAbove = context.findVisibleActorAt(actor.pos, targetZ);
  if (actorAbove && actorAbove.id !== MS_TILE.Chip) {
    context.addTileOverlay(currentZ, actor.pos, "elevator-failure");
    return false;
  }

  removeTopTileFlags(layers.cellsForZ(currentZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  actor.z = targetZ;
  actor.moving = 8;
  actor.frame = 4;
  actor.moveKind = "elevator";
  addTopTileFlags(layers.cellsForZ(targetZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  return true;
}

export function chipShouldStartLynxAirMove(
  context: LynxVerticalSupportContext,
  floorId: number,
): boolean {
  if (!isLynxAir(floorId)) {
    return false;
  }

  const lowerZ = Math.max(1, context.chipZ - 1);
  const lowerCells = context.lowerCells(context.chipZ);
  return !hasVerticalSupport(resolveLynxChipSupportBelow(context, lowerCells, context.chipPos, lowerZ, context.chipZ));
}
