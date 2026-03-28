import { mapHash } from "@game-core/impl/hash";
import { lynxActorBlockedMoveKind } from "@ruleset-lynx/impl/catalog";
import { lynxActorHeldFloorOutcome } from "@ruleset-lynx/impl/actorInteractions";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { ArrivalResult } from "@game-core/api/movementOutcomes";
import { noArrival, removedOnArrival, resolvedArrival } from "@game-core/api/movementOutcomes";
import { addTopTileFlags, promoteBottomTile, removeTopTileFlags, replaceTopTile } from "@game-core/impl/board";
import { lynxArrivalAnimationKind, lynxChipEnterAction, lynxTileForcedFloorKind } from "@ruleset-lynx/impl/catalog";
import type { LynxActorMovementActor, LynxActorMovementContext } from "@ruleset-lynx/impl/actorMovement";

function isLynxSlide(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "slide";
}

function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
}

export function lynxActorHoldsDirectionOnFloor(floorId: number, actorId: number): boolean {
  return lynxActorHeldFloorOutcome(floorId, actorId) === "hold-direction";
}

export function applyLynxBlockedActorMoveStart(
  context: Pick<LynxActorMovementContext, "turnBlockedIceDirection">,
  actor: LynxActorMovementActor,
  attemptedDir: number,
  floorId: number,
): void {
  if (isLynxIce(floorId) && lynxActorBlockedMoveKind(actor.id) === "stay") {
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
  if (isLynxIce(floorId) && moveKind !== "air" && moveKind !== "elevator") {
    actor.dir = context.applyIceWallTurn(actor.dir, floorId);
  } else if (isLynxIce(floorId) && (moveKind === "air" || moveKind === "elevator")) {
    actor.ignoreIceFromAir = true;
  }
}

function resolveLynxActorArrivalEffects(
  context: Pick<LynxActorMovementContext, "soundBits" | "resolveButtonEffects">,
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
  const arrivalAnimationTileId = context.animationTileId(lynxArrivalAnimationKind(floorId, actor.id));

  if (actor.id === MS_TILE.Block) {
    if (arrivalAction === "block-water") {
      replaceTopTile(context.state.map.cells, actor.pos, { ...cell.top, id: MS_TILE.Dirt });
      removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      context.removeActor(actor, arrivalAnimationTileId ?? context.waterSplashTileId);
      context.state.soundEffects |= context.soundBits.waterSplash;
      context.state.map.hash = mapHash(context.state.map.cells);
      return { removed: true, soundEffects: context.soundBits.waterSplash, hashChanged: true };
    }
    if (arrivalAction === "block-bomb") {
      promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
      removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      context.removeActor(actor, arrivalAnimationTileId ?? context.bombExplosionTileId);
      context.state.soundEffects |= context.soundBits.bombExplodes;
      context.state.map.hash = mapHash(context.state.map.cells);
      return { removed: true, soundEffects: context.soundBits.bombExplodes, hashChanged: true };
    }
    if (arrivalAction === "clear-key-blue") {
      promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
      addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
      return { removed: false, soundEffects: 0, hashChanged: true };
    }

    return { removed: false, soundEffects: 0, hashChanged: false };
  }

  if (arrivalAction === "creature-water" || arrivalAction === "creature-fire") {
    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.removeActor(actor, arrivalAnimationTileId ?? context.waterSplashTileId);
    const soundEffects = arrivalAction === "creature-water" ? context.soundBits.waterSplash : 0;
    context.state.soundEffects |= soundEffects;
    context.state.map.hash = mapHash(context.state.map.cells);
    return { removed: true, soundEffects, hashChanged: true };
  }

  if (arrivalAction === "creature-bomb") {
    promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
    removeTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.removeActor(actor, arrivalAnimationTileId ?? context.bombExplosionTileId);
    context.state.soundEffects |= context.soundBits.bombExplodes;
    context.state.map.hash = mapHash(context.state.map.cells);
    return { removed: true, soundEffects: context.soundBits.bombExplodes, hashChanged: true };
  }

  if (arrivalAction === "clear-key-blue") {
    promoteBottomTile(context.state.map.cells, actor.pos, MS_TILE.Empty);
    addTopTileFlags(context.state.map.cells, actor.pos, LYNX_CELL_FLAG.Claimed);
    context.state.map.hash = mapHash(context.state.map.cells);
    return { removed: false, soundEffects: 0, hashChanged: true };
  }

  return { removed: false, soundEffects: 0, hashChanged: false };
}

export function applyLynxActorCompletedStep(
  context: Pick<LynxActorMovementContext, "state" | "soundBits" | "resolveButtonEffects" | "applyArrivalEffects">,
  actor: LynxActorMovementActor,
  floorId: number,
): ArrivalResult {
  if (actor.id === MS_TILE.Block) {
    actor.deferPush = false;
    actor.deferPushArmed = false;
  }

  const soundEffects = resolveLynxActorArrivalEffects(context, actor.pos, floorId) | context.applyArrivalEffects(actor);
  context.state.soundEffects |= soundEffects;
  return soundEffects === 0 ? noArrival() : resolvedArrival(soundEffects);
}
