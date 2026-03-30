import { actorInventoryUseKey } from "@game-core/impl/actorLocalInventory";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsTileSupportBehaviorContext } from "@ruleset-ms/impl/elements/tiles/families/support";
import { markMsSupported, markMsUnsupported } from "@ruleset-ms/impl/elements/tiles/families/support";

export function hasMsDoorSupportBehavior(tileId: number): boolean {
  return msDoorKeyIndex(tileId) !== null;
}

export function applyMsDoorSupportBehavior(context: MsTileSupportBehaviorContext): boolean {
  const doorKeyIndex = msDoorKeyIndex(context.tileId);
  if (doorKeyIndex === null || context.layer !== "top") {
    return false;
  }

  if (
    context.subject.inventoryOwner &&
    actorInventoryUseKey(context.subject.inventoryOwner, doorKeyIndex, { consume: context.tileId !== MS_TILE.Door_Green })
  ) {
    promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
    markMsUnsupported(context);
    return true;
  }

  markMsSupported(context);
  return true;
}

function msDoorKeyIndex(tileId: number): number | null {
  switch (tileId) {
    case MS_TILE.Door_Red:
      return 0;
    case MS_TILE.Door_Blue:
      return 1;
    case MS_TILE.Door_Yellow:
      return 2;
    case MS_TILE.Door_Green:
      return 3;
    default:
      return null;
  }
}

function promoteBottomTile(cells: MsTileSupportBehaviorContext["lowerCells"], pos: number, emptyTileId: number): void {
  const cell = cells[pos];
  if (!cell) {
    return;
  }
  cell.top = { ...cell.bottom };
  cell.bottom = { id: emptyTileId, state: 0 };
}
