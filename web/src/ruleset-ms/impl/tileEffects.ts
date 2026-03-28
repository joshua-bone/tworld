import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport, type ActorAirHook } from "@game-core/api/actorCapabilities";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult } from "@game-core/api/verticalMovement";
import { actorInventoryUseKey, type ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import {
  msButtonAction,
  msDoorKeyIndex,
  msInventorySlot,
  msTileHasTag,
} from "@ruleset-ms/impl/catalog";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";

export interface MsTileActivationContext<TCreature> {
  turnTanks(inMidMove?: TCreature | null): void;
  toggleWalls(): void;
  activateCloner(buttonPos: number, buttonZ: number): void;
  springTrap(buttonPos: number, buttonZ: number): void;
  buttonPushedSound: number;
}

export interface MsTileSupportContext {
  inventory: EngineState["inventory"];
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number, tileId?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
}

export interface MsTileSupportSubject {
  airHook: ActorAirHook;
  inventoryOwner: ActorLocalInventoryOwner | null;
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

function msTopTileSupportsNonChipFromAbove(id: number): boolean {
  return (
    msInventorySlot(id) === "tools" ||
    isMsSupportingWallTile(id) ||
    id === MS_TILE.BlueWall_Fake ||
    msTileHasTag(id, "door") ||
    id === MS_TILE.Socket
  );
}

function promoteTopFloorToUnderlying(cells: EngineMapCell[], pos: number): void {
  promoteBottomTile(cells, pos, MS_TILE.Empty);
}

export function isMsBlockedChipEnterRevealTile(tileId: number): boolean {
  return tileId === MS_TILE.HiddenWall_Temp || tileId === MS_TILE.BlueWall_Real;
}

export function applyMsBlockedChipEnterEffect(
  cells: EngineMapCell[],
  pos: number,
  exposeWalls: boolean,
): boolean {
  const tileId = cells[pos]?.top.id ?? MS_TILE.Empty;
  if (!isMsBlockedChipEnterRevealTile(tileId)) {
    return false;
  }
  if (exposeWalls) {
    replaceTopTile(cells, pos, { ...cells[pos]!.top, id: MS_TILE.Wall });
  }
  return true;
}

export function hasMsTileActivation(tileId: number): boolean {
  return msButtonAction(tileId) !== "none";
}

export function deferredMsTileActivationSound(tileId: number, buttonPushedSound: number): number {
  return msButtonAction(tileId) === "toggle-walls" ? 0 : buttonPushedSound;
}

export function applyMsTileActivationEffect<TCreature>(
  context: MsTileActivationContext<TCreature>,
  buttonPos: number,
  tileId: number,
  buttonZ: number,
  inMidMove: TCreature | null = null,
): number {
  switch (msButtonAction(tileId)) {
    case "turn-tanks":
      context.turnTanks(inMidMove);
      return context.buttonPushedSound;
    case "toggle-walls":
      context.toggleWalls();
      return 0;
    case "activate-cloner":
      context.activateCloner(buttonPos, buttonZ);
      return context.buttonPushedSound;
    case "spring-trap":
      context.springTrap(buttonPos, buttonZ);
      return context.buttonPushedSound;
    default:
      return 0;
  }
}

export function resolveMsTileSupportBelow(
  context: MsTileSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  currentZ: number,
  cellZ: number,
  subject: MsTileSupportSubject,
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
