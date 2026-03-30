import { createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import type { MsButtonAction, MsChipEnterAction } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsButtonTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly action: (id: number) => MsButtonAction;
  readonly chipEnterAction?: MsChipEnterAction;
}

export function createMsButtonTileFamily(options: MsButtonTileFamilyOptions): MsTileFamilyDefinition {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    policy: (id) => ({
      tags: ["walkable", "button"],
      capabilities: ["trigger-on-entry", "trigger-on-leave"],
      hooks: ["after-enter", "after-leave"],
      chipMovementMask: MS_FULL_MOVEMENT_MASK,
      creatureMovementMask: MS_FULL_MOVEMENT_MASK,
      blockMovementMask: MS_FULL_MOVEMENT_MASK,
      chipEnterAction: options.chipEnterAction ?? "none",
      buttonAction: options.action(id),
    }),
  });
}
