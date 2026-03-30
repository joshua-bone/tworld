import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
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
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    tags: options.tags,
    capabilities: options.capabilities,
    hooks: options.hooks,
    extraPolicy: {
      forcedFloorKind: options.forcedFloorKind ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
