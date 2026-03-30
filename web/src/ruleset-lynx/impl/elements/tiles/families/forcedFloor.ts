import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { LynxChipEnterAction, LynxForcedFloorKind } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxForcedFloorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly forcedFloorKind: LynxForcedFloorKind;
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly chipEnterAction?: LynxChipEnterAction;
  readonly chipMovementMask?: number | ((id: number) => number);
  readonly creatureMovementMask?: number | ((id: number) => number);
  readonly blockMovementMask?: number | ((id: number) => number);
}

function resolveMask(
  value: LynxForcedFloorTileFamilyOptions["chipMovementMask"],
  id: number,
  fallback: number,
): number {
  if (typeof value === "function") {
    return value(id);
  }
  return value ?? fallback;
}

export function createLynxForcedFloorTileFamily(options: LynxForcedFloorTileFamilyOptions): LynxTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: ["forces-movement", ...(options.capabilities ?? [])],
      hooks: options.hooks ?? [],
      chipMovementMask: resolveMask(options.chipMovementMask, id, LYNX_FULL_MOVEMENT_MASK),
      creatureMovementMask: resolveMask(options.creatureMovementMask, id, LYNX_FULL_MOVEMENT_MASK),
      blockMovementMask: resolveMask(options.blockMovementMask, id, LYNX_FULL_MOVEMENT_MASK),
      forcedFloorKind: options.forcedFloorKind,
      chipEnterAction: options.chipEnterAction ?? "none",
    }),
  });
}
