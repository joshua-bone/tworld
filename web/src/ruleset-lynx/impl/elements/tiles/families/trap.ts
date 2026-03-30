import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { LynxChipEnterAction, LynxCreatureFloorAction } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxTrapTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly chipEnterAction?: LynxChipEnterAction;
  readonly creatureFloorAction?: LynxCreatureFloorAction;
}

export function createLynxTrapTileFamily(options: LynxTrapTileFamilyOptions): LynxTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: {
      tags: ["walkable", "trap"],
      hooks: ["after-enter"],
      chipMovementMask: LYNX_FULL_MOVEMENT_MASK,
      creatureMovementMask: LYNX_FULL_MOVEMENT_MASK,
      blockMovementMask: LYNX_FULL_MOVEMENT_MASK,
      requiresReleaseToExit: true,
      chipEnterAction: options.chipEnterAction ?? "trap",
      creatureFloorAction: options.creatureFloorAction ?? "hold-direction",
    },
  });
}
