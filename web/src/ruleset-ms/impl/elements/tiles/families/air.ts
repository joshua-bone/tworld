import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
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
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: options.capabilities ?? [],
      hooks: options.hooks ?? [],
      chipMovementMask: MS_FULL_MOVEMENT_MASK,
      creatureMovementMask: MS_FULL_MOVEMENT_MASK,
      blockMovementMask: MS_FULL_MOVEMENT_MASK,
      forcedFloorKind: options.forcedFloorKind ?? "none",
      mobExitAction: options.mobExitAction ?? "none",
    },
  });
}
