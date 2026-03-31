import type { EngineState } from "@game-core/api/model";
import { addTopTileFlags, hasTopTileFlags, removeTopTileFlags, replaceTopTile, topTileIdOr } from "@game-core/impl/board";
import { actorFloorImpactTeleports } from "@game-core/impl/floorImpact";
import { advanceToCell } from "@game-core/impl/grid";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { lynxTileForcedFloorKind } from "@ruleset-lynx/impl/catalog";
import { lynxTilePostEntryAction } from "@ruleset-lynx/impl/floorImpactPolicy";
import { MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxTeleportActor {
  id: number;
  pos: number;
  z?: number;
  dir: number;
  teleported: boolean;
  hidden: boolean;
  moving: number;
}

export interface LynxTeleportContext {
  state: EngineState;
  actors: LynxTeleportActor[];
  activeLayerZ(): number;
  withLayer<T>(z: number, run: () => T): T;
  chipActsWallForMobs(pos: number, z: number): boolean;
  chipTeleportLandingIsClear(teleportPos: number): boolean;
  canChipEnter(pos: number, dir: number): boolean;
  claimedChipTeleportExitIsValid(exitPos: number, dir: number): boolean;
  canActorExitTeleport(actor: LynxTeleportActor): boolean;
  markChipTeleported(): void;
  settleChipTeleportDrop(originPos: number, originZ: number): void;
}

function findLynxTeleportDestination(
  state: EngineState,
  origin: number,
  canExit: (teleportPos: number) => boolean,
): { pos: number; teleported: boolean } {
  let pos = origin;

  for (;;) {
    pos -= 1;
    if (pos < 0) {
      pos += MS_GRID_WIDTH * MS_GRID_HEIGHT;
    }

    const cell = state.map.cells[pos];
    if (!actorFloorImpactTeleports(lynxTilePostEntryAction(cell?.top.id ?? MS_TILE.Empty) ?? "none")) {
      if ((cell?.top.state ?? 0) & LYNX_CELL_FLAG.Teleport) {
        replaceTopTile(state.map.cells, pos, { ...cell!.top, id: MS_TILE.Teleport });
      }
      continue;
    }

    if (canExit(pos)) {
      return { pos, teleported: true };
    }

    if (pos === origin) {
      return { pos: origin, teleported: false };
    }
  }
}

export function resolveLynxChipTeleport(
  context: LynxTeleportContext,
  chipPos: number,
  chipDir: number,
): number {
  const destination = findLynxTeleportDestination(context.state, chipPos, (teleportPos) => {
    if (teleportPos !== chipPos && !context.chipTeleportLandingIsClear(teleportPos)) {
      return false;
    }

    const exitStep = advanceToCell(context.state.map.cells, teleportPos, chipDir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
    if (!exitStep) {
      return false;
    }
    const { pos: exitPos } = exitStep;

    if (hasTopTileFlags(context.state.map.cells, exitPos, LYNX_CELL_FLAG.Claimed)) {
      return context.claimedChipTeleportExitIsValid(exitPos, chipDir);
    }

    return context.canChipEnter(exitPos, chipDir);
  });

  if (!destination.teleported) {
    return chipPos;
  }

  context.markChipTeleported();
  return destination.pos;
}

export function resolveLynxActorTeleport(
  context: LynxTeleportContext,
  actor: LynxTeleportActor,
): void {
  const origin = actor.pos;
  let pos = origin;

  for (;;) {
    pos -= 1;
    if (pos < 0) {
      pos += MS_GRID_WIDTH * MS_GRID_HEIGHT;
    }

    const cell = context.state.map.cells[pos];
    if (!actorFloorImpactTeleports(lynxTilePostEntryAction(cell?.top.id ?? MS_TILE.Empty) ?? "none")) {
      if ((cell?.top.state ?? 0) & LYNX_CELL_FLAG.Teleport) {
        replaceTopTile(context.state.map.cells, pos, { ...cell!.top, id: MS_TILE.Teleport });
      }
      continue;
    }
    if (context.chipActsWallForMobs(pos, actor.z ?? context.activeLayerZ())) {
      if (pos === origin) {
        addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
        return;
      }
      continue;
    }

    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    actor.pos = pos;

    if (hasTopTileFlags(context.state.map.cells, pos, LYNX_CELL_FLAG.Claimed)) {
      if (pos === origin) {
        addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
        return;
      }
      continue;
    }

    if (!context.canActorExitTeleport(actor)) {
      if (pos === origin) {
        addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
        return;
      }
      continue;
    }

    addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    actor.teleported = true;
    return;
  }
}

export function resolveLynxTeleports(
  context: LynxTeleportContext,
  chipPos: number,
  chipDir: number,
  chipMoving: number,
): number {
  for (let index = context.actors.length - 1; index >= 0; index -= 1) {
    const actor = context.actors[index]!;
    if (actor.hidden || actor.moving > 0) {
      continue;
    }
    context.withLayer(actor.z ?? 1, () => {
      if (!actorFloorImpactTeleports(lynxTilePostEntryAction(topTileIdOr(context.state.map.cells, actor.pos, MS_TILE.Empty)) ?? "none")) {
        return;
      }
      resolveLynxActorTeleport(context, actor);
    });
  }

  if (
    chipMoving === 0 &&
    actorFloorImpactTeleports(lynxTilePostEntryAction(topTileIdOr(context.state.map.cells, chipPos, MS_TILE.Empty)) ?? "none")
  ) {
    const teleportOriginPos = chipPos;
    const teleportOriginZ = context.activeLayerZ();
    chipPos = resolveLynxChipTeleport(context, chipPos, chipDir);
    if (chipPos !== teleportOriginPos) {
      context.settleChipTeleportDrop(teleportOriginPos, teleportOriginZ);
    }
  }

  return chipPos;
}
