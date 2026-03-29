import type { EngineState } from "@game-core/api/model";
import type { ActorArrivalOutcome, ActorCollisionOutcome } from "@game-core/api/actorInteractions";
import { actorFallingCollisionFailsChip } from "@game-core/api/actorSpecialFloorHooks";
import {
  addTopTileFlags,
  removeTopTileFlags,
  topTileIdOr,
} from "@game-core/impl/board";
import { advanceToCell } from "@game-core/impl/grid";
import {
  blockedMovement,
  movedMovement,
  removedOnArrival,
  resolvedArrival,
  type ArrivalResult,
  type MovementAttemptResult,
} from "@game-core/api/movementOutcomes";
import type { OccupancyTarget } from "@game-core/impl/occupancy";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { lynxActorSupportFamilyHooks, lynxTileForcedFloorKind } from "@ruleset-lynx/impl/catalog";
import type { LynxMoveKind } from "@ruleset-lynx/impl/verticalMovement";
import {
  applyLynxActorCompletedStep,
  applyLynxActorEnteredCell,
  applyLynxActorFloorImpact,
  applyLynxBlockedActorMoveStart,
} from "@ruleset-lynx/impl/actorMovementLifecycle";
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
  queryTargetOccupancy(pos: number, z: number): OccupancyTarget<LynxActorMovementActor>;
  interactionOutcome(actor: LynxActorMovementActor, target: OccupancyTarget<LynxActorMovementActor>): ActorCollisionOutcome;
  clearAnimationAt(pos: number): void;
  canActorEnter(actor: LynxActorMovementActor, tileId: number, dir: number): boolean;
  arrivalOutcome(actor: LynxActorMovementActor, floorId: number): ActorArrivalOutcome;
  effectiveTargetTileId(tileId: number): number;
  turnBlockedIceDirection(dir: number, floorId: number): number;
  shouldTurnBlockedIce(actor: LynxActorMovementActor, floorId: number): boolean;
  applyIceWallTurn(dir: number, floorId: number): number;
  resolveButtonEffects(pos: number, tileId: number): number;
  removeActor(actor: LynxActorMovementActor, animationTileId: number): void;
  animationTileId(kind: "water-splash" | "bomb-explosion" | "none"): number | null;
  waterSplashTileId: number;
  bombExplosionTileId: number;
  applyArrivalEffects(actor: LynxActorMovementActor): number;
  isChipAt(pos: number, z: number): boolean;
  recordFallingChipCollision(actor: LynxActorMovementActor): void;
}

function isLynxSlide(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "slide";
}

function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
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

  const targetOccupancy = context.queryTargetOccupancy(targetPos, actor.z ?? context.activeLayerZ());
  const interaction = context.interactionOutcome(actor, targetOccupancy);
  if (
    interaction.denyMove ||
    targetOccupancy.claimed ||
    !context.canActorEnter(actor, context.effectiveTargetTileId(target.top.id), dir)
  ) {
    return false;
  }

  if (clearAnimations && targetOccupancy.kind === "blocked-visual") {
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
    applyLynxBlockedActorMoveStart(context, actor, dir, floorFrom);
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
  const moveKind = actor.moveKind ?? "planar";
  const actorZ = actor.z ?? context.activeLayerZ();
  const cell = context.state.map.cells[actor.pos];
  if (!cell) {
    return applyLynxActorCompletedStep(context, actor, MS_TILE.Empty);
  }

  applyLynxActorEnteredCell(context, actor, cell.top.id);
  const floorImpact = applyLynxActorFloorImpact(context, actor, cell.top.id);
  if (floorImpact.removed) {
    return removedOnArrival(floorImpact.soundEffects);
  }

  if (
    moveKind === "air" &&
    actorFallingCollisionFailsChip(lynxActorSupportFamilyHooks(actor.id)) &&
    context.isChipAt(actor.pos, actorZ)
  ) {
    context.recordFallingChipCollision(actor);
  }

  const completedStep = applyLynxActorCompletedStep(context, actor, cell.top.id);
  return floorImpact.soundEffects !== 0 && completedStep.status === "none"
    ? resolvedArrival(floorImpact.soundEffects)
    : completedStep;
}
