import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport, type ActorAirHook } from "@game-core/api/actorCapabilities";
import { lookupTileBehaviorPhase } from "@game-core/api/ruleset";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult } from "@game-core/api/verticalMovement";
import { replaceBottomTile, replaceTopTile } from "@game-core/impl/board";
import {
  msButtonAction,
  msIsOverlayFloorTile,
  msRulesetCatalog,
} from "@ruleset-ms/impl/catalog";
import {
  type MsTileLeaveBehaviorContext,
} from "@ruleset-ms/impl/elements/tiles/families/leave";
import {
  type MsTileSupportBehaviorContext,
  type MsTileSupportContext,
  type MsTileSupportSubject,
} from "@ruleset-ms/impl/elements/tiles/families/support";
import { msBlockedEnterEffect } from "@ruleset-ms/impl/floorImpactPolicy";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";

export interface MsTileActivationContext<TCreature> {
  turnTanks(inMidMove?: TCreature | null): void;
  toggleWalls(): void;
  activateCloner(buttonPos: number, buttonZ: number): void;
  springTrap(buttonPos: number, buttonZ: number): void;
  buttonPushedSound: number;
}

function applyMsMobExitTileAction(
  cells: EngineMapCell[],
  pos: number,
  layer: "top" | "bottom",
): boolean {
  const cell = cells[pos];
  if (!cell) {
    return false;
  }

  const tile = layer === "top" ? cell.top : cell.bottom;
  const tileBehavior = msRulesetCatalog.getTileBehavior(tile.id);
  if (!tileBehavior) {
    return false;
  }
  const afterLeave = lookupTileBehaviorPhase(tileBehavior, "complete-exit");
  if (afterLeave === null) {
    return false;
  }
  const context: MsTileLeaveBehaviorContext = {
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

export function applyMsMobExitFloorEffect(cells: EngineMapCell[], pos: number): boolean {
  return applyMsMobExitTileAction(cells, pos, "top") || applyMsMobExitTileAction(cells, pos, "bottom");
}

export function isMsBlockedChipEnterRevealTile(tileId: number): boolean {
  return msBlockedEnterEffect(tileId) === "reveal-wall";
}

function msBlockedChipEnterRevealLayer(
  cell: EngineMapCell | undefined,
): "top" | "bottom" | null {
  if (!cell) {
    return null;
  }
  if (isMsBlockedChipEnterRevealTile(cell.top.id)) {
    return "top";
  }
  if (msIsOverlayFloorTile(cell.top.id) && isMsBlockedChipEnterRevealTile(cell.bottom.id)) {
    return "bottom";
  }
  return null;
}

export function applyMsBlockedChipEnterEffect(
  cells: EngineMapCell[],
  pos: number,
  exposeWalls: boolean,
): boolean {
  const cell = cells[pos];
  const revealLayer = msBlockedChipEnterRevealLayer(cell);
  if (!cell || revealLayer === null) {
    return false;
  }
  if (exposeWalls) {
    if (revealLayer === "top") {
      replaceTopTile(cells, pos, { ...cell.top, id: MS_TILE.Wall });
    } else {
      replaceBottomTile(cells, pos, { ...cell.bottom, id: MS_TILE.Wall });
    }
  }
  return true;
}

export function hasMsTileActivation(tileId: number): boolean {
  return msButtonAction(tileId) !== "none";
}

export function deferredMsTileActivationSound(tileId: number, buttonPushedSound: number): number {
  return msButtonAction(tileId) === "toggle-walls" ? 0 : buttonPushedSound;
}

export function applyMsTileActivationEffect<TCreature>(
  context: MsTileActivationContext<TCreature>,
  buttonPos: number,
  tileId: number,
  buttonZ: number,
  inMidMove: TCreature | null = null,
): number {
  switch (msButtonAction(tileId)) {
    case "turn-tanks":
      context.turnTanks(inMidMove);
      return context.buttonPushedSound;
    case "toggle-walls":
      context.toggleWalls();
      return 0;
    case "activate-cloner":
      context.activateCloner(buttonPos, buttonZ);
      return context.buttonPushedSound;
    case "spring-trap":
      context.springTrap(buttonPos, buttonZ);
      return context.buttonPushedSound;
    default:
      return 0;
  }
}

export function resolveMsTileSupportBelow(
  context: MsTileSupportContext,
  lowerCells: EngineMapCell[] | null,
  pos: number,
  currentZ: number,
  cellZ: number,
  subject: MsTileSupportSubject,
): VerticalSupportResult {
  if (!lowerCells) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const cell = lowerCells[pos];
  if (!cell) {
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  const topId = cell.top.id;
  const bottomId = cell.bottom.id;
  const topActorId = topId === MS_TILE.Block_Static ? MS_TILE.Block : isMsCreature(topId) ? msCreatureId(topId) : null;

  if (actorUsesChipSupport(subject.airHook)) {
    if (topActorId === MS_TILE.Block) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }
    const resolvedByTile = resolveMsTileSupportByBehavior(context, lowerCells, pos, currentZ, cellZ, subject);
    if (resolvedByTile) {
      return resolvedByTile;
    }
    if (topActorId !== null) {
      return VERTICAL_SUPPORT_RESULT.unsupported;
    }
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }
  const resolvedByTile = resolveMsTileSupportByBehavior(context, lowerCells, pos, currentZ, cellZ, subject);
  if (resolvedByTile) {
    return resolvedByTile;
  }

  if (topActorId !== null) {
    const supported =
      context.chipActsWallForMobs(pos, cellZ) ||
      (topActorId !== MS_TILE.Chip && topActorId !== MS_TILE.Swimming_Chip);
    if (supported) {
      context.addTileOverlay(currentZ, pos, "support");
      return VERTICAL_SUPPORT_RESULT.supported;
    }
    return VERTICAL_SUPPORT_RESULT.unsupported;
  }

  return VERTICAL_SUPPORT_RESULT.unsupported;
}

function resolveMsTileSupportByBehavior(
  context: MsTileSupportContext,
  lowerCells: EngineMapCell[],
  pos: number,
  currentZ: number,
  cellZ: number,
  subject: MsTileSupportSubject,
): VerticalSupportResult | null {
  for (const layer of ["top", "bottom"] as const) {
    const tile = layer === "top" ? lowerCells[pos]?.top : lowerCells[pos]?.bottom;
    if (!tile) {
      continue;
    }
    const tileBehavior = msRulesetCatalog.getTileBehavior(tile.id);
    if (!tileBehavior) {
      continue;
    }
    const probeSupport = lookupTileBehaviorPhase(tileBehavior, "probe-support");
    if (probeSupport === null) {
      continue;
    }
    const behaviorContext: MsTileSupportBehaviorContext = {
      phase: "probe-support",
      tileId: tile.id,
      lowerCells,
      pos,
      currentZ,
      cellZ,
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
