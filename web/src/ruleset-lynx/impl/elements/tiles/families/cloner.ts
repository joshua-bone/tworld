import { createBlockingTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { LynxCreatureFloorAction } from "@ruleset-lynx/impl/catalogTiles";
import { LYNX_FULL_MOVEMENT_MASK } from "@ruleset-lynx/impl/elements/tiles/families/shared";
import type { LynxTileFamilyDefinition } from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxClonerTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly creatureFloorAction?: LynxCreatureFloorAction;
}

export function createLynxClonerTileFamily(options: LynxClonerTileFamilyOptions): LynxTileFamilyDefinition {
  return createBlockingTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    baseTags: ["cloner", "blocking"],
    requiresReleaseToExit: true,
    extraPolicy: {
      creatureFloorAction: options.creatureFloorAction ?? "hold-direction",
    },
  });
}
