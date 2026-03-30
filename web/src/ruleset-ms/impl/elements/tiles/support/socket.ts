import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsTileSupportBehaviorContext } from "@ruleset-ms/impl/elements/tiles/families/support";
import { markMsSupported, markMsUnsupported } from "@ruleset-ms/impl/elements/tiles/families/support";

export function hasMsSocketSupportBehavior(tileId: number): boolean {
  return tileId === MS_TILE.Socket;
}

export function applyMsSocketSupportBehavior(context: MsTileSupportBehaviorContext): boolean {
  if (context.tileId !== MS_TILE.Socket || context.layer !== "top") {
    return false;
  }

  if (context.support.inventory.chipsNeeded === 0) {
    const cell = context.lowerCells[context.pos];
    if (cell) {
      cell.top = { ...cell.bottom };
      cell.bottom = { id: MS_TILE.Empty, state: 0 };
    }
    markMsUnsupported(context);
    return true;
  }

  markMsSupported(context);
  return true;
}
