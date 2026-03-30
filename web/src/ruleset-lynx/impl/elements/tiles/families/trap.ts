import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { LynxChipEnterAction, LynxCreatureFloorAction } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxTrapTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly chipEnterAction?: LynxChipEnterAction;
  readonly creatureFloorAction?: LynxCreatureFloorAction;
}

export function createLynxTrapTileFamily(options: LynxTrapTileFamilyOptions): LynxTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    baseTags: ["walkable", "trap"],
    hooks: ["after-enter"],
    requiresReleaseToExit: true,
    extraPolicy: {
      chipEnterAction: options.chipEnterAction ?? "trap",
      creatureFloorAction: options.creatureFloorAction ?? "hold-direction",
    },
  });
}
