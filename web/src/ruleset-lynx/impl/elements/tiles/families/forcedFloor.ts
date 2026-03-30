import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxChipEnterAction, LynxForcedFloorKind } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxForcedFloorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly forcedFloorKind: LynxForcedFloorKind;
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly chipEnterAction?: LynxChipEnterAction;
  readonly chipMovementMask?: number | ((id: number) => number);
  readonly creatureMovementMask?: number | ((id: number) => number);
  readonly blockMovementMask?: number | ((id: number) => number);
}

function resolveMask(
  value: LynxForcedFloorTileFamilyOptions["chipMovementMask"],
  id: number,
  fallback: number,
): number {
  if (typeof value === "function") {
    return value(id);
  }
  return value ?? fallback;
}

export function createLynxForcedFloorTileFamily(options: LynxForcedFloorTileFamilyOptions): LynxTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: ["forces-movement", ...(options.capabilities ?? [])],
      hooks: options.hooks ?? [],
      chipMovementMask: resolveMask(options.chipMovementMask, id, LYNX_FULL_MOVEMENT_MASK),
      creatureMovementMask: resolveMask(options.creatureMovementMask, id, LYNX_FULL_MOVEMENT_MASK),
      blockMovementMask: resolveMask(options.blockMovementMask, id, LYNX_FULL_MOVEMENT_MASK),
      forcedFloorKind: options.forcedFloorKind,
      chipEnterAction: options.chipEnterAction ?? "none",
    }),
  });
}

export function lynxForcedFloorKindForTile(tileId: number): LynxForcedFloorKind {
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

export function isLynxForcedFloorKind(tileId: number, kind: LynxForcedFloorKind): boolean {
  return lynxForcedFloorKindForTile(tileId) === kind;
}

export function isLynxSlideForcedFloor(tileId: number): boolean {
  return isLynxForcedFloorKind(tileId, "slide");
}

export function isLynxIceForcedFloor(tileId: number): boolean {
  return isLynxForcedFloorKind(tileId, "ice");
}

export function isLynxAirForcedFloor(tileId: number): boolean {
  return isLynxForcedFloorKind(tileId, "air");
}

export function isLynxElevatorForcedFloor(tileId: number): boolean {
  return isLynxForcedFloorKind(tileId, "elevator");
}

export function resolveLynxForcedFloorDirection(
  tileId: number,
  currentDir: number,
  slideDirection: (floorId: number) => number,
): number {
  if (isLynxSlideForcedFloor(tileId)) {
    return slideDirection(tileId);
  }
  if (isLynxIceForcedFloor(tileId)) {
    return currentDir;
  }
  return 0;
}
