import { cloneBoardCells } from "@game-core/impl/board";
import type { InteractiveGameFrame } from "@game-core/api/interactive";

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
