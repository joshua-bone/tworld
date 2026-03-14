import type { InteractiveGameFrame } from "@domain/game/interactive";
import type { EngineMapCell } from "@domain/game/model";

export type InteractiveProjectionPhase = "initial" | "tick";

export function cloneInteractiveCells(cells: EngineMapCell[]): EngineMapCell[] {
  return cells.map((cell) => ({
    position: { ...cell.position },
    top: { ...cell.top },
    bottom: { ...cell.bottom },
  }));
}

export function projectInteractiveFrame(
  snapshot: InteractiveGameFrame["snapshot"],
  cells: EngineMapCell[],
  render: InteractiveGameFrame["render"],
): InteractiveGameFrame {
  return {
    snapshot,
    cells: cloneInteractiveCells(cells),
    render,
  };
}
