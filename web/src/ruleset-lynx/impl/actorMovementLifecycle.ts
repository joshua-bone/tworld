import { mapHash } from "@game-core/impl/hash";
import {
  actorFloorImpactBombDestroys,
  actorFloorImpactDestroysEnteringActor,
  actorFloorImpactHoldsDirection,
  actorFloorImpactTransformClearsFloor,
  actorFloorImpactTransformTurnsToDirt,
  actorFloorImpactTransformsFloor,
} from "@game-core/impl/floorImpact";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { ArrivalResult } from "@game-core/api/movementOutcomes";
import { noArrival, removedOnArrival, resolvedArrival } from "@game-core/api/movementOutcomes";
import { addTopTileFlags, promoteBottomTile, removeTopTileFlags, replaceTopTile } from "@game-core/impl/board";
import { lynxArrivalAnimationKind } from "@ruleset-lynx/impl/catalog";
import type { LynxActorMovementActor, LynxActorMovementContext } from "@ruleset-lynx/impl/actorMovement";
import { isLynxIceForcedFloor } from "@ruleset-lynx/impl/elements/tiles/families/forcedFloor";
import {
  lynxBlockedMoveFloorImpactAction,
  lynxHeldFloorImpactAction,
  lynxRuntimeActorFloorImpactAction,
} from "@ruleset-lynx/impl/floorImpactPolicy";

export function lynxActorHoldsDirectionOnFloor(floorId: number, actorId: number): boolean {
  return actorFloorImpactHoldsDirection(lynxHeldFloorImpactAction(floorId, actorId) ?? "none");
}

export function applyLynxBlockedActorMoveStart(
  context: Pick<LynxActorMovementContext, "turnBlockedIceDirection" | "shouldTurnBlockedIce">,
  actor: LynxActorMovementActor,
  attemptedDir: number,
  floorId: number,
): void {
  if (isLynxIceForcedFloor(floorId) && context.shouldTurnBlockedIce(actor, floorId)) {
    actor.dir = context.turnBlockedIceDirection(attemptedDir, floorId);
  }
}

export function applyLynxActorEnteredCell(
  context: Pick<LynxActorMovementContext, "applyIceWallTurn">,
  actor: LynxActorMovementActor,
  floorId: number,
): void {
  const moveKind = actor.moveKind ?? "planar";
  actor.moveKind = "planar";
  actor.ignoreIceFromAir = false;
  if (isLynxIceForcedFloor(floorId) && moveKind !== "air" && moveKind !== "elevator") {
    actor.dir = context.applyIceWallTurn(actor.dir, floorId);
  } else if (isLynxIceForcedFloor(floorId) && (moveKind === "air" || moveKind === "elevator")) {
    actor.ignoreIceFromAir = true;
  }
}

function resolveLynxActorArrivalEffects(
  context: Pick<LynxActorMovementContext, "soundBits" | "resolveButtonEffects" | "arrivalOutcome">,
  actor: LynxActorMovementActor,
  pos: number,
  tileId: number,
): number {
  switch (lynxRuntimeActorFloorImpactAction(context.arrivalOutcome(actor, tileId))) {
    case "trap":
      return context.soundBits.trapEntered;
    case "button":
      return context.resolveButtonEffects(pos, tileId);
    default:
      return 0;
  }
}

export function applyLynxActorFloorImpact(
  context: Pick<
    LynxActorMovementContext,
    | "state"
    | "arrivalOutcome"
    | "removeActor"
    | "animationTileId"
    | "waterSplashTileId"
    | "bombExplosionTileId"
    | "soundBits"
  >,
  actor: LynxActorMovementActor,
  floorId: number,
): { removed: boolean; soundEffects: number; hashChanged: boolean } {
  const cell = context.state.map.cells[actor.pos];
  if (!cell) {
    return { removed: false, soundEffects: 0, hashChanged: false };
  }

  const arrivalAction = context.arrivalOutcome(actor, floorId);
  const floorImpactAction = lynxRuntimeActorFloorImpactAction(arrivalAction) ?? "none";
  const arrivalAnimationTileId = context.animationTileId(lynxArrivalAnimationKind(floorId, actor.id));

  if (arrivalAction === "clear-key-blue") {
    promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
    addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.state.map.hash = mapHash(context.state.map.cells);
    return { removed: false, soundEffects: 0, hashChanged: true };
  }

  if (actorFloorImpactTransformsFloor(floorImpactAction)) {
    replaceTopTile(context.state.map.cells, actor.pos, {
      ...cell.top,
      id: actorFloorImpactTransformTurnsToDirt(floorImpactAction) ? MS_TILE.Dirt : MS_TILE.Empty,
    });
    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.removeActor(
      actor,
      actorFloorImpactTransformClearsFloor(floorImpactAction)
        ? arrivalAnimationTileId ?? context.bombExplosionTileId
        : arrivalAnimationTileId ?? context.waterSplashTileId,
    );
    const soundEffects = actorFloorImpactTransformClearsFloor(floorImpactAction)
      ? context.soundBits.bombExplodes
      : context.soundBits.waterSplash;
    context.state.soundEffects |= soundEffects;
    context.state.map.hash = mapHash(context.state.map.cells);
    return { removed: true, soundEffects, hashChanged: true };
  }

  if (actorFloorImpactDestroysEnteringActor(floorImpactAction) && !actorFloorImpactBombDestroys(floorImpactAction)) {
    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.removeActor(actor, arrivalAnimationTileId ?? context.waterSplashTileId);
    const soundEffects = floorImpactAction === "destroy-water" ? context.soundBits.waterSplash : 0;
    context.state.soundEffects |= soundEffects;
    context.state.map.hash = mapHash(context.state.map.cells);
    return { removed: true, soundEffects, hashChanged: true };
  }

  if (actorFloorImpactBombDestroys(floorImpactAction)) {
    promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.removeActor(actor, arrivalAnimationTileId ?? context.bombExplosionTileId);
    context.state.soundEffects |= context.soundBits.bombExplodes;
    context.state.map.hash = mapHash(context.state.map.cells);
    return { removed: true, soundEffects: context.soundBits.bombExplodes, hashChanged: true };
  }

  return { removed: false, soundEffects: 0, hashChanged: false };
}

export function applyLynxActorCompletedStep(
  context: Pick<LynxActorMovementContext, "state" | "soundBits" | "resolveButtonEffects" | "applyArrivalEffects" | "arrivalOutcome">,
  actor: LynxActorMovementActor,
  floorId: number,
): ArrivalResult {
  if (actor.id === MS_TILE.Block) {
    actor.deferPush = false;
    actor.deferPushArmed = false;
  }

  const soundEffects = resolveLynxActorArrivalEffects(context, actor, actor.pos, floorId) | context.applyArrivalEffects(actor);
  context.state.soundEffects |= soundEffects;
  return soundEffects === 0 ? noArrival() : resolvedArrival(soundEffects);
}
