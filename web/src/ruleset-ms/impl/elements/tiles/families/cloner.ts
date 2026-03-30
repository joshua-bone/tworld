import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsClonerTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
}

export function createMsClonerTileFamily(options: MsClonerTileFamilyOptions): MsTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["cloner", "blocking"],
      chipMovementMask: 0,
      creatureMovementMask: 0,
      blockMovementMask: 0,
    },
  });
}
