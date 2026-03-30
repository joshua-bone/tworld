import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsDoorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly doorKeyIndex: (id: number) => number;
}

export function createMsDoorTileFamily(options: MsDoorTileFamilyOptions): MsTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
    baseTags: ["walkable", "door"],
    creatureMovementMask: 0,
    blockMovementMask: 0,
    extraPolicy: (id) => ({
      chipEnterAction: "open-door",
      doorKeyIndex: options.doorKeyIndex(id),
    }),
  });
}
