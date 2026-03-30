import { actorInventoryUseKey } from "@game-core/impl/actorLocalInventory";
import { promoteBottomTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxTileSupportBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/families/support";
import { markLynxSupported, markLynxUnsupported } from "@ruleset-lynx/impl/elements/tiles/families/support";

export function hasLynxDoorSupportBehavior(tileId: number): boolean {
  return lynxDoorKeyIndex(tileId) !== null;
}

export function applyLynxDoorSupportBehavior(context: LynxTileSupportBehaviorContext): boolean {
  const doorKeyIndex = lynxDoorKeyIndex(context.tileId);
  if (doorKeyIndex === null || context.layer !== "top") {
    return false;
  }

  if (
    context.subject.inventoryOwner &&
    actorInventoryUseKey(context.subject.inventoryOwner, doorKeyIndex, { consume: context.tileId !== MS_TILE.Door_Green })
  ) {
    promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
    markLynxUnsupported(context);
    return true;
  }

  markLynxSupported(context);
  return true;
}

function lynxDoorKeyIndex(tileId: number): number | null {
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
