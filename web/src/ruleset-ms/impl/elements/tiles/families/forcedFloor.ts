import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsChipEnterAction, MsForcedFloorKind } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsForcedFloorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly forcedFloorKind: MsForcedFloorKind;
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly chipEnterAction?: MsChipEnterAction;
  readonly chipMovementMask?: number | ((id: number) => number);
  readonly creatureMovementMask?: number | ((id: number) => number);
  readonly blockMovementMask?: number | ((id: number) => number);
}

export function createMsForcedFloorTileFamily(options: MsForcedFloorTileFamilyOptions): MsTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
    tags: options.tags,
    capabilities: ["forces-movement", ...(options.capabilities ?? [])],
    hooks: options.hooks,
    chipMovementMask: options.chipMovementMask,
    creatureMovementMask: options.creatureMovementMask,
    blockMovementMask: options.blockMovementMask,
    extraPolicy: {
      forcedFloorKind: options.forcedFloorKind,
      chipEnterAction: options.chipEnterAction ?? "none",
    },
  });
}

export function msForcedFloorKindForTile(tileId: number): MsForcedFloorKind {
  switch (tileId) {
    case MS_TILE.Slide_North:
    case MS_TILE.Slide_West:
    case MS_TILE.Slide_South:
    case MS_TILE.Slide_East:
    case MS_TILE.Slide_Random:
      return "slide";
    case MS_TILE.Ice:
    case MS_TILE.IceWall_Northwest:
    case MS_TILE.IceWall_Northeast:
    case MS_TILE.IceWall_Southwest:
    case MS_TILE.IceWall_Southeast:
      return "ice";
    case MS_TILE.Teleport:
      return "teleport";
    case MS_TILE.Air:
      return "air";
    case MS_TILE.Elevator:
      return "elevator";
    default:
      return "none";
  }
}

export function isMsForcedFloorKind(tileId: number, kind: MsForcedFloorKind): boolean {
  return msForcedFloorKindForTile(tileId) === kind;
}

export function isMsIceForcedFloor(tileId: number): boolean {
  return isMsForcedFloorKind(tileId, "ice");
}

export function msEntryRevealsForcedFloor(
  enteredTileId: number,
  movementFloorTileId: number,
): boolean {
  return enteredTileId !== movementFloorTileId && msForcedFloorKindForTile(movementFloorTileId) !== "none";
}
