import type { EngineState } from "@game-core/api/model";
import type { ActorMovementStrategyId } from "@game-core/api/actorCapabilities";
import type { ArrivalResult, MovementAttemptResult } from "@game-core/api/movementOutcomes";
import { reverseDirection as backDirection } from "@game-core/impl/grid";
import {
  canLynxActorStartMovement as canLynxActorStartMovementWithContext,
  finishLynxActorMovement as finishLynxActorMovementWithContext,
  startLynxActorMovement as startLynxActorMovementWithContext,
  type LynxActorMovementActor,
  type LynxActorMovementContext,
} from "@ruleset-lynx/impl/actorMovement";
import { lynxTileForcedFloorKind } from "@ruleset-lynx/impl/catalog";

type LynxRuntimeActorMovementStrategyId = Exclude<ActorMovementStrategyId, "chip-like">;

export interface LynxChipMovementStrategyContext {
  hasSlideBoot(): boolean;
  hasIceBoot(): boolean;
  applyIceWallTurn(dir: number, floorId: number): number;
}

interface LynxChipMovementStrategy {
  applyStartMoveState(
    context: LynxChipMovementStrategyContext,
    floorId: number,
    chosenInputCode: number,
    chipIgnoreIceFromAir: boolean,
    chipSlideToken: boolean,
  ): { chipIgnoreIceFromAir: boolean; chipSlideToken: boolean };
  blockedMoveDirection(
    context: LynxChipMovementStrategyContext,
    floorId: number,
    attemptedDir: number,
  ): number;
}

interface LynxActorMovementStrategy {
  canStartMove(
    context: LynxActorMovementContext,
    actor: LynxActorMovementActor,
    dir: number,
    releasing?: boolean,
    clearAnimations?: boolean,
  ): boolean;
  startMove(
    context: LynxActorMovementContext,
    actor: LynxActorMovementActor,
    dir: number,
    releasing?: boolean,
  ): MovementAttemptResult;
  finishMove(context: LynxActorMovementContext, actor: LynxActorMovementActor): ArrivalResult;
  forcedMoveDirection(
    slideDirection: (floorId: number) => number,
    actor: LynxActorMovementActor,
    floorId: number,
    currentTime: number,
  ): number;
}

function isLynxSlide(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "slide";
}

function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
}

const LYNX_CHIP_MOVEMENT_STRATEGIES: Record<"chip-like", LynxChipMovementStrategy> = {
  "chip-like": {
    applyStartMoveState(context, floorId, chosenInputCode, chipIgnoreIceFromAir, chipSlideToken) {
      if (!isLynxIce(floorId) || chosenInputCode !== 0) {
        chipIgnoreIceFromAir = false;
      }

      if (!context.hasSlideBoot()) {
        if (isLynxSlide(floorId) && chosenInputCode === 0) {
          chipSlideToken = true;
        } else if (!isLynxIce(floorId) || context.hasIceBoot()) {
          chipSlideToken = false;
        }
      }

      return {
        chipIgnoreIceFromAir,
        chipSlideToken,
      };
    },
    blockedMoveDirection(context, floorId, attemptedDir) {
      if (!isLynxIce(floorId) || context.hasIceBoot()) {
        return attemptedDir;
      }
      return context.applyIceWallTurn(backDirection(attemptedDir), floorId);
    },
  },
};

const DEFAULT_LYNX_ACTOR_MOVEMENT_STRATEGY: LynxActorMovementStrategy = {
  canStartMove(context, actor, dir, releasing = false, clearAnimations = false) {
    return canLynxActorStartMovementWithContext(context, actor, dir, releasing, clearAnimations);
  },
  startMove(context, actor, dir, releasing = false) {
    return startLynxActorMovementWithContext(context, actor, dir, releasing);
  },
  finishMove(context, actor) {
    return finishLynxActorMovementWithContext(context, actor);
  },
  forcedMoveDirection(slideDirection, actor, floorId, currentTime) {
    if (currentTime === 0 && lynxTileForcedFloorKind(floorId) !== "air") {
      return 0;
    }
    if (isLynxSlide(floorId)) {
      return slideDirection(floorId);
    }
    if (isLynxIce(floorId)) {
      if (actor.ignoreIceFromAir) {
        return 0;
      }
      return actor.dir;
    }
    return 0;
  },
};

const LYNX_ACTOR_MOVEMENT_STRATEGIES: Record<LynxRuntimeActorMovementStrategyId, LynxActorMovementStrategy> = {
  "creature-like": DEFAULT_LYNX_ACTOR_MOVEMENT_STRATEGY,
  "block-like": DEFAULT_LYNX_ACTOR_MOVEMENT_STRATEGY,
};

function lynxChipMovementStrategy(strategyId: ActorMovementStrategyId): LynxChipMovementStrategy {
  return LYNX_CHIP_MOVEMENT_STRATEGIES[strategyId === "chip-like" ? strategyId : "chip-like"];
}

function lynxActorMovementStrategy(strategyId: ActorMovementStrategyId): LynxActorMovementStrategy {
  switch (strategyId) {
    case "block-like":
    case "creature-like":
      return LYNX_ACTOR_MOVEMENT_STRATEGIES[strategyId];
    default:
      return DEFAULT_LYNX_ACTOR_MOVEMENT_STRATEGY;
  }
}

export function applyLynxChipStartMoveStateByStrategy(
  strategyId: ActorMovementStrategyId,
  context: LynxChipMovementStrategyContext,
  floorId: number,
  chosenInputCode: number,
  chipIgnoreIceFromAir: boolean,
  chipSlideToken: boolean,
): { chipIgnoreIceFromAir: boolean; chipSlideToken: boolean } {
  return lynxChipMovementStrategy(strategyId).applyStartMoveState(
    context,
    floorId,
    chosenInputCode,
    chipIgnoreIceFromAir,
    chipSlideToken,
  );
}

export function blockedLynxChipMoveDirectionByStrategy(
  strategyId: ActorMovementStrategyId,
  context: LynxChipMovementStrategyContext,
  floorId: number,
  attemptedDir: number,
): number {
  return lynxChipMovementStrategy(strategyId).blockedMoveDirection(context, floorId, attemptedDir);
}

export function canStartLynxActorMoveByStrategy(
  strategyId: ActorMovementStrategyId,
  context: LynxActorMovementContext,
  actor: LynxActorMovementActor,
  dir: number,
  releasing = false,
  clearAnimations = false,
): boolean {
  return lynxActorMovementStrategy(strategyId).canStartMove(context, actor, dir, releasing, clearAnimations);
}

export function startLynxActorMoveByStrategy(
  strategyId: ActorMovementStrategyId,
  context: LynxActorMovementContext,
  actor: LynxActorMovementActor,
  dir: number,
  releasing = false,
): MovementAttemptResult {
  return lynxActorMovementStrategy(strategyId).startMove(context, actor, dir, releasing);
}

export function finishLynxActorMoveByStrategy(
  strategyId: ActorMovementStrategyId,
  context: LynxActorMovementContext,
  actor: LynxActorMovementActor,
): ArrivalResult {
  return lynxActorMovementStrategy(strategyId).finishMove(context, actor);
}

export function forcedLynxActorDirectionByStrategy(
  strategyId: ActorMovementStrategyId,
  slideDirection: (floorId: number) => number,
  actor: LynxActorMovementActor,
  floorId: number,
  currentTime: number,
): number {
  return lynxActorMovementStrategy(strategyId).forcedMoveDirection(slideDirection, actor, floorId, currentTime);
}
