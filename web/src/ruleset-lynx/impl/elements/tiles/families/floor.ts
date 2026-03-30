import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { LynxChipEnterAction, LynxMobExitAction } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxFloorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly chipEnterAction?: LynxChipEnterAction;
  readonly chipMovementMask?: number;
  readonly creatureMovementMask?: number;
  readonly blockMovementMask?: number;
  readonly exitMovementMask?: number;
  readonly requiresReleaseToExit?: boolean;
  readonly mobExitAction?: LynxMobExitAction;
}

export function createLynxFloorTileFamily(options: LynxFloorTileFamilyOptions): LynxTileFamilyDefinition {
  return createWalkableTileFamily({
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
    requiresReleaseToExit: options.requiresReleaseToExit,
    extraPolicy: {
      chipEnterAction: options.chipEnterAction ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
