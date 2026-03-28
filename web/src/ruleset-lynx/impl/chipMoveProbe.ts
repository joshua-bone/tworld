import type { EngineState } from "@game-core/api/model";
import type { ActorCollisionOutcome } from "@game-core/api/actorInteractions";
import { hasBoardCell } from "@game-core/impl/board";
import { actorInventoryHasKey } from "@game-core/impl/actorLocalInventory";
import { advanceToCell } from "@game-core/impl/grid";
import type { OccupancyTarget } from "@game-core/impl/occupancy";
import { lynxChipMovementMask, lynxDoorKeyIndex, lynxToggledWallTileId } from "@ruleset-lynx/impl/catalog";
import {
  lynxInteractionTargetFromOccupancy,
  type LynxInteractionTargetActorRef,
  type LynxInteractionTargetPortableItemRef,
} from "@ruleset-lynx/impl/actorInteractions";
import { projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
import { queryLynxOccupancyTarget } from "@ruleset-lynx/impl/occupancy";
import { isLynxBlockedChipEnterRevealTile } from "@ruleset-lynx/impl/tileEffects";
import { MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

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

export interface LynxChipMoveProbeActor
  extends LynxInteractionTargetActorRef {
  hidden: boolean;
  moving: number;
  deferPush?: boolean;
}

export interface LynxChipMoveProbePortableItem
  extends LynxInteractionTargetPortableItemRef {}

export interface LynxChipMoveDirectionProbe {
  canMove: boolean;
  canEnter: boolean;
  canPush: boolean;
  willCollide: boolean;
  pushStopsBeforeEntry: boolean;
  pushBlockPos: number | null;
  targetPos: number | null;
  tileId: number;
}

export interface LynxChipMoveDirectionProbeContext<
  TActor extends LynxChipMoveProbeActor = LynxChipMoveProbeActor,
  TPortableItem extends LynxChipMoveProbePortableItem = LynxChipMoveProbePortableItem,
> {
  state: EngineState;
  chipPos: number;
  canExit(dir: number): boolean;
  queryTargetOccupancy(pos: number): OccupancyTarget<TActor, TPortableItem>;
  probeTargetCell(pos: number, dir: number, claimedCell: boolean): LynxChipTargetCellProbe;
  interactionOutcome(target: ReturnType<typeof lynxInteractionTargetFromOccupancy>): ActorCollisionOutcome;
  canPushBlock(actor: TActor, dir: number): boolean;
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

export function probeLynxChipMoveDirectionWithContext<
  TActor extends LynxChipMoveProbeActor,
  TPortableItem extends LynxChipMoveProbePortableItem,
>(
  context: LynxChipMoveDirectionProbeContext<TActor, TPortableItem>,
  dir: number,
): LynxChipMoveDirectionProbe {
  if (!context.canExit(dir)) {
    return {
      canMove: false,
      canEnter: false,
      canPush: false,
      willCollide: false,
      pushStopsBeforeEntry: false,
      pushBlockPos: null,
      targetPos: null,
      tileId: MS_TILE.Empty,
    };
  }

  const targetStep = advanceToCell(context.state.map.cells, context.chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return {
      canMove: false,
      canEnter: false,
      canPush: false,
      willCollide: false,
      pushStopsBeforeEntry: false,
      pushBlockPos: null,
      targetPos: null,
      tileId: MS_TILE.Empty,
    };
  }

  const { pos: targetPos } = targetStep;
  const targetOccupancy = context.queryTargetOccupancy(targetPos);
  const targetProbe = context.probeTargetCell(targetPos, dir, targetOccupancy.claimed);

  if (targetOccupancy.claimed && targetOccupancy.runtimeActor?.id === MS_TILE.Block) {
    const canPush = lynxChipTargetCellAllowsPush(targetProbe) && context.canPushBlock(targetOccupancy.runtimeActor, dir);
    const pushStopsBeforeEntry = canPush && lynxChipTargetCellStopsOnPush(targetProbe);
    const canEnter = canPush && !pushStopsBeforeEntry;
    return {
      canMove: canEnter,
      canEnter,
      canPush,
      willCollide: false,
      pushStopsBeforeEntry,
      pushBlockPos: canPush ? targetPos : null,
      targetPos,
      tileId: targetProbe.tileId,
    };
  }

  const interaction = context.interactionOutcome(lynxInteractionTargetFromOccupancy(targetOccupancy, dir));
  const canEnter = lynxChipTargetCellAllowsEntry(targetProbe) && !interaction.denyMove;
  return {
    canMove: canEnter,
    canEnter,
    canPush: false,
    willCollide: canEnter && interaction.chipFails,
    pushStopsBeforeEntry: false,
    pushBlockPos: null,
    targetPos,
    tileId: targetProbe.tileId,
  };
}
