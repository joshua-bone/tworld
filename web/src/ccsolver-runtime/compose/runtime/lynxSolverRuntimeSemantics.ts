import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { collectLevelConnections } from "@ruleset-ms/api/level";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type {
  LynxInteractiveSessionState,
  LynxRuntimeActor,
} from "@ruleset-lynx/impl/engine";
import {
  queryLynxOccupancyTarget,
  type LynxOccupancyPortableItemRef,
} from "@ruleset-lynx/impl/occupancy";
import { isLynxClonerSpecialFloor } from "@ruleset-lynx/impl/elements/tiles/specialFloorRegistration";

function cellsForLynxLayer(session: LynxInteractiveSessionState, z: number): EngineMapCell[] | null {
  return session.state.map.layers?.find((layer) => layer.z === z)?.cells
    ?? (z === 1 ? session.state.map.cells : null);
}

function portableItems(state: EngineState): readonly LynxOccupancyPortableItemRef[] {
  return (state as EngineState & {
    lynxRuntimeState?: {
      portableTools?: { portableItems?: readonly LynxOccupancyPortableItemRef[] };
    };
  }).lynxRuntimeState?.portableTools?.portableItems ?? [];
}

function cellHasButton(cell: EngineMapCell, buttonId: number): boolean {
  return cell.top.id === buttonId || cell.bottom.id === buttonId;
}

function cellFloorId(cell: EngineMapCell | undefined): number {
  if (!cell) return MS_TILE.Empty;
  return cell.top.id === MS_TILE.Beartrap ? cell.top.id : cell.bottom.id;
}

export function isLynxSolverBrownButtonHeld(
  session: LynxInteractiveSessionState,
  buttonPos: number,
  z = 1,
): boolean {
  return isLynxSolverButtonPressed(session, buttonPos, MS_TILE.Button_Brown, z);
}

export function isLynxSolverButtonPressed(
  session: LynxInteractiveSessionState,
  buttonPos: number,
  buttonId: number,
  z = 1,
): boolean {
  const cells = cellsForLynxLayer(session, z);
  const cell = cells?.[buttonPos];
  if (!cells || !cell || !cellHasButton(cell, buttonId)) return false;

  const occupancy = queryLynxOccupancyTarget<LynxRuntimeActor, LynxOccupancyPortableItemRef>({
    cells,
    chipPos: session.chipPos,
    chipZ: session.chipZ,
    actors: session.actors,
    portableItems: portableItems(session.state),
  }, buttonPos, z);
  if (occupancy.kind === "portable-item") return true;
  if (occupancy.kind === "chip") return session.chipMoving <= 0;
  if (occupancy.kind === "runtime-actor") return (occupancy.runtimeActor?.moving ?? 1) <= 0;
  return false;
}

export function isLynxSolverBeartrapOpen(
  session: LynxInteractiveSessionState,
  trapPos: number,
  z = 1,
): boolean {
  return collectLevelConnections(session.level, "traps").some((connection) => {
    const connectionZ = connection.toZ ?? connection.fromZ ?? 1;
    return connection.to === trapPos
      && (connection.fromZ ?? connectionZ) === z
      && (connection.toZ ?? connectionZ) === z
      && isLynxSolverBrownButtonHeld(session, connection.from, z);
  });
}

export function isLynxSolverActorTrapped(
  session: LynxInteractiveSessionState,
  actor: {
    readonly pos: number;
    readonly z?: number;
    readonly moving: number;
  },
): boolean {
  if (actor.moving > 0) return false;
  const z = actor.z ?? 1;
  const cells = cellsForLynxLayer(session, z);
  return cellFloorId(cells?.[actor.pos]) === MS_TILE.Beartrap
    && !isLynxSolverBeartrapOpen(session, actor.pos, z);
}

export function isLynxSolverActorContained(
  session: LynxInteractiveSessionState,
  actor: LynxRuntimeActor,
): boolean {
  if (actor.hidden || actor.moving > 0) return false;
  const z = actor.z ?? 1;
  const cell = cellsForLynxLayer(session, z)?.[actor.pos];
  return cell !== undefined
    && (isLynxClonerSpecialFloor(cell.top.id)
      || isLynxClonerSpecialFloor(cell.bottom.id));
}
