import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport, type ActorAirHook } from "@game-core/api/actorCapabilities";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult } from "@game-core/api/verticalMovement";
import { actorInventoryUseKey, type ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import {
  lynxButtonAction,
  lynxDoorKeyIndex,
  lynxInventorySlot,
  lynxTileHasTag,
} from "@ruleset-lynx/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxTileActivationContext {
  toggleWalls(): void;
  queueTankReversals(): void;
  activateCloner(buttonPos: number): boolean;
  buttonPushedSound: number;
}

export interface LynxTileSupportContext {
  state: EngineState;
  chipPos: number;
  chipZ: number;
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
  findVisibleActorAt(pos: number, z: number): { id: number } | null;
}

export interface LynxTileSupportSubject {
  airHook: ActorAirHook;
  inventoryOwner: ActorLocalInventoryOwner | null;
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

export function isLynxBlockedChipEnterRevealTile(tileId: number): boolean {
  return tileId === MS_TILE.HiddenWall_Temp || tileId === MS_TILE.BlueWall_Real;
}

export function applyLynxBlockedChipEnterEffect(state: EngineState, pos: number): boolean {
  const cell = state.map.cells[pos];
  if (!cell || !isLynxBlockedChipEnterRevealTile(cell.top.id)) {
    return false;
  }

  replaceTopTile(state.map.cells, pos, { ...cell.top, id: MS_TILE.Wall });
  return true;
}

export function applyLynxTileActivationEffect(
  context: LynxTileActivationContext,
  buttonPos: number,
  tileId: number,
): number {
  switch (lynxButtonAction(tileId)) {
    case "turn-tanks":
      context.queueTankReversals();
      return context.buttonPushedSound;
    case "toggle-walls":
      context.toggleWalls();
      return context.buttonPushedSound;
    case "activate-cloner":
      return context.activateCloner(buttonPos) ? context.buttonPushedSound : 0;
    case "spring-trap":
      return context.buttonPushedSound;
    default:
      return 0;
  }
}

export function resolveLynxTileSupportBelow(
  context: LynxTileSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
  subject: LynxTileSupportSubject,
): VerticalSupportResult {
  if (!lowerCells) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const actorBelow = context.findVisibleActorAt(pos, z);
  const topId = cell.top.id;
  const bottomId = cell.bottom.id;

  if (actorUsesChipSupport(subject.airHook)) {
    if (actorBelow) {
      if (actorBelow.id === MS_TILE.Block) {
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
      if (
        keyIndex !== null &&
        subject.inventoryOwner &&
        actorInventoryUseKey(subject.inventoryOwner, keyIndex, { consume: topId !== MS_TILE.Door_Green })
      ) {
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
