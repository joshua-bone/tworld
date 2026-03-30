import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsDoorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly doorKeyIndex: (id: number) => number;
}

export function createMsDoorTileFamily(options: MsDoorTileFamilyOptions): MsTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["door"],
      chipMovementMask: MS_FULL_MOVEMENT_MASK,
      creatureMovementMask: 0,
      blockMovementMask: 0,
      chipEnterAction: "open-door",
      doorKeyIndex: options.doorKeyIndex(id),
    }),
  });
}
