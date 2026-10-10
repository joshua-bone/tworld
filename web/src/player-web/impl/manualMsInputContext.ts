import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { msTileForcedFloorKind } from "@ruleset-ms/impl/catalog";

export function msManualInputNeedsContinuousHold(frame: InteractiveGameFrame): boolean {
  const position = frame.snapshot.chip?.position.pos;
  const cell = position === undefined ? undefined : frame.cells[position];
  if (!cell) return false;

  // Forced movement can carry Chip past a one-tile exit between repeat
  // pulses. Keep steering available each tick on these surfaces. Boots
  // turn ice/force floors into ordinary walking, which uses the repeat delay.
  return [cell.top, cell.bottom].some((tile) => {
    const kind = msTileForcedFloorKind(tile.id);
    if (kind === "ice") return !frame.snapshot.inventory.boots[0];
    if (kind === "slide") return !frame.snapshot.inventory.boots[1];
    return kind !== "none";
  });
}
