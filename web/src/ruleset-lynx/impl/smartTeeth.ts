import type { EngineMapCell } from "@game-core/api/model";
import { nextPosition, reverseDirection } from "@game-core/impl/grid";
import type { SmartTeethAgent, SmartTeethNode } from "@game-core/impl/smartTeethPathfinding";
import { MS_DIRECTION, MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxActorEntryMask,
  lynxButtonAction,
  lynxExitMovementMask,
  lynxFixedSlideDirection,
  lynxIceWallTurn,
  lynxRequiresReleaseToExit,
  lynxTileForcedFloorKind,
  lynxToggledWallTileId,
} from "@ruleset-lynx/impl/catalog";
import { lynxActorHazardOutcome } from "@ruleset-lynx/impl/actorInteractions";

const DIRECTIONS = [MS_DIRECTION.north, MS_DIRECTION.west, MS_DIRECTION.south, MS_DIRECTION.east] as const;

export interface LynxSmartTeethProbeContext {
  readonly cells: readonly EngineMapCell[];
  readonly currentTime: number;
  readonly rootMoving?: boolean;
  effectiveTileId(tileId: number): number;
  isBlocked(pos: number): boolean;
  isReleased?(pos: number): boolean;
}

function probeLynxSmartTeethMovement(
  context: LynxSmartTeethProbeContext,
  agent: SmartTeethAgent,
  node: SmartTeethNode,
  pendingTeleport: boolean,
): readonly SmartTeethNode[] {
  const floorAt = (pos: number, toggled = false) => {
    const current = context.effectiveTileId(context.cells[pos]?.top.id ?? MS_TILE.Wall);
    return toggled ? lynxToggledWallTileId(current) : current;
  };
  const forcedKind = (pos: number, toggled = false) => lynxTileForcedFloorKind(floorAt(pos, toggled));
  const supported = (pos: number, toggled = false) => {
    const kind = forcedKind(pos, toggled);
    return kind === "none" || kind === "ice" || kind === "teleport" || (kind === "slide" && lynxFixedSlideDirection(floorAt(pos, toggled)) !== 0);
  };
  const isRoot = (candidate: SmartTeethNode) => candidate.pos === agent.pos && candidate.dir === agent.dir &&
    !!candidate.toggled === !!agent.toggled;
  const forcedDirection = (candidate: SmartTeethNode, starting = false) => {
    if (lynxRequiresReleaseToExit(floorAt(candidate.pos, candidate.toggled))) return candidate.dir;
    if (starting && context.currentTime === 0) {
      return 0;
    }
    if (forcedKind(candidate.pos, candidate.toggled) === "slide") {
      return lynxFixedSlideDirection(floorAt(candidate.pos, candidate.toggled));
    }
    if (forcedKind(candidate.pos, candidate.toggled) === "ice") {
      return starting && !context.rootMoving ? candidate.dir : lynxIceWallTurn(floorAt(candidate.pos, candidate.toggled), candidate.dir);
    }
    if (forcedKind(candidate.pos, candidate.toggled) === "teleport") return candidate.dir;
    return 0;
  };
  const targetPosition = (from: number, dir: number) => {
    const to = nextPosition(from, dir, MS_GRID_WIDTH);
    if (to < 0 || to >= MS_GRID_WIDTH * MS_GRID_HEIGHT) return null;
    if (Math.abs((from % MS_GRID_WIDTH) - (to % MS_GRID_WIDTH)) + Math.abs(Math.floor(from / MS_GRID_WIDTH) - Math.floor(to / MS_GRID_WIDTH)) !== 1) return null;
    return to;
  };
  const rawStep = (from: SmartTeethNode, dir: number, safe = true): SmartTeethNode | null => {
    const source = floorAt(from.pos, from.toggled);
    if ((lynxExitMovementMask(source) & dir) === 0 ||
      (lynxRequiresReleaseToExit(source) && !context.isReleased?.(from.pos))) return null;
    if (forcedKind(from.pos, from.toggled) === "slide" && lynxFixedSlideDirection(source) === reverseDirection(dir)) return null;
    const pos = targetPosition(from.pos, dir);
    if (pos === null || context.isBlocked(pos) || (safe && !supported(pos, from.toggled))) return null;
    const target = floorAt(pos, from.toggled);
    if ((lynxActorEntryMask(target, MS_TILE.SmartTeeth) & dir) === 0) return null;
    const hazard = lynxActorHazardOutcome(target, MS_TILE.SmartTeeth);
    if (hazard === "deny-entry" || (safe && hazard !== "none")) return null;
    const toggled = !!from.toggled !== (lynxButtonAction(target) === "toggle-walls");
    return toggled ? { pos, dir, toggled: true } : { pos, dir };
  };
  const teleportLanding = (target: SmartTeethNode, safeExit = true): SmartTeethNode | null => {
    // Native Lynx searches backwards in reading order and selects the first
    // physically usable exit, even if its next floor would kill the actor.
    // Probe that exact destination; never skip an unsafe one to invent a route.
    for (let offset = 1; offset <= MS_GRID_WIDTH * MS_GRID_HEIGHT; offset += 1) {
      const pos = (target.pos - offset + MS_GRID_WIDTH * MS_GRID_HEIGHT) % (MS_GRID_WIDTH * MS_GRID_HEIGHT);
      if (forcedKind(pos, target.toggled) !== "teleport" || context.isBlocked(pos)) continue;
      const landing = target.toggled ? { pos, dir: target.dir, toggled: true } : { pos, dir: target.dir };
      if (rawStep(landing, target.dir, false) === null) continue;
      return !safeExit || rawStep(landing, target.dir) !== null
        ? { ...landing, ...(pos !== target.pos ? { via: target.pos } : {}) }
        : null;
    }
    return target;
  };
  const step = (from: SmartTeethNode, dir: number): SmartTeethNode | null => {
    const target = rawStep(from, dir);
    return target !== null && forcedKind(target.pos, target.toggled) === "teleport" ? teleportLanding(target) : target;
  };
  const forcedStep = (from: SmartTeethNode, dir: number) => {
    const forward = step(from, dir);
    if (forward || forcedKind(from.pos, from.toggled) !== "ice") return forward;
    if (rawStep(from, dir, false) !== null) return null;
    return step(from, lynxIceWallTurn(floorAt(from.pos, from.toggled), reverseDirection(dir)));
  };
  const safeForcedContinuation = (start: SmartTeethNode) => {
    let current = start;
    const visited = new Set<string>();
    while (forcedKind(current.pos, current.toggled) === "ice" || forcedKind(current.pos, current.toggled) === "slide" || forcedKind(current.pos, current.toggled) === "teleport") {
      const key = `${current.pos}:${current.dir}:${current.toggled ? 1 : 0}`;
      if (visited.has(key)) return true;
      visited.add(key);
      const dir = forcedDirection(current);
      const targetPos = targetPosition(current.pos, dir);
      if (targetPos !== null && !context.isBlocked(targetPos)) {
        const target = floorAt(targetPos, current.toggled);
        const hazard = lynxActorHazardOutcome(target, MS_TILE.SmartTeeth);
        // Water and bombs are legal physical moves that kill this actor. A wall or
        // denied fire entry instead stops a force floor or bounces an ice move.
        if ((lynxActorEntryMask(target, MS_TILE.SmartTeeth) & dir) !== 0 && hazard !== "none" && hazard !== "deny-entry") return false;
        if (!supported(targetPos, current.toggled)) return false;
      }
      const next = forcedStep(current, dir);
      if (!next) return true;
      current = next;
    }
    return true;
  };

  if (!supported(node.pos, node.toggled)) return [];
  if (pendingTeleport) {
    const landing = teleportLanding(node, false);
    return landing === null ? [] : [landing];
  }
  const forced = forcedDirection(node, isRoot(node));
  const candidates = forced !== 0 ? [forcedStep(node, forced)] : DIRECTIONS.map((dir) => step(node, dir));
  return candidates.filter((candidate): candidate is SmartTeethNode => candidate !== null && safeForcedContinuation(candidate));
}

/** Read-only movement graph: no movement attempts, PRNG draws, pushes or pickups. */
export function lynxSmartTeethNeighbors(
  context: LynxSmartTeethProbeContext,
  agent: SmartTeethAgent,
  node: SmartTeethNode,
): readonly SmartTeethNode[] {
  return probeLynxSmartTeethMovement(context, agent, node, false);
}

/** Entry direction is committed; the landing is resolved from the current board. */
export function resolveLynxSmartTeethPendingTeleport(
  context: LynxSmartTeethProbeContext,
  agent: SmartTeethAgent,
): SmartTeethNode | undefined {
  return probeLynxSmartTeethMovement(context, agent, { pos: agent.pos, dir: agent.dir }, true)[0];
}
