import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { MsForcedFloorKind, MsMobExitAction } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsAirTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly forcedFloorKind?: MsForcedFloorKind;
  readonly mobExitAction?: MsMobExitAction;
}

export function createMsAirTileFamily(options: MsAirTileFamilyOptions): MsTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
    tags: options.tags,
    capabilities: options.capabilities,
    hooks: options.hooks,
    extraPolicy: {
      forcedFloorKind: options.forcedFloorKind ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
