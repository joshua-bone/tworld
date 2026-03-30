import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsForcedFloorKind } from "@ruleset-ms/impl/catalogTiles";

export type MsSpecialFloorKind = "none" | "trap" | "cloner";

interface MsSpecialFloorRegistration {
  readonly kind?: Exclude<MsSpecialFloorKind, "none">;
  readonly forcedFloorKind?: Exclude<MsForcedFloorKind, "none">;
  readonly slideDirection?: number | "random";
  readonly iceWallTurn?: (dir: number) => number;
}

const MS_SPECIAL_FLOOR_REGISTRATIONS = new Map<number, MsSpecialFloorRegistration>([
  [MS_TILE.Slide_North, { forcedFloorKind: "slide", slideDirection: MS_DIRECTION.north }],
  [MS_TILE.Slide_West, { forcedFloorKind: "slide", slideDirection: MS_DIRECTION.west }],
  [MS_TILE.Slide_South, { forcedFloorKind: "slide", slideDirection: MS_DIRECTION.south }],
  [MS_TILE.Slide_East, { forcedFloorKind: "slide", slideDirection: MS_DIRECTION.east }],
  [MS_TILE.Slide_Random, { forcedFloorKind: "slide", slideDirection: "random" }],
  [MS_TILE.Ice, { forcedFloorKind: "ice" }],
  [
    MS_TILE.IceWall_Northwest,
    {
      forcedFloorKind: "ice",
      iceWallTurn: (dir) =>
        dir === MS_DIRECTION.south ? MS_DIRECTION.west : dir === MS_DIRECTION.east ? MS_DIRECTION.north : dir,
    },
  ],
  [
    MS_TILE.IceWall_Northeast,
    {
      forcedFloorKind: "ice",
      iceWallTurn: (dir) =>
        dir === MS_DIRECTION.south ? MS_DIRECTION.east : dir === MS_DIRECTION.west ? MS_DIRECTION.north : dir,
    },
  ],
  [
    MS_TILE.IceWall_Southwest,
    {
      forcedFloorKind: "ice",
      iceWallTurn: (dir) =>
        dir === MS_DIRECTION.north ? MS_DIRECTION.west : dir === MS_DIRECTION.east ? MS_DIRECTION.south : dir,
    },
  ],
  [
    MS_TILE.IceWall_Southeast,
    {
      forcedFloorKind: "ice",
      iceWallTurn: (dir) =>
        dir === MS_DIRECTION.north ? MS_DIRECTION.east : dir === MS_DIRECTION.west ? MS_DIRECTION.south : dir,
    },
  ],
  [MS_TILE.Teleport, { forcedFloorKind: "teleport" }],
  [MS_TILE.Air, { forcedFloorKind: "air" }],
  [MS_TILE.Elevator, { forcedFloorKind: "elevator" }],
  [MS_TILE.Beartrap, { kind: "trap" }],
  [MS_TILE.CloneMachine, { kind: "cloner" }],
]);

export function lookupMsSpecialFloorRegistration(tileId: number): MsSpecialFloorRegistration | undefined {
  return MS_SPECIAL_FLOOR_REGISTRATIONS.get(tileId);
}

export function msSpecialFloorKind(tileId: number): MsSpecialFloorKind {
  return lookupMsSpecialFloorRegistration(tileId)?.kind ?? "none";
}

export function isMsTrapSpecialFloor(tileId: number): boolean {
  return msSpecialFloorKind(tileId) === "trap";
}

export function isMsClonerSpecialFloor(tileId: number): boolean {
  return msSpecialFloorKind(tileId) === "cloner";
}

export function msSpecialFloorRequiresReleaseToExit(tileId: number): boolean {
  return isMsTrapSpecialFloor(tileId);
}

export function msSpecialFloorForcedFloorKind(tileId: number): MsForcedFloorKind {
  return lookupMsSpecialFloorRegistration(tileId)?.forcedFloorKind ?? "none";
}

export function msSpecialFloorSlideDirection(tileId: number, randomDirection: number): number {
  const slideDirection = lookupMsSpecialFloorRegistration(tileId)?.slideDirection;
  if (slideDirection === "random") {
    return randomDirection;
  }
  return slideDirection ?? MS_DIRECTION.none;
}

export function msSpecialFloorIceWallTurn(tileId: number, dir: number): number {
  return lookupMsSpecialFloorRegistration(tileId)?.iceWallTurn?.(dir) ?? dir;
}
