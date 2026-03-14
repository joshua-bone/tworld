import { cloneBoardCells } from "@domain/game/core/board";
import type { InteractiveGameFrame } from "@domain/game/interactive";

export type InteractiveProjectionPhase = "initial" | "tick";

export function projectInteractiveFrame(
  snapshot: InteractiveGameFrame["snapshot"],
  cells: InteractiveGameFrame["cells"],
  render: InteractiveGameFrame["render"],
): InteractiveGameFrame {
  return {
    snapshot,
    cells: cloneBoardCells(cells),
    render,
  };
}
