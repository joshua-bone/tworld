import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { LynxForcedFloorKind, LynxMobExitAction } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxAirTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly forcedFloorKind?: LynxForcedFloorKind;
  readonly mobExitAction?: LynxMobExitAction;
}

export function createLynxAirTileFamily(options: LynxAirTileFamilyOptions): LynxTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: options.capabilities ?? [],
      hooks: options.hooks ?? [],
      chipMovementMask: LYNX_FULL_MOVEMENT_MASK,
      creatureMovementMask: LYNX_FULL_MOVEMENT_MASK,
      blockMovementMask: LYNX_FULL_MOVEMENT_MASK,
      forcedFloorKind: options.forcedFloorKind ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
