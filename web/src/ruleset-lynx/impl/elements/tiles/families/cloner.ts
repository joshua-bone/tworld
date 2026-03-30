import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { LynxCreatureFloorAction } from "@ruleset-lynx/impl/catalogTiles";
import type { LynxTileFamilyDefinition } from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxClonerTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly creatureFloorAction?: LynxCreatureFloorAction;
}

export function createLynxClonerTileFamily(options: LynxClonerTileFamilyOptions): LynxTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["cloner", "blocking"],
      chipMovementMask: 0,
      creatureMovementMask: 0,
      blockMovementMask: 0,
      requiresReleaseToExit: true,
      creatureFloorAction: options.creatureFloorAction ?? "hold-direction",
    },
  });
}
