import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { MsChipEnterAction, MsForcedFloorKind } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsForcedFloorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly forcedFloorKind: MsForcedFloorKind;
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly chipEnterAction?: MsChipEnterAction;
  readonly chipMovementMask?: number | ((id: number) => number);
  readonly creatureMovementMask?: number | ((id: number) => number);
  readonly blockMovementMask?: number | ((id: number) => number);
}

function resolveMask(
  value: MsForcedFloorTileFamilyOptions["chipMovementMask"],
  id: number,
  fallback: number,
): number {
  if (typeof value === "function") {
    return value(id);
  }
  return value ?? fallback;
}

export function createMsForcedFloorTileFamily(options: MsForcedFloorTileFamilyOptions): MsTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: ["forces-movement", ...(options.capabilities ?? [])],
      hooks: options.hooks ?? [],
      chipMovementMask: resolveMask(options.chipMovementMask, id, MS_FULL_MOVEMENT_MASK),
      creatureMovementMask: resolveMask(options.creatureMovementMask, id, MS_FULL_MOVEMENT_MASK),
      blockMovementMask: resolveMask(options.blockMovementMask, id, MS_FULL_MOVEMENT_MASK),
      forcedFloorKind: options.forcedFloorKind,
      chipEnterAction: options.chipEnterAction ?? "none",
    }),
  });
}
