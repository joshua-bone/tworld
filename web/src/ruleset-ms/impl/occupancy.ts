import type { EngineMapCell } from "@game-core/api/model";
import {
  OCCUPANCY_TARGET_KIND,
  type OccupancyTarget,
} from "@game-core/impl/occupancy";
import { MS_TILE, isMsCreature, isMsStaticBlockTile, msCreatureId } from "@ruleset-ms/api/tiles";

export interface MsOccupancyCreatureRef {
  id: number;
  pos: number;
  z?: number;
  hidden: boolean;
}

export interface MsOccupancyBlockRef {
  id?: number;
  pos: number;
  z?: number;
  hidden: boolean;
}

export interface MsOccupancyPortableItemRef {
  tileId: number;
  state:
    | { mode: "map"; pos: number; z: number }
    | { mode: string; pos?: number; z?: number };
}

export interface MsOccupancyQueryContext<
  TCreature extends MsOccupancyCreatureRef = MsOccupancyCreatureRef,
  TBlock extends MsOccupancyBlockRef = MsOccupancyBlockRef,
  TPortableItem extends MsOccupancyPortableItemRef = MsOccupancyPortableItemRef,
> {
  cells: EngineMapCell[];
  chipPos?: number;
  chipZ?: number;
  creatures?: readonly TCreature[];
  blocks?: readonly TBlock[];
  portableItems?: readonly TPortableItem[];
  runtimeCellZ?(cells: EngineMapCell[], pos: number): number;
}

export type MsOccupancyTarget<
  TCreature extends MsOccupancyCreatureRef = MsOccupancyCreatureRef,
  TBlock extends MsOccupancyBlockRef = MsOccupancyBlockRef,
  TPortableItem extends MsOccupancyPortableItemRef = MsOccupancyPortableItemRef,
> = OccupancyTarget<TCreature | TBlock, TPortableItem>;

function msTargetZ(context: MsOccupancyQueryContext, pos: number, z?: number): number {
  return z ?? context.chipZ ?? context.runtimeCellZ?.(context.cells, pos) ?? 1;
}

function findPortableItemAt<
  TPortableItem extends MsOccupancyPortableItemRef,
>(
  portableItems: readonly TPortableItem[] | undefined,
  pos: number,
  z: number,
): TPortableItem | undefined {
  return portableItems?.find(
    (portableItem): portableItem is TPortableItem =>
      portableItem.state.mode === "map" &&
      portableItem.state.pos === pos &&
      portableItem.state.z === z,
  );
}

export function queryMsOccupancyTarget<
  TCreature extends MsOccupancyCreatureRef,
  TBlock extends MsOccupancyBlockRef,
  TPortableItem extends MsOccupancyPortableItemRef,
>(
  context: MsOccupancyQueryContext<TCreature, TBlock, TPortableItem>,
  pos: number,
  z?: number,
): MsOccupancyTarget<TCreature, TBlock, TPortableItem> {
  const targetZ = msTargetZ(context, pos, z);
  const cell = context.cells[pos];
  if (!cell) {
    return {
      kind: OCCUPANCY_TARGET_KIND.empty,
      pos,
      z: targetZ,
      tileId: MS_TILE.Empty,
      claimed: false,
    };
  }

  const portableItem = findPortableItemAt(context.portableItems, pos, targetZ);
  if (portableItem) {
    return {
      kind: OCCUPANCY_TARGET_KIND.portableItem,
      pos,
      z: targetZ,
      tileId: portableItem.tileId,
      claimed: false,
      portableItem,
    };
  }

  if (context.chipPos === pos && (context.chipZ ?? 1) === targetZ) {
    return {
      kind: OCCUPANCY_TARGET_KIND.chip,
      pos,
      z: targetZ,
      tileId: cell.top.id,
      claimed: false,
    };
  }

  if (isMsStaticBlockTile(cell.top.id)) {
    return {
      kind: OCCUPANCY_TARGET_KIND.staticBlock,
      pos,
      z: targetZ,
      tileId: cell.top.id,
      claimed: false,
    };
  }

  const runtimeActor =
    context.creatures?.find((creature) => !creature.hidden && creature.pos === pos && (creature.z ?? 1) === targetZ) ??
    context.blocks?.find((block) => !block.hidden && block.pos === pos && (block.z ?? 1) === targetZ);
  if (runtimeActor) {
    return {
      kind: OCCUPANCY_TARGET_KIND.runtimeActor,
      pos,
      z: targetZ,
      tileId: cell.top.id,
      claimed: false,
      runtimeActor,
    };
  }

  if (isMsCreature(cell.top.id)) {
    const creatureId = msCreatureId(cell.top.id);
    return {
      kind:
        creatureId === MS_TILE.Chip || creatureId === MS_TILE.Swimming_Chip
          ? OCCUPANCY_TARGET_KIND.chip
          : OCCUPANCY_TARGET_KIND.runtimeActor,
      pos,
      z: targetZ,
      tileId: cell.top.id,
      claimed: false,
    };
  }

  return {
    kind: OCCUPANCY_TARGET_KIND.empty,
    pos,
    z: targetZ,
    tileId: cell.top.id,
    claimed: false,
  };
}
