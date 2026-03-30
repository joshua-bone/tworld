import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsWallTileFamilyOptions {
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

function resolveMask(value: MsWallTileFamilyOptions["chipMovementMask"], id: number, fallback: number): number {
  if (typeof value === "function") {
    return value(id);
  }
  return value ?? fallback;
}

export function createMsWallTileFamily(options: MsWallTileFamilyOptions): MsTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["blocking", ...(options.tags ?? [])],
      capabilities: options.capabilities ?? [],
      hooks: options.hooks ?? [],
      chipMovementMask: resolveMask(options.chipMovementMask, id, 0),
      creatureMovementMask: resolveMask(options.creatureMovementMask, id, 0),
      blockMovementMask: resolveMask(options.blockMovementMask, id, 0),
      exitMovementMask: resolveMask(options.exitMovementMask, id, MS_FULL_MOVEMENT_MASK),
    }),
  });
}
