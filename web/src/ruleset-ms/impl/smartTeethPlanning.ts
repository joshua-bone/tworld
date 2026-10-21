import type { EngineMapCell } from "@game-core/api/model";
import type { SmartTeethAgent, SmartTeethNode } from "@game-core/impl/smartTeethPathfinding";
import { reverseDirection } from "@game-core/impl/grid";
import {
  MS_DIRECTION, MS_FLOOR_STATE, MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE,
  isMsCreature, isMsStaticBlockTile, msCreatureId,
} from "@ruleset-ms/api/tiles";
import {
  msActorEntryMask, msButtonAction, msExitMovementMask, msIsOverlayFloorTile,
  msRequiresReleaseToExit, msTileForcedFloorKind,
} from "@ruleset-ms/impl/catalog";
import { msIceWallTurn, msSlideDirection } from "@ruleset-ms/impl/catalogTiles";
import { msActorHazardOutcome } from "@ruleset-ms/impl/actorInteractions";
import { findMsCreatureTeleportDestination } from "@ruleset-ms/impl/teleports";
import { probeMsTileExitEffect } from "@ruleset-ms/impl/tileEffects";

export interface MsSmartTeethPlanningContext {
  readonly cells: EngineMapCell[];
  readonly actorId: number;
  readonly released: boolean;
  readonly blockedPositions: ReadonlySet<number>;
  readonly isTrapOpen?: (pos: number, sourcePos: number) => boolean;
}

const DIRECTIONS = [MS_DIRECTION.north, MS_DIRECTION.west, MS_DIRECTION.south, MS_DIRECTION.east] as const;

function planningTileId(tile: EngineMapCell["top"], toggled: boolean | undefined): number {
  if (toggled && (tile.state & MS_FLOOR_STATE.Broken) === 0) {
    if (tile.id === MS_TILE.SwitchWall_Open) return MS_TILE.SwitchWall_Closed;
    if (tile.id === MS_TILE.SwitchWall_Closed) return MS_TILE.SwitchWall_Open;
  }
  return tile.id;
}

function togglesOnArrival(context: MsSmartTeethPlanningContext, pos: number): boolean {
  const cell = context.cells[pos]!;
  // MS pushes the entering actor above the old top tile. An item therefore
  // covers a button; an actor already covering it exposes the bottom floor.
  const floor = isMsCreature(cell.top.id) ? cell.bottom : cell.top;
  return msButtonAction(floor.id) === "toggle-walls";
}

function planningFloor(context: MsSmartTeethPlanningContext, pos: number): EngineMapCell["top"] {
  const cell = context.cells[pos]!;
  return msIsOverlayFloorTile(cell.top.id) ? cell.bottom : cell.top;
}

function adjacentPosition(pos: number, dir: number): number | null {
  const x = pos % MS_GRID_WIDTH + (dir === MS_DIRECTION.east ? 1 : dir === MS_DIRECTION.west ? -1 : 0);
  const y = Math.floor(pos / MS_GRID_WIDTH) + (dir === MS_DIRECTION.south ? 1 : dir === MS_DIRECTION.north ? -1 : 0);
  return x < 0 || x >= MS_GRID_WIDTH || y < 0 || y >= MS_GRID_HEIGHT ? null : y * MS_GRID_WIDTH + x;
}

function canPlanStep(
  context: MsSmartTeethPlanningContext,
  agent: SmartTeethAgent,
  node: SmartTeethNode,
  dir: number,
  checkSafety = true,
): number | null {
  const from = node.pos;
  const source = context.cells[from];
  const to = adjacentPosition(from, dir);
  if (!source || to === null || !context.cells[to]) {
    return null;
  }
  const sourceFloor = planningFloor(context, from).id;
  const released = from === agent.pos ? context.released : (context.isTrapOpen?.(from, -1) ?? false);
  if ((msExitMovementMask(sourceFloor) & dir) === 0 ||
      probeMsTileExitEffect(sourceFloor, dir, released) === false ||
      (msRequiresReleaseToExit(sourceFloor) && !released)) {
    return null;
  }
  if (to !== agent.pos && context.blockedPositions.has(to)) {
    return null;
  }

  const target = context.cells[to]!;
  for (const tile of [target.top, target.bottom]) {
    const tileId = planningTileId(tile, node.toggled);
    if (isMsCreature(tileId)) {
      const id = msCreatureId(tileId);
      if (to !== agent.pos && id !== MS_TILE.Chip && id !== MS_TILE.Swimming_Chip && id !== MS_TILE.Pushing_Chip) {
        return null;
      }
      continue;
    }
    if (isMsStaticBlockTile(tileId) || (msActorEntryMask(tileId, context.actorId) & dir) === 0) {
      return null;
    }
    if (checkSafety && msActorHazardOutcome(tileId, context.actorId) !== "none") {
      return null;
    }
    const forced = msTileForcedFloorKind(tileId);
    // A planar plan cannot promise the destination after a vertical transfer.
    if (forced === "air" || forced === "elevator") {
      return null;
    }
  }
  return to;
}

function planningNeighbors(
  context: MsSmartTeethPlanningContext,
  agent: SmartTeethAgent,
  node: SmartTeethNode,
  checkSafety: boolean,
): readonly SmartTeethNode[] {
  if (!context.cells[node.pos]) {
    return [];
  }
  const sourceFloor = planningFloor(context, node.pos);
  const forcedKind = msTileForcedFloorKind(sourceFloor.id);
  let directions: readonly number[] = DIRECTIONS;
  if (forcedKind === "ice") {
    const forward = msIceWallTurn(sourceFloor.id, node.dir);
    // Bounce only when the normal engine would be blocked, never merely because
    // the forward destination is lethal and the planner would prefer to turn.
    directions = canPlanStep(context, agent, node, forward, false) !== null
      ? [forward]
      : [msIceWallTurn(sourceFloor.id, reverseDirection(forward))];
  } else if (forcedKind === "slide") {
    const dir = msSlideDirection(sourceFloor.id, MS_DIRECTION.none);
    directions = dir === MS_DIRECTION.none ? [] : [dir];
  } else if (forcedKind === "teleport" && (sourceFloor.state & MS_FLOOR_STATE.Broken) === 0) {
    directions = [node.dir];
  } else if (forcedKind === "air" || forcedKind === "elevator") {
    return [];
  }

  const neighbors: SmartTeethNode[] = [];
  for (const dir of directions) {
    if (dir === MS_DIRECTION.none) {
      continue;
    }
    let to = canPlanStep(context, agent, node, dir, checkSafety);
    if (to === null) {
      continue;
    }
    let via: number | undefined;
    const floor = planningFloor(context, to);
    if (msTileForcedFloorKind(floor.id) === "teleport" && (floor.state & MS_FLOOR_STATE.Broken) === 0) {
      const entrance = to;
      to = findMsCreatureTeleportDestination({
        cells: context.cells,
        start: to,
        dir,
        occupiedOriginPos: node.pos,
        canExit: (destination) => canPlanStep(context, agent, { ...node, pos: destination }, dir, false) !== null,
      });
      if (to !== entrance) via = entrance;
      // Teleport selection follows native legality. Reject its selected exit if
      // it is lethal, rather than silently choosing a different teleporter.
      if (checkSafety && canPlanStep(context, agent, { ...node, pos: to }, dir) === null) {
        continue;
      }
    }
    const toggled = Boolean(node.toggled) !== togglesOnArrival(context, to);
    neighbors.push({ pos: to, dir, ...(toggled ? { toggled: true } : {}), ...(via === undefined ? {} : { via }) });
  }
  return neighbors;
}

function hasSafeForcedContinuation(
  context: MsSmartTeethPlanningContext,
  agent: SmartTeethAgent,
  start: SmartTeethNode,
): boolean {
  const visited = new Set<string>();
  let node = start;
  for (;;) {
    const floor = planningFloor(context, node.pos);
    const forced = msTileForcedFloorKind(floor.id);
    if (forced === "none" || (forced === "teleport" && (floor.state & MS_FLOOR_STATE.Broken) !== 0)) {
      return true;
    }
    const key = `${node.pos}:${node.dir}:${Number(Boolean(node.toggled))}`;
    if (visited.has(key)) {
      return true;
    }
    visited.add(key);
    const legalNext = planningNeighbors(context, agent, node, false)[0];
    if (!legalNext) {
      return true;
    }
    const safeNext = planningNeighbors(context, agent, node, true)[0];
    if (!safeNext) {
      return false;
    }
    node = safeNext;
  }
}

/** Read-only legal transitions; unlike movement probes this never activates tiles. */
export function msSmartTeethNeighbors(
  context: MsSmartTeethPlanningContext,
  agent: SmartTeethAgent,
  node: SmartTeethNode,
): readonly SmartTeethNode[] {
  return planningNeighbors(context, agent, node, true).filter((next) => hasSafeForcedContinuation(context, agent, next));
}

export function msSmartTeethDirectionMatters(context: MsSmartTeethPlanningContext, node: SmartTeethNode): boolean {
  const floor = planningFloor(context, node.pos).id;
  return msTileForcedFloorKind(floor) !== "none" || msRequiresReleaseToExit(floor) || floor === MS_TILE.CloneMachine;
}

export function msSmartTeethCanWait(context: MsSmartTeethPlanningContext, node: SmartTeethNode): boolean {
  const floor = planningFloor(context, node.pos).id;
  return msTileForcedFloorKind(floor) === "none" && msActorHazardOutcome(floor, context.actorId) === "none";
}

export function msSmartTeethHasToggleButtons(context: MsSmartTeethPlanningContext): boolean {
  return context.cells.some((_cell, pos) => !context.blockedPositions.has(pos) && togglesOnArrival(context, pos));
}
