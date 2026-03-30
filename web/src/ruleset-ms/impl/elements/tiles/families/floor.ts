import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
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
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: options.capabilities ?? [],
      hooks: options.hooks ?? [],
      chipMovementMask: options.chipMovementMask ?? MS_FULL_MOVEMENT_MASK,
      creatureMovementMask: options.creatureMovementMask ?? MS_FULL_MOVEMENT_MASK,
      blockMovementMask: options.blockMovementMask ?? MS_FULL_MOVEMENT_MASK,
      exitMovementMask: options.exitMovementMask ?? MS_FULL_MOVEMENT_MASK,
      requiresReleaseToExit: options.requiresReleaseToExit ?? false,
      chipEnterAction: options.chipEnterAction ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
