import type { TileHookName } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { LynxChipEnterAction } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxHazardTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly chipEnterAction: LynxChipEnterAction;
  readonly hooks?: readonly TileHookName[];
}

export function createLynxHazardTileFamily(options: LynxHazardTileFamilyOptions): LynxTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    hooks: options.hooks,
    extraPolicy: {
      chipEnterAction: options.chipEnterAction,
    },
  });
}
