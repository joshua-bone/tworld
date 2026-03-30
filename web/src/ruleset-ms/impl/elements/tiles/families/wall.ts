import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createBlockingTileFamily } from "@game-core/impl/tileFamilyBuilders";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsWallTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly chipMovementMask?: number | ((id: number) => number);
  readonly creatureMovementMask?: number | ((id: number) => number);
  readonly blockMovementMask?: number | ((id: number) => number);
  readonly exitMovementMask?: number | ((id: number) => number);
}

export function createMsWallTileFamily(options: MsWallTileFamilyOptions): MsTileFamilyDefinition {
  return createBlockingTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
    tags: options.tags,
    capabilities: options.capabilities,
    hooks: options.hooks,
    chipMovementMask: options.chipMovementMask,
    creatureMovementMask: options.creatureMovementMask,
    blockMovementMask: options.blockMovementMask,
    exitMovementMask: options.exitMovementMask,
  });
}
