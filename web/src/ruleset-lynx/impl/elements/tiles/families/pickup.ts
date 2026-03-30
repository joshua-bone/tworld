import type { TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type {
  LynxChipEnterAction,
  LynxInventorySlot,
  LynxPortableItemFamily,
} from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxPickupTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly tags?: readonly TileTag[];
  readonly chipEnterAction: LynxChipEnterAction;
  readonly inventorySlot?: LynxInventorySlot;
  readonly portableItemFamily?: LynxPortableItemFamily;
  readonly inventoryIndex?: (id: number) => number;
  readonly creatureMovementMask?: number;
  readonly blockMovementMask?: number;
}

export function createLynxPickupTileFamily(options: LynxPickupTileFamilyOptions): LynxTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["walkable", ...(options.tags ?? [])],
      capabilities: ["collect-on-entry"],
      chipMovementMask: LYNX_FULL_MOVEMENT_MASK,
      creatureMovementMask: options.creatureMovementMask ?? 0,
      blockMovementMask: options.blockMovementMask ?? 0,
      chipEnterAction: options.chipEnterAction,
      inventorySlot: options.inventorySlot,
      portableItemFamily: options.portableItemFamily,
      inventoryIndex: options.inventoryIndex?.(id),
    }),
  });
}
