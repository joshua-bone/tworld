import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport, type ActorAirHook } from "@game-core/api/actorCapabilities";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult } from "@game-core/api/verticalMovement";
import { promoteBottomTile } from "@game-core/impl/board";
import {
  lynxButtonAction,
  lynxInventorySlot,
} from "@ruleset-lynx/impl/catalog";
import {
  type LynxTileLeaveBehaviorContext,
} from "@ruleset-lynx/impl/elements/tiles/families/leave";
import { type LynxBlockedChipEnterTileBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/concrete/revealWall";
import {
  type LynxTileSupportBehaviorContext,
  type LynxTileSupportContext,
  type LynxTileSupportSubject,
} from "@ruleset-lynx/impl/elements/tiles/families/support";
import type { LynxTileExitProbeBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/concrete/specialFloors";
import { lookupLynxTileLifecyclePhase } from "@ruleset-lynx/impl/tileLifecycleRegistration";
import { isMsBlockActorId, isMsCreature, MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxTileActivationContext {
  toggleWalls(): void;
  queueTankReversals(): void;
  activateCloner(buttonPos: number): boolean;
  buttonPushedSound: number;
}

export function isLynxBlockedChipEnterRevealTile(tileId: number): boolean {
  return lookupLynxTileLifecyclePhase(tileId, "probe-enter") !== null;
}

export function lynxChipProbeUsesUnderlyingFloor(topId: number): boolean {
  return isMsCreature(topId) || lynxInventorySlot(topId) !== null;
}

function applyLynxMobExitTileAction(
  cells: EngineMapCell[],
  pos: number,
  layer: "top" | "bottom",
): boolean {
  const cell = cells[pos];
  if (!cell) {
    return false;
  }

  const tile = layer === "top" ? cell.top : cell.bottom;
  const afterLeave = lookupLynxTileLifecyclePhase(tile.id, "complete-exit");
  if (afterLeave === null) {
    return false;
  }
  const context: LynxTileLeaveBehaviorContext = {
    phase: "complete-exit",
    tileId: tile.id,
    cells,
    pos,
    layer,
    applied: false,
  };
  afterLeave(context);
  return context.applied;
}

export function applyLynxMobExitFloorEffect(cells: EngineMapCell[], pos: number): boolean {
  return applyLynxMobExitTileAction(cells, pos, "top") || applyLynxMobExitTileAction(cells, pos, "bottom");
}

export function probeLynxTileExitEffect(tileId: number, dir: number, released: boolean): boolean | null {
  const probeExit = lookupLynxTileLifecyclePhase(tileId, "probe-exit");
  if (probeExit === null) {
    return null;
  }

  const behaviorContext: LynxTileExitProbeBehaviorContext = {
    phase: "probe-exit",
    tileId,
    dir,
    released,
    allowed: true,
  };
  probeExit(behaviorContext);
  return behaviorContext.allowed;
}

export function lynxChipProbeTileId(cell: EngineMapCell): number {
  if (lynxChipProbeUsesUnderlyingFloor(cell.top.id) && cell.bottom.id !== MS_TILE.Empty) {
    return cell.bottom.id;
  }
  return cell.top.id;
}

export function applyLynxBlockedChipEnterEffect(state: EngineState, pos: number): boolean {
  const cell = state.map.cells[pos];
  if (!cell) {
    return false;
  }

  if (isLynxBlockedChipEnterRevealTile(cell.top.id)) {
    const probeEnter = lookupLynxTileLifecyclePhase(cell.top.id, "probe-enter");
    if (probeEnter === null) {
      return false;
    }
    const behaviorContext: LynxBlockedChipEnterTileBehaviorContext = {
      phase: "probe-enter",
      tileId: cell.top.id,
      actorId: MS_TILE.Chip,
      state,
      pos,
      layer: "top",
      blocked: false,
    };
    probeEnter(behaviorContext);
    return behaviorContext.blocked;
  }
  if (lynxChipProbeUsesUnderlyingFloor(cell.top.id) && isLynxBlockedChipEnterRevealTile(cell.bottom.id)) {
    const probeEnter = lookupLynxTileLifecyclePhase(cell.bottom.id, "probe-enter");
    if (probeEnter === null) {
      return false;
    }
    const behaviorContext: LynxBlockedChipEnterTileBehaviorContext = {
      phase: "probe-enter",
      tileId: cell.bottom.id,
      actorId: MS_TILE.Chip,
      state,
      pos,
      layer: "bottom",
      blocked: false,
    };
    probeEnter(behaviorContext);
    return behaviorContext.blocked;
  }
  return false;
}

export function applyLynxTileActivationEffect(
  context: LynxTileActivationContext,
  buttonPos: number,
  tileId: number,
): number {
  switch (lynxButtonAction(tileId)) {
    case "turn-tanks":
      context.queueTankReversals();
      return context.buttonPushedSound;
    case "toggle-walls":
      context.toggleWalls();
      return context.buttonPushedSound;
    case "activate-cloner":
      return context.activateCloner(buttonPos) ? context.buttonPushedSound : 0;
    case "spring-trap":
      return context.buttonPushedSound;
    default:
      return 0;
  }
}

export function resolveLynxTileSupportBelow(
  context: LynxTileSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  z: number,
  currentZ: number,
  subject: LynxTileSupportSubject,
): VerticalSupportResult {
  if (!lowerCells) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const actorBelow = context.findVisibleActorAt(pos, z);
  const topId = cell.top.id;

  if (actorUsesChipSupport(subject.supportHooks.airHook)) {
    if (actorBelow) {
      if (isMsBlockActorId(actorBelow.id)) {
        context.addTileOverlay(currentZ, pos, "support");
        return VERTICAL_SUPPORT_RESULT.supported;
      }
    }
    const resolvedByTile = resolveLynxTileSupportByBehavior(context, lowerCells, pos, z, currentZ, subject);
    if (resolvedByTile) {
      return resolvedByTile;
    }
    if (actorBelow) {
      return VERTICAL_SUPPORT_RESULT.unsupported;
    }
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }
  const resolvedByTile = resolveLynxTileSupportByBehavior(context, lowerCells, pos, z, currentZ, subject);
  if (resolvedByTile) {
    return resolvedByTile;
  }

  if (context.chipZ === z && context.chipPos === pos) {
    if (context.chipActsWallForMobs(pos, z)) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  if (context.findVisibleActorAt(pos, z)) {
    context.addTileOverlay(currentZ, pos, "support");
    return VERTICAL_SUPPORT_RESULT.supported;
  }

  return VERTICAL_SUPPORT_RESULT.unsupported;
}

function resolveLynxTileSupportByBehavior(
  context: LynxTileSupportContext,
  lowerCells: EngineMapCell[],
  pos: number,
  z: number,
  currentZ: number,
  subject: LynxTileSupportSubject,
): VerticalSupportResult | null {
  for (const layer of ["top", "bottom"] as const) {
    const tile = layer === "top" ? lowerCells[pos]?.top : lowerCells[pos]?.bottom;
    if (!tile) {
      continue;
    }
    const probeSupport = lookupLynxTileLifecyclePhase(tile.id, "probe-support");
    if (probeSupport === null) {
      continue;
    }
    const behaviorContext: LynxTileSupportBehaviorContext = {
      phase: "probe-support",
      tileId: tile.id,
      lowerCells,
      pos,
      z,
      currentZ,
      layer,
      support: context,
      subject,
      resolved: false,
      result: VERTICAL_SUPPORT_RESULT.unsupported,
    };
    probeSupport(behaviorContext);
    if (behaviorContext.resolved) {
      return behaviorContext.result;
    }
  }
  return null;
}
