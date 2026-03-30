import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxDoorTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly doorKeyIndex: (id: number) => number;
}

export function createLynxDoorTileFamily(options: LynxDoorTileFamilyOptions): LynxTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["door"],
      chipMovementMask: LYNX_FULL_MOVEMENT_MASK,
      creatureMovementMask: 0,
      blockMovementMask: 0,
      chipEnterAction: "open-door",
      doorKeyIndex: options.doorKeyIndex(id),
    }),
  });
}
