import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { MsChipEnterAction, MsMobExitAction } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsFloorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly chipEnterAction?: MsChipEnterAction;
  readonly chipMovementMask?: number;
  readonly creatureMovementMask?: number;
  readonly blockMovementMask?: number;
  readonly exitMovementMask?: number;
  readonly requiresReleaseToExit?: boolean;
  readonly mobExitAction?: MsMobExitAction;
}

export function createMsFloorTileFamily(options: MsFloorTileFamilyOptions): MsTileFamilyDefinition {
  return createWalkableTileFamily({
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
    requiresReleaseToExit: options.requiresReleaseToExit,
    extraPolicy: {
      chipEnterAction: options.chipEnterAction ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
