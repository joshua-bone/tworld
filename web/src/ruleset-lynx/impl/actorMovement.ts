import type { EngineState } from "@game-core/api/model";
import type { ActorArrivalOutcome } from "@game-core/api/actorInteractions";
import {
  addTopTileFlags,
  promoteBottomTile,
  removeTopTileFlags,
  replaceTopTile,
  topTileIdOr,
} from "@game-core/impl/board";
import { advanceToCell } from "@game-core/impl/grid";
import { mapHash } from "@game-core/impl/hash";
import {
  blockedMovement,
  movedMovement,
  noArrival,
  removedOnArrival,
  resolvedArrival,
  type ArrivalResult,
  type MovementAttemptResult,
} from "@game-core/api/movementOutcomes";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import {
  lynxArrivalAnimationKind,
  lynxChipEnterAction,
  lynxTileForcedFloorKind,
} from "@ruleset-lynx/impl/catalog";
import { lynxActorArrivalOutcome } from "@ruleset-lynx/impl/actorInteractions";
import type { LynxMoveKind } from "@ruleset-lynx/impl/verticalMovement";
import { MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxActorMovementActor {
  id: number;
  pos: number;
  z?: number;
  dir: number;
  moving: number;
  frame: number;
  moveKind?: LynxMoveKind;
  ignoreIceFromAir?: boolean;
  hidden: boolean;
  pushed: boolean;
  deferPush: boolean;
  deferPushArmed: boolean;
  dormant: boolean;
}

export interface LynxActorMovementContext {
  state: EngineState;
  actors: LynxActorMovementActor[];
  soundBits: {
    trapEntered: number;
    waterSplash: number;
    bombExplodes: number;
    blockMoving: number;
  };
  activeLayerZ(): number;
  canExitTile(tileId: number, actorId: number, dir: number, releasing: boolean): boolean;
  chipActsWallForMobs(pos: number, z: number): boolean;
  clearAnimationAt(pos: number): void;
  canActorEnter(actor: LynxActorMovementActor, tileId: number, dir: number): boolean;
  arrivalOutcome(actor: LynxActorMovementActor, floorId: number): ActorArrivalOutcome;
  effectiveTargetTileId(tileId: number): number;
  turnBlockedIceDirection(dir: number, floorId: number): number;
  applyIceWallTurn(dir: number, floorId: number): number;
  resolveButtonEffects(pos: number, tileId: number): number;
  removeActor(actor: LynxActorMovementActor, animationTileId: number): void;
  animationTileId(kind: "water-splash" | "bomb-explosion" | "none"): number | null;
  waterSplashTileId: number;
  bombExplosionTileId: number;
  applyArrivalEffects(actor: LynxActorMovementActor): number;
}

function isLynxSlide(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "slide";
}

function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
}

function resolveLynxActorArrivalEffects(
  context: LynxActorMovementContext,
  pos: number,
  tileId: number,
): number {
  switch (lynxChipEnterAction(tileId)) {
    case "trap":
      return context.soundBits.trapEntered;
    case "button":
      return context.resolveButtonEffects(pos, tileId);
    default:
      return 0;
  }
}

export function canLynxActorStartMovement(
  context: LynxActorMovementContext,
  actor: LynxActorMovementActor,
  dir: number,
  releasing = false,
  clearAnimations = false,
): boolean {
  const floorFrom = topTileIdOr(context.state.map.cells, actor.pos, MS_TILE.Empty);
  if (!context.canExitTile(floorFrom, actor.id, dir, releasing)) {
    return false;
  }

  const targetStep = advanceToCell(context.state.map.cells, actor.pos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep) {
    return false;
  }

  const { pos: targetPos, cell: target } = targetStep;
  if (context.chipActsWallForMobs(targetPos, actor.z ?? context.activeLayerZ())) {
    return false;
  }

  if (
    (target.top.state & LYNX_CELL_FLAG.Claimed) !== 0 ||
    !context.canActorEnter(actor, context.effectiveTargetTileId(target.top.id), dir)
  ) {
    return false;
  }

  if (clearAnimations && (target.top.state & LYNX_CELL_FLAG.Animated) !== 0) {
    context.clearAnimationAt(targetPos);
  }

  return true;
}

export function startLynxActorMovement(
  context: LynxActorMovementContext,
  actor: LynxActorMovementActor,
  dir: number,
  releasing = false,
): MovementAttemptResult {
  actor.dir = dir;
  const floorFrom = topTileIdOr(context.state.map.cells, actor.pos, MS_TILE.Empty);
  const targetStep = advanceToCell(context.state.map.cells, actor.pos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep || !canLynxActorStartMovement(context, actor, dir, releasing, true)) {
    if (isLynxIce(floorFrom)) {
      actor.dir = context.turnBlockedIceDirection(dir, floorFrom);
    }
    return blockedMovement();
  }

  const { pos: targetPos, cell: target } = targetStep;
  if ((target.top.state & LYNX_CELL_FLAG.Animated) !== 0) {
    context.clearAnimationAt(targetPos);
  }

  if (actor.id === MS_TILE.Block) {
    actor.dormant = false;
  }

  removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
  actor.pos = targetPos;
  actor.moving = 8;
  actor.frame = 4;
  actor.moveKind = "planar";
  actor.ignoreIceFromAir = false;
  addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
  if (actor.pushed) {
    context.state.soundEffects |= context.soundBits.blockMoving;
  }
  return movedMovement();
}

export function finishLynxActorMovement(
  context: LynxActorMovementContext,
  actor: LynxActorMovementActor,
): ArrivalResult {
  const cell = context.state.map.cells[actor.pos];
  if (!cell) {
    return noArrival();
  }

  const moveKind = actor.moveKind ?? "planar";
  actor.moveKind = "planar";
  actor.ignoreIceFromAir = false;
  if (isLynxIce(cell.top.id) && moveKind !== "air" && moveKind !== "elevator") {
    actor.dir = context.applyIceWallTurn(actor.dir, cell.top.id);
  } else if (isLynxIce(cell.top.id) && (moveKind === "air" || moveKind === "elevator")) {
    actor.ignoreIceFromAir = true;
  }

  const arrivalAction = context.arrivalOutcome(actor, cell.top.id);
  const arrivalAnimationTileId = context.animationTileId(lynxArrivalAnimationKind(cell.top.id, actor.id));

  if (actor.id === MS_TILE.Block) {
    if (arrivalAction === "block-water") {
      replaceTopTile(context.state.map.cells, actor.pos, { ...cell.top, id: MS_TILE.Dirt });
      removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      context.removeActor(actor, arrivalAnimationTileId ?? context.waterSplashTileId);
      context.state.soundEffects |= context.soundBits.waterSplash;
      context.state.map.hash = mapHash(context.state.map.cells);
      return removedOnArrival(context.soundBits.waterSplash);
    }
    if (arrivalAction === "block-bomb") {
      promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
      removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      context.removeActor(actor, arrivalAnimationTileId ?? context.bombExplosionTileId);
      context.state.soundEffects |= context.soundBits.bombExplodes;
      context.state.map.hash = mapHash(context.state.map.cells);
      return removedOnArrival(context.soundBits.bombExplodes);
    }
    if (arrivalAction === "clear-key-blue") {
      promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
      addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    }

    actor.deferPush = false;
    actor.deferPushArmed = false;
    const soundEffects = resolveLynxActorArrivalEffects(context, actor.pos, cell.top.id) | context.applyArrivalEffects(actor);
    context.state.soundEffects |= soundEffects;
    context.state.map.hash = mapHash(context.state.map.cells);
    return soundEffects === 0 ? noArrival() : resolvedArrival(soundEffects);
  }

  if (arrivalAction === "creature-water" || arrivalAction === "creature-fire") {
    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.removeActor(actor, arrivalAnimationTileId ?? context.waterSplashTileId);
    const soundEffects = arrivalAction === "creature-water" ? context.soundBits.waterSplash : 0;
    context.state.soundEffects |= soundEffects;
    context.state.map.hash = mapHash(context.state.map.cells);
    return removedOnArrival(soundEffects);
  }

  if (arrivalAction === "creature-bomb") {
    promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.removeActor(actor, arrivalAnimationTileId ?? context.bombExplosionTileId);
    context.state.soundEffects |= context.soundBits.bombExplodes;
    context.state.map.hash = mapHash(context.state.map.cells);
    return removedOnArrival(context.soundBits.bombExplodes);
  }

  if (arrivalAction === "clear-key-blue") {
    promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
    addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.state.map.hash = mapHash(context.state.map.cells);
  }

  const soundEffects = resolveLynxActorArrivalEffects(context, actor.pos, cell.top.id) | context.applyArrivalEffects(actor);
  context.state.soundEffects |= soundEffects;
  return soundEffects === 0 ? noArrival() : resolvedArrival(soundEffects);
}
