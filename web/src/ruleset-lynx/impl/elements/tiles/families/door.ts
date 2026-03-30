import { createWalkableTileFamily } from "@game-core/impl/tileFamilyBuilders";
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
  return createWalkableTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    fullMovementMask: LYNX_FULL_MOVEMENT_MASK,
    baseTags: ["walkable", "door"],
    creatureMovementMask: 0,
    blockMovementMask: 0,
    extraPolicy: (id) => ({
      chipEnterAction: "open-door",
      doorKeyIndex: options.doorKeyIndex(id),
    }),
  });
}
