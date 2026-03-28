import type { EngineMapCell } from "@game-core/api/model";
import {
  OCCUPANCY_TARGET_KIND,
  type OccupancyTarget,
} from "@game-core/impl/occupancy";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxOccupancyActorRef {
  id: number;
  pos: number;
  z?: number;
  hidden: boolean;
}

export interface LynxOccupancyPortableItemRef {
  tileId: number;
  state:
    | { mode: "map"; pos: number; z: number }
    | { mode: string; pos?: number; z?: number };
}

export interface LynxOccupancyQueryContext<
  TActor extends LynxOccupancyActorRef = LynxOccupancyActorRef,
  TPortableItem extends LynxOccupancyPortableItemRef = LynxOccupancyPortableItemRef,
> {
  cells: EngineMapCell[];
  chipPos?: number;
  chipZ?: number;
  actors?: readonly TActor[];
  portableItems?: readonly TPortableItem[];
}

export type LynxOccupancyTarget<
  TActor extends LynxOccupancyActorRef = LynxOccupancyActorRef,
  TPortableItem extends LynxOccupancyPortableItemRef = LynxOccupancyPortableItemRef,
> = OccupancyTarget<TActor, TPortableItem>;

function findPortableItemAt<
  TPortableItem extends LynxOccupancyPortableItemRef,
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

export function queryLynxOccupancyTarget<
  TActor extends LynxOccupancyActorRef,
  TPortableItem extends LynxOccupancyPortableItemRef,
>(
  context: LynxOccupancyQueryContext<TActor, TPortableItem>,
  pos: number,
  z = context.chipZ ?? 1,
): LynxOccupancyTarget<TActor, TPortableItem> {
  const cell = context.cells[pos];
  if (!cell) {
    return {
      kind: OCCUPANCY_TARGET_KIND.empty,
      pos,
      z,
      tileId: MS_TILE.Empty,
      claimed: false,
    };
  }

  const claimed = (cell.top.state & LYNX_CELL_FLAG.Claimed) !== 0;
  if ((cell.top.state & LYNX_CELL_FLAG.Animated) !== 0) {
    return {
      kind: OCCUPANCY_TARGET_KIND.blockedVisual,
      pos,
      z,
      tileId: cell.top.id,
      claimed,
    };
  }

  const portableItem = findPortableItemAt(context.portableItems, pos, z);
  if (portableItem) {
    return {
      kind: OCCUPANCY_TARGET_KIND.portableItem,
      pos,
      z,
      tileId: portableItem.tileId,
      claimed,
      portableItem,
    };
  }

  if (context.chipPos === pos && (context.chipZ ?? 1) === z) {
    return {
      kind: OCCUPANCY_TARGET_KIND.chip,
      pos,
      z,
      tileId: cell.top.id,
      claimed,
    };
  }

  const runtimeActor = context.actors?.find((actor) => !actor.hidden && actor.pos === pos && (actor.z ?? 1) === z);
  if (runtimeActor) {
    return {
      kind: OCCUPANCY_TARGET_KIND.runtimeActor,
      pos,
      z,
      tileId: cell.top.id,
      claimed,
      runtimeActor,
    };
  }

  return {
    kind: OCCUPANCY_TARGET_KIND.empty,
    pos,
    z,
    tileId: cell.top.id,
    claimed,
  };
}
