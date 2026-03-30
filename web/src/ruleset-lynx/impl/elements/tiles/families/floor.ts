import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
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
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: options.capabilities ?? [],
      hooks: options.hooks ?? [],
      chipMovementMask: options.chipMovementMask ?? LYNX_FULL_MOVEMENT_MASK,
      creatureMovementMask: options.creatureMovementMask ?? LYNX_FULL_MOVEMENT_MASK,
      blockMovementMask: options.blockMovementMask ?? LYNX_FULL_MOVEMENT_MASK,
      exitMovementMask: options.exitMovementMask ?? LYNX_FULL_MOVEMENT_MASK,
      requiresReleaseToExit: options.requiresReleaseToExit ?? false,
      chipEnterAction: options.chipEnterAction ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
