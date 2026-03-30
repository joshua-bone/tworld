import { createBlockingTileFamily } from "@game-core/impl/tileFamilyBuilders";
import { MS_FULL_MOVEMENT_MASK } from "@ruleset-ms/impl/elements/tiles/families/shared";
import type { MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsClonerTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
}

export function createMsClonerTileFamily(options: MsClonerTileFamilyOptions): MsTileFamilyDefinition {
  return createBlockingTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
    baseTags: ["cloner", "blocking"],
  });
}
