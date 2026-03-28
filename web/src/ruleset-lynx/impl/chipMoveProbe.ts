import type { EngineState } from "@game-core/api/model";
import { hasBoardCell } from "@game-core/impl/board";
import { actorInventoryHasKey } from "@game-core/impl/actorLocalInventory";
import { lynxChipMovementMask, lynxDoorKeyIndex, lynxToggledWallTileId } from "@ruleset-lynx/impl/catalog";
import { projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
import { queryLynxOccupancyTarget } from "@ruleset-lynx/impl/occupancy";
import { isLynxBlockedChipEnterRevealTile } from "@ruleset-lynx/impl/tileEffects";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export const LYNX_CHIP_TARGET_CELL_PROBE = {
  blocked: "blocked",
  enter: "enter",
  pushOnly: "push-only",
} as const;

export type LynxChipTargetCellProbeStatus =
  (typeof LYNX_CHIP_TARGET_CELL_PROBE)[keyof typeof LYNX_CHIP_TARGET_CELL_PROBE];

export interface LynxChipTargetCellProbe {
  status: LynxChipTargetCellProbeStatus;
  tileId: number;
}

export interface LynxChipTargetCellProbeOptions {
  claimedCell?: boolean;
  toggleWallsPending?: boolean;
}

export function probeLynxChipTargetCell(
  state: EngineState,
  pos: number,
  dir: number,
  options: LynxChipTargetCellProbeOptions = {},
): LynxChipTargetCellProbe {
  if (!hasBoardCell(state.map.cells, pos)) {
    return { status: LYNX_CHIP_TARGET_CELL_PROBE.blocked, tileId: MS_TILE.Empty };
  }

  const occupancy = queryLynxOccupancyTarget(
    {
      cells: state.map.cells,
    },
    pos,
  );
  if (occupancy.kind === "blocked-visual") {
    return { status: LYNX_CHIP_TARGET_CELL_PROBE.blocked, tileId: occupancy.tileId };
  }

  const tileId = options.toggleWallsPending ? lynxToggledWallTileId(occupancy.tileId) : occupancy.tileId;
  const revealWall = isLynxBlockedChipEnterRevealTile(tileId);
  if (options.claimedCell && revealWall) {
    return { status: LYNX_CHIP_TARGET_CELL_PROBE.pushOnly, tileId };
  }

  if ((lynxChipMovementMask(tileId) & dir) === 0) {
    return { status: LYNX_CHIP_TARGET_CELL_PROBE.blocked, tileId };
  }

  if (revealWall) {
    return { status: LYNX_CHIP_TARGET_CELL_PROBE.blocked, tileId };
  }

  const keyIndex = lynxDoorKeyIndex(tileId);
  if (keyIndex !== null) {
    const chipInventory = projectLynxActorInventoryOwner(MS_TILE.Chip, state.inventory);
    return actorInventoryHasKey(chipInventory, keyIndex)
      ? { status: LYNX_CHIP_TARGET_CELL_PROBE.enter, tileId }
      : { status: LYNX_CHIP_TARGET_CELL_PROBE.blocked, tileId };
  }

  if (tileId === MS_TILE.Socket && state.inventory.chipsNeeded > 0) {
    return { status: LYNX_CHIP_TARGET_CELL_PROBE.blocked, tileId };
  }

  return { status: LYNX_CHIP_TARGET_CELL_PROBE.enter, tileId };
}

export function lynxChipTargetCellAllowsEntry(probe: LynxChipTargetCellProbe): boolean {
  return probe.status === LYNX_CHIP_TARGET_CELL_PROBE.enter;
}

export function lynxChipTargetCellAllowsPush(probe: LynxChipTargetCellProbe): boolean {
  return probe.status !== LYNX_CHIP_TARGET_CELL_PROBE.blocked;
}

export function lynxChipTargetCellStopsOnPush(probe: LynxChipTargetCellProbe): boolean {
  return probe.status === LYNX_CHIP_TARGET_CELL_PROBE.pushOnly;
}
