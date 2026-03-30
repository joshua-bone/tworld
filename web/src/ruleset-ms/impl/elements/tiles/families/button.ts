import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { MsButtonAction, MsChipEnterAction } from "@ruleset-ms/impl/catalogTiles";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";

export interface MsButtonTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly action: (id: number) => MsButtonAction;
  readonly chipEnterAction?: MsChipEnterAction;
}

export function createMsButtonTileFamily(options: MsButtonTileFamilyOptions): MsTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: MS_FULL_MOVEMENT_MASK,
    baseTags: ["walkable", "button"],
    capabilities: ["trigger-on-entry", "trigger-on-leave"],
    hooks: ["after-enter", "after-leave"],
    extraPolicy: (id) => ({
      chipEnterAction: options.chipEnterAction ?? "none",
      buttonAction: options.action(id),
    }),
  });
}
