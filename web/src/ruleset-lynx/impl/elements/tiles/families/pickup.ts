import type { TileTag } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
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
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    tags: options.tags,
    capabilities: ["collect-on-entry"],
    creatureMovementMask: options.creatureMovementMask ?? 0,
    blockMovementMask: options.blockMovementMask ?? 0,
    extraPolicy: (id) => ({
      chipEnterAction: options.chipEnterAction,
      inventorySlot: options.inventorySlot,
      portableItemFamily: options.portableItemFamily,
      inventoryIndex: options.inventoryIndex?.(id),
    }),
  });
}
