import type { EngineMapCell } from "@game-core/api/model";
import type {
  MsInteractiveSessionState,
  MsTrackedBlock,
  MsTrackedCreature,
} from "@ruleset-ms/impl/engine";
import type { SolverActorLifecycle } from "@tworld/ccsolver/domain";
import { isMsTrapOpen } from "@ruleset-ms/impl/trapCloner";
import { isMsClonerSpecialFloor } from "@ruleset-ms/impl/elements/tiles/specialFloorRegistration";
import { MS_FLOOR_STATE, MS_TILE } from "@ruleset-ms/api/tiles";

function cellsForMsLayer(session: MsInteractiveSessionState, z: number): EngineMapCell[] | null {
  return session.state.engine.map.layers?.find((layer) => layer.z === z)?.cells
    ?? (z === 1 ? session.state.engine.map.cells : null);
}

function cellFloorId(cell: EngineMapCell | undefined): number {
  if (!cell) return MS_TILE.Empty;
  return cell.top.id === MS_TILE.Beartrap ? cell.top.id : cell.bottom.id;
}

export function isMsSolverBrownButtonHeld(
  session: MsInteractiveSessionState,
  buttonPos: number,
  z = 1,
): boolean {
  return isMsSolverButtonPressed(session, buttonPos, MS_TILE.Button_Brown, z);
}

export function isMsSolverButtonPressed(
  session: MsInteractiveSessionState,
  buttonPos: number,
  buttonId: number,
  z = 1,
): boolean {
  const cells = cellsForMsLayer(session, z);
  const cell = cells?.[buttonPos];
  if (!cell) return false;
  return cell.bottom.id === buttonId
    || (cell.top.id === buttonId && (cell.top.state & MS_FLOOR_STATE.ButtonDown) !== 0);
}

export function isMsSolverBeartrapOpen(
  session: MsInteractiveSessionState,
  trapPos: number,
  z = 1,
): boolean {
  const cells = cellsForMsLayer(session, z);
  return cells !== null && isMsTrapOpen({
    cells,
    traps: session.state.internal.traps,
    trapPos,
    skipButtonPos: -1,
    z,
  });
}

export function isMsSolverActorTrapped(
  session: MsInteractiveSessionState,
  actor: {
    readonly pos: number;
    readonly z?: number;
    readonly moving: boolean;
    readonly released: boolean;
  },
): boolean {
  if (actor.moving || actor.released) return false;
  const z = actor.z ?? 1;
  const cells = cellsForMsLayer(session, z);
  return cellFloorId(cells?.[actor.pos]) === MS_TILE.Beartrap
    && !isMsSolverBeartrapOpen(session, actor.pos, z);
}

export function msSolverCreatureLifecycle(
  session: MsInteractiveSessionState,
  creature: MsTrackedCreature,
): SolverActorLifecycle {
  if (!creature.hidden) return "active";
  const z = creature.z ?? 1;
  return session.state.internal.cloneSourceSerialByPosition.get(`${z}:${creature.pos}`) === creature.serial
    ? "contained"
    : "destroyed";
}

export function msSolverBlockLifecycle(
  session: MsInteractiveSessionState,
  block: MsTrackedBlock,
): SolverActorLifecycle {
  if (block.hidden) return "destroyed";
  const z = block.z ?? 1;
  const cell = cellsForMsLayer(session, z)?.[block.pos];
  return cell !== undefined && isMsClonerSpecialFloor(cell.bottom.id)
    ? "contained"
    : "active";
}
