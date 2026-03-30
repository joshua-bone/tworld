import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
import type { LynxButtonAction, LynxChipEnterAction } from "@ruleset-lynx/impl/catalogTiles";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";

export interface LynxButtonTileFamilyOptions {
  readonly name: string;
  readonly tileIds: readonly number[];
  readonly action: (id: number) => LynxButtonAction;
  readonly chipEnterAction?: LynxChipEnterAction;
}

export function createLynxButtonTileFamily(options: LynxButtonTileFamilyOptions): LynxTileFamilyDefinition {
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    baseTags: ["walkable", "button"],
    capabilities: ["trigger-on-entry", "trigger-on-leave"],
    hooks: ["after-enter", "after-leave"],
    extraPolicy: (id) => ({
      chipEnterAction: options.chipEnterAction ?? "button",
      buttonAction: options.action(id),
    }),
  });
}
