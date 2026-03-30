import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxCreatureFloorAction, LynxForcedFloorKind } from "@ruleset-lynx/impl/catalogTiles";

export type LynxSpecialFloorKind = "none" | "trap" | "cloner";

interface LynxSpecialFloorRegistration {
  readonly kind?: Exclude<LynxSpecialFloorKind, "none">;
  readonly forcedFloorKind?: Exclude<LynxForcedFloorKind, "none">;
  readonly creatureFloorAction?: LynxCreatureFloorAction;
  readonly fixedSlideDirection?: number;
  readonly iceWallTurn?: (dir: number) => number;
}

const LYNX_SPECIAL_FLOOR_REGISTRATIONS = new Map<number, LynxSpecialFloorRegistration>([
  [MS_TILE.Slide_North, { forcedFloorKind: "slide", fixedSlideDirection: MS_DIRECTION.north }],
  [MS_TILE.Slide_West, { forcedFloorKind: "slide", fixedSlideDirection: MS_DIRECTION.west }],
  [MS_TILE.Slide_South, { forcedFloorKind: "slide", fixedSlideDirection: MS_DIRECTION.south }],
  [MS_TILE.Slide_East, { forcedFloorKind: "slide", fixedSlideDirection: MS_DIRECTION.east }],
  [MS_TILE.Slide_Random, { forcedFloorKind: "slide" }],
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
  [MS_TILE.Beartrap, { kind: "trap", creatureFloorAction: "hold-direction" }],
  [MS_TILE.CloneMachine, { kind: "cloner", creatureFloorAction: "hold-direction" }],
]);

export function lookupLynxSpecialFloorRegistration(tileId: number): LynxSpecialFloorRegistration | undefined {
  return LYNX_SPECIAL_FLOOR_REGISTRATIONS.get(tileId);
}

export function lynxSpecialFloorKind(tileId: number): LynxSpecialFloorKind {
  return lookupLynxSpecialFloorRegistration(tileId)?.kind ?? "none";
}

export function isLynxTrapSpecialFloor(tileId: number): boolean {
  return lynxSpecialFloorKind(tileId) === "trap";
}

export function isLynxClonerSpecialFloor(tileId: number): boolean {
  return lynxSpecialFloorKind(tileId) === "cloner";
}

export function lynxSpecialFloorRequiresReleaseToExit(tileId: number): boolean {
  return isLynxTrapSpecialFloor(tileId) || isLynxClonerSpecialFloor(tileId);
}

export function lynxSpecialFloorCreatureFloorAction(tileId: number): LynxCreatureFloorAction {
  return lookupLynxSpecialFloorRegistration(tileId)?.creatureFloorAction ?? "none";
}

export function lynxSpecialFloorForcedFloorKind(tileId: number): LynxForcedFloorKind {
  return lookupLynxSpecialFloorRegistration(tileId)?.forcedFloorKind ?? "none";
}

export function lynxSpecialFloorFixedSlideDirection(tileId: number): number {
  return lookupLynxSpecialFloorRegistration(tileId)?.fixedSlideDirection ?? MS_DIRECTION.none;
}

export function lynxSpecialFloorIceWallTurn(tileId: number, dir: number): number {
  return lookupLynxSpecialFloorRegistration(tileId)?.iceWallTurn?.(dir) ?? dir;
}
