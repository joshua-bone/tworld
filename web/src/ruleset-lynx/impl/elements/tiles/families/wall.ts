import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createBlockingTileFamily } from "@game-core/impl/tileFamilyBuilders";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxWallTileFamilyOptions {
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

export function createLynxWallTileFamily(options: LynxWallTileFamilyOptions): LynxTileFamilyDefinition {
  return createBlockingTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    tags: options.tags,
    capabilities: options.capabilities,
    hooks: options.hooks,
    chipMovementMask: options.chipMovementMask,
    creatureMovementMask: options.creatureMovementMask,
    blockMovementMask: options.blockMovementMask,
    exitMovementMask: options.exitMovementMask,
  });
}
