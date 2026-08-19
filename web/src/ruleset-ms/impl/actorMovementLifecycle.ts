import type { EngineMapCell } from "@game-core/api/model";
import type { ActorArrivalOutcome } from "@game-core/api/actorInteractions";
import {
  actorFloorImpactBombDestroys,
  actorFloorImpactDestroysEnteringActor,
  actorFloorImpactHoldsDirection,
  actorFloorImpactTeleports,
} from "@game-core/impl/floorImpact";
import {
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_SOUND,
  MS_TILE,
  isMsCreature,
  msCreatureId,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import {
  msBlockedMoveFloorImpactAction,
  msHeldFloorImpactAction,
  msRuntimeActorFloorImpactAction,
  msTilePostEntryAction,
} from "@ruleset-ms/impl/floorImpactPolicy";
import { isMsTrapSpecialFloor } from "@ruleset-ms/impl/elements/tiles/specialFloorRegistration";

export interface MsMovementLifecycleCreature {
  serial?: number;
  id: number;
  dir: number;
  pos: number;
  z?: number;
  moving: number;
  released: boolean;
  turning: boolean;
  hidden: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
}

interface MsBlockedMoveLifecycleCreature {
  id: number;
  dir: number;
  pos: number;
}

export interface MsEnteredCellLifecycleContext<TCreature extends MsMovementLifecycleCreature> {
  pushTile(cells: EngineMapCell[], pos: number, tile: EngineMapCell["top"]): void;
  updateCreatureTile(cells: EngineMapCell[], creature: TCreature): void;
  findTeleportDestination(
    cells: EngineMapCell[],
    start: number,
    dir: number,
    occupiedOriginPos: number | undefined,
    creature: TCreature,
  ): number;
  recordTeleport?(creature: TCreature, beforePos: number, afterPos: number): void;
}

export interface MsFloorImpactLifecycleContext<TCreature extends MsMovementLifecycleCreature> {
  popTile(cells: EngineMapCell[], pos: number): void;
  clearCreatureFloorMovement(creature: TCreature): void;
  removeStatefulActor(creature: TCreature): void;
  recordActorDestroyed?(creature: TCreature, pos: number, floorId: number): void;
}

export interface MsCompletedStepLifecycleContext<TCreature extends MsMovementLifecycleCreature> {
  resolveButtonFloorEffects(cells: EngineMapCell[], pos: number, floor: number, creature: TCreature): number;
  isTrapOpen(cells: EngineMapCell[], trapPos: number, skipButtonPos: number, z: number): boolean;
  hasTrapConnection(pos: number, z: number): boolean;
  runtimeCellZ(cells: EngineMapCell[], pos: number): number;
  syncCreatureFloorMovement(cells: EngineMapCell[], creature: TCreature): void;
  recordMoveCompleted?(
    creature: TCreature,
    beforePos: number,
    afterPos: number,
    standingFloor: number,
    movementRole: "self" | "forced",
  ): void;
}

export function msActorHoldsDirectionOnFloor(floorId: number, actorId: number): boolean {
  return actorFloorImpactHoldsDirection(msHeldFloorImpactAction(floorId, actorId) ?? "none");
}

export function applyBlockedMsActorMoveStart<TCreature extends MsBlockedMoveLifecycleCreature>(
  context: {
    floorAt(pos: number): number;
    updateCreatureTile(creature: TCreature): void;
  },
  creature: TCreature,
  dir: number,
): void {
  const floor = context.floorAt(creature.pos);
  if (
    dir === MS_DIRECTION.none ||
    msActorHoldsDirectionOnFloor(floor, creature.id) ||
    msBlockedMoveFloorImpactAction(creature.id) !== null
  ) {
    return;
  }

  creature.dir = dir;
  context.updateCreatureTile(creature);
}

export function applyMsCreatureEnteredCell<TCreature extends MsMovementLifecycleCreature>(
  context: MsEnteredCellLifecycleContext<TCreature>,
  cells: EngineMapCell[],
  creature: TCreature,
  nextPos: number,
  dir: number,
  occupiedOriginPos: number | undefined,
  targetTop: number,
  targetTopState: number,
  targetBottom: number,
  targetBottomState: number,
  standingFloor: number,
  standingFloorState: number,
): number {
  if (!actorFloorImpactTeleports(msTilePostEntryAction(standingFloor) ?? "none") || (standingFloorState & MS_FLOOR_STATE.Broken) !== 0) {
    return nextPos;
  }

  const teleportedPos = context.findTeleportDestination(cells, nextPos, dir, occupiedOriginPos, creature);
  if (teleportedPos === nextPos) {
    return nextPos;
  }

  cells[nextPos]!.top = { id: targetTop, state: targetTopState };
  cells[nextPos]!.bottom = { id: targetBottom, state: targetBottomState };
  context.pushTile(cells, teleportedPos, { id: MS_TILE.Empty, state: 0 });
  cells[teleportedPos]!.top = {
    id: msCreatureTile(creature.id, dir),
    state: 0,
  };
  creature.pos = teleportedPos;
  if (creature.turning) {
    context.updateCreatureTile(cells, creature);
  }
  context.recordTeleport?.(creature, nextPos, teleportedPos);
  return teleportedPos;
}

function removeCreatureOnFloorImpact<TCreature extends MsMovementLifecycleCreature>(
  context: MsFloorImpactLifecycleContext<TCreature>,
  cells: EngineMapCell[],
  oldPos: number,
  oldWasCloneMachine: boolean,
  creature: TCreature,
  replacementTop: EngineMapCell["top"],
  replacementBottom: EngineMapCell["bottom"],
): void {
  const destroyedPos = creature.pos;
  const floorId = cells[destroyedPos]?.bottom.id ?? MS_TILE.Empty;
  context.recordActorDestroyed?.(creature, destroyedPos, floorId);
  cells[creature.pos]!.top = replacementTop;
  cells[creature.pos]!.bottom = replacementBottom;
  if (!oldWasCloneMachine) {
    context.popTile(cells, oldPos);
  } else {
    cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }
  creature.pos = oldPos;
  creature.hidden = true;
  context.clearCreatureFloorMovement(creature);
  context.removeStatefulActor(creature);
}

export function applyMsCreatureFloorImpact<TCreature extends MsMovementLifecycleCreature>(
  context: MsFloorImpactLifecycleContext<TCreature>,
  cells: EngineMapCell[],
  oldPos: number,
  oldWasCloneMachine: boolean,
  creature: TCreature,
  arrivalOutcome: ActorArrivalOutcome,
  targetTop: number,
  targetTopState: number,
  targetBottom: number,
  targetBottomState: number,
): { removed: boolean; soundEffects: number } {
  const floorImpactAction = msRuntimeActorFloorImpactAction(arrivalOutcome) ?? "none";
  if (actorFloorImpactDestroysEnteringActor(floorImpactAction) && !actorFloorImpactBombDestroys(floorImpactAction)) {
      removeCreatureOnFloorImpact(
        context,
        cells,
        oldPos,
        oldWasCloneMachine,
        creature,
        { id: targetTop, state: targetTopState },
        { id: targetBottom, state: targetBottomState },
      );
      return { removed: true, soundEffects: 0 };
  }

  if (actorFloorImpactBombDestroys(floorImpactAction)) {
      removeCreatureOnFloorImpact(
        context,
        cells,
        oldPos,
        oldWasCloneMachine,
        creature,
        { id: MS_TILE.Empty, state: 0 },
        { id: targetBottom, state: targetBottomState },
      );
      return { removed: true, soundEffects: 1 << MS_SOUND.BombExplodes };
  }

  return { removed: false, soundEffects: 0 };
}

export function applyMsCreatureCompletedStep<TCreature extends MsMovementLifecycleCreature>(
  context: MsCompletedStepLifecycleContext<TCreature>,
  cells: EngineMapCell[],
  oldPos: number,
  oldWasCloneMachine: boolean,
  creature: TCreature,
  nextPos: number,
  standingFloor: number,
  syncFloorMovement: boolean = true,
  causalMovementAfterPos: number = nextPos,
  recordMovement: boolean = true,
): number {
  let soundEffects = 0;
  const movementRole = creature.floorMovement === "none" ? "self" : "forced";
  const savedPos = creature.pos;
  creature.pos = oldPos;
  if (standingFloor === MS_TILE.Button_Red) {
    creature.moving = 1;
  }
  soundEffects |= context.resolveButtonFloorEffects(cells, nextPos, standingFloor, creature);
  creature.moving = 0;
  creature.pos = savedPos;
  if (isMsTrapSpecialFloor(standingFloor)) {
    creature.released = context.isTrapOpen(cells, nextPos, oldPos, creature.z ?? context.runtimeCellZ(cells, nextPos));
  } else if (isMsTrapSpecialFloor(cells[nextPos]!.bottom.id)) {
    creature.released = context.hasTrapConnection(nextPos, creature.z ?? context.runtimeCellZ(cells, nextPos));
  }
  if (oldWasCloneMachine) {
    cells[oldPos]!.bottom.state &= ~MS_FLOOR_STATE.Cloning;
  }
  if (syncFloorMovement) {
    context.syncCreatureFloorMovement(cells, creature);
  }
  if (recordMovement && oldPos !== nextPos) {
    context.recordMoveCompleted?.(
      creature,
      oldPos,
      causalMovementAfterPos,
      standingFloor,
      movementRole,
    );
  }
  return soundEffects;
}

export function applyMsCreatureCollisionAfterCompletedStep<TCreature extends MsMovementLifecycleCreature>(
  cells: EngineMapCell[],
  nextPos: number,
  setChipCollided: () => void,
): void {
  if (!isMsCreature(cells[nextPos]!.bottom.id)) {
    return;
  }

  const targetId = msCreatureId(cells[nextPos]!.bottom.id);
  if (targetId === MS_TILE.Chip || targetId === MS_TILE.Swimming_Chip) {
    setChipCollided();
  }
}
