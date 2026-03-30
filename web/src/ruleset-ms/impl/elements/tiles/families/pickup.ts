import type { TileTag } from "@game-core/api/ruleset";
import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { MsChipEnterAction, MsInventorySlot, MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsPickupTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly tags?: readonly TileTag[];
  readonly chipEnterAction: MsChipEnterAction;
  readonly inventorySlot?: MsInventorySlot;
  readonly portableItemFamily?: MsPortableItemFamily;
  readonly inventoryIndex?: (id: number) => number;
  readonly creatureMovementMask?: number;
  readonly blockMovementMask?: number;
}

export function createMsPickupTileFamily(options: MsPickupTileFamilyOptions): MsTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
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
