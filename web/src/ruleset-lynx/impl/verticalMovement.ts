import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult, hasVerticalSupport } from "@game-core/api/verticalMovement";
import { type ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { addTopTileFlags, removeTopTileFlags, topTileIdOr } from "@game-core/impl/board";
import { normalizeCardinalDirection as normalizeDirection } from "@game-core/impl/grid";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import {
  lynxActorSupportFamilyHooks,
  lynxTileForcedFloorKind,
  lynxTileHasTag,
} from "@ruleset-lynx/impl/catalog";
import { projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
import {
  resolveLynxTileSupportBelow,
} from "@ruleset-lynx/impl/tileEffects";
import {
  type LynxTileSupportContext,
  type LynxTileSupportSubject,
} from "@ruleset-lynx/impl/elements/tiles/families/support";
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

export interface LynxVerticalSupportContext extends LynxTileSupportContext {
  lowerCells(z?: number): EngineMapCell[] | null;
  upperCells(z?: number): EngineMapCell[] | null;
}

export interface LynxVerticalLayerAccess {
  cellsForZ(z: number): EngineMapCell[];
  setActiveLayer(z: number): void;
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

function lynxVerticalSupportSubject(
  actorId: number,
  inventoryOwner: ActorLocalInventoryOwner | null,
): LynxTileSupportSubject {
  return {
    airHook: lynxActorSupportFamilyHooks(actorId).airHook,
    inventoryOwner,
  };
}

export function resolveLynxChipSupportBelow(
  context: LynxVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
): VerticalSupportResult {
  return resolveLynxActorSupportBelow(
    context,
    lowerCells,
    pos,
    z,
    currentZ,
    lynxVerticalSupportSubject(MS_TILE.Chip, projectLynxActorInventoryOwner(MS_TILE.Chip, context.state.inventory)),
  );
}

export function resolveLynxActorSupportBelow(
  context: LynxVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
  subject: LynxTileSupportSubject,
): VerticalSupportResult {
  return resolveLynxTileSupportBelow(context, lowerCells, pos, z, currentZ, subject);
}

export function resolveLynxNonChipSupportBelow(
  context: LynxVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
): VerticalSupportResult {
  return resolveLynxRuntimeActorSupportBelow(context, lowerCells, MS_TILE.Block, null, pos, z, currentZ);
}

export function resolveLynxRuntimeActorSupportBelow(
  context: LynxVerticalSupportContext,
  lowerCells: EngineMapCell[] | null,
  actorId: number,
  inventoryOwner: ActorLocalInventoryOwner | null,
  pos: number,
  z: number,
  currentZ: number,
): VerticalSupportResult {
  return resolveLynxActorSupportBelow(
    context,
    lowerCells,
    pos,
    z,
    currentZ,
    lynxVerticalSupportSubject(actorId, inventoryOwner),
  );
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
  applyMobExitFloorEffect: (pos: number, z: number) => void,
): { chipPos: number; chipZ: number; chipMoving: number; chipMoveKind: LynxMoveKind } {
  const currentZ = chipZ;
  const targetZ = Math.max(1, currentZ - 1);
  if (targetZ === currentZ) {
    return { chipPos, chipZ, chipMoving: 0, chipMoveKind: "planar" };
  }

  applyMobExitFloorEffect(chipPos, currentZ);
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
  applyMobExitFloorEffect: (pos: number, z: number) => void,
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

  applyMobExitFloorEffect(context.chipPos, context.chipZ);
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
  applyMobExitFloorEffect: (pos: number, z: number) => void,
): boolean {
  const currentZ = actor.z ?? 1;
  const targetZ = Math.max(1, currentZ - 1);
  if (targetZ === currentZ) {
    return false;
  }

  removeTopTileFlags(layers.cellsForZ(currentZ), actor.pos, LYNX_CELL_FLAG.Claimed);
  applyMobExitFloorEffect(actor.pos, currentZ);
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
  applyMobExitFloorEffect: (pos: number, z: number) => void,
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
  applyMobExitFloorEffect(actor.pos, currentZ);
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
