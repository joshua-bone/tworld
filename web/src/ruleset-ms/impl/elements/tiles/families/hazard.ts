import type { TileHookName } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { MsChipEnterAction } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsHazardTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly chipEnterAction: MsChipEnterAction;
  readonly hooks?: readonly TileHookName[];
}

export function createMsHazardTileFamily(options: MsHazardTileFamilyOptions): MsTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    hooks: options.hooks,
    extraPolicy: {
      chipEnterAction: options.chipEnterAction,
    },
  });
}
