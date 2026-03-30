import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { MsChipEnterAction } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsTrapTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly chipEnterAction?: MsChipEnterAction;
}

export function createMsTrapTileFamily(options: MsTrapTileFamilyOptions): MsTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["walkable", "trap"],
      chipMovementMask: MS_FULL_MOVEMENT_MASK,
      creatureMovementMask: MS_FULL_MOVEMENT_MASK,
      blockMovementMask: MS_FULL_MOVEMENT_MASK,
      requiresReleaseToExit: true,
      chipEnterAction: options.chipEnterAction ?? "none",
    },
  });
}
