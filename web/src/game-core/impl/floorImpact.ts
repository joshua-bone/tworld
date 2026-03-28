import {
  completedArrival,
  noArrival,
  resolvedArrival,
  type ArrivalResult,
} from "@game-core/api/movementOutcomes";

export type ActorFloorImpactAction =
  | "none"
  | "clear-floor"
  | "collect-chip"
  | "collect-item"
  | "open-door"
  | "open-socket"
  | "steal-boots-tools"
  | "popup-wall"
  | "button"
  | "trap"
  | "exit"
  | "destroy-water"
  | "destroy-fire"
  | "destroy-bomb"
  | "transform-to-dirt"
  | "transform-to-empty"
  | "hold-direction"
  | "teleport"
  | "revert-portable";

export interface ActorFloorImpactCollectionResolution {
  collected: boolean;
  collectedChip: boolean;
}

export interface ActorFloorImpactContext<
  TCollection extends ActorFloorImpactCollectionResolution = ActorFloorImpactCollectionResolution,
> {
  clearFloor?(): void;
  consumeEnteredOverlay?(): void;
  popupWall?(): void;
  collectTile?(): TCollection;
  afterCollect?(resolution: TCollection): void;
  tryOpenDoor?(): boolean;
  tryOpenSocket?(): boolean;
  clearBootsAndTools?(): boolean | void;
  resolveButtonEffects?(): number;
  soundEffects: {
    doorOpened?: number;
    socketOpened?: number;
    tileEmptied?: number;
    wallCreated?: number;
    bootsStolen?: number;
    itemCollected?: number;
    icCollected?: number;
    trapEntered?: number;
    chipWins?: number;
  };
}

function effectSound(effect: number | undefined): number {
  return effect ?? 0;
}

export function actorFloorImpactDestroysEnteringActor(action: ActorFloorImpactAction): boolean {
  return action === "destroy-water" || action === "destroy-fire" || action === "destroy-bomb";
}

export function actorFloorImpactTransformsFloor(action: ActorFloorImpactAction): boolean {
  return action === "transform-to-dirt" || action === "transform-to-empty";
}

export function actorFloorImpactTransformClearsFloor(action: ActorFloorImpactAction): boolean {
  return action === "transform-to-empty";
}

export function actorFloorImpactTransformTurnsToDirt(action: ActorFloorImpactAction): boolean {
  return action === "transform-to-dirt";
}

export function actorFloorImpactBombDestroys(action: ActorFloorImpactAction): boolean {
  return action === "destroy-bomb";
}

export function actorFloorImpactHoldsDirection(action: ActorFloorImpactAction): boolean {
  return action === "hold-direction";
}

export function actorFloorImpactTeleports(action: ActorFloorImpactAction): boolean {
  return action === "teleport";
}

export function actorFloorImpactRevertsPortable(action: ActorFloorImpactAction): boolean {
  return action === "revert-portable";
}

function consumeEnteredOverlay(
  context: ActorFloorImpactContext<ActorFloorImpactCollectionResolution>,
): void {
  (context.consumeEnteredOverlay ?? context.clearFloor)?.();
}

export function applyActorFloorImpactAction<
  TCollection extends ActorFloorImpactCollectionResolution = ActorFloorImpactCollectionResolution,
>(
  action: ActorFloorImpactAction,
  context: ActorFloorImpactContext<TCollection>,
): ArrivalResult {
  switch (action) {
    case "none":
      return noArrival();
    case "clear-floor":
      context.clearFloor?.();
      return resolvedArrival(effectSound(context.soundEffects.tileEmptied));
    case "collect-chip":
    case "collect-item": {
      const collected = context.collectTile?.();
      if (!collected?.collected) {
        return noArrival();
      }
      consumeEnteredOverlay(context);
      context.afterCollect?.(collected);
      return resolvedArrival(
        collected.collectedChip
          ? effectSound(context.soundEffects.icCollected)
          : effectSound(context.soundEffects.itemCollected),
      );
    }
    case "open-door":
      if (!context.tryOpenDoor?.()) {
        return noArrival();
      }
      consumeEnteredOverlay(context);
      return resolvedArrival(effectSound(context.soundEffects.doorOpened));
    case "open-socket":
      if (!context.tryOpenSocket?.()) {
        return noArrival();
      }
      consumeEnteredOverlay(context);
      return resolvedArrival(effectSound(context.soundEffects.socketOpened));
    case "steal-boots-tools":
      context.clearBootsAndTools?.();
      return resolvedArrival(effectSound(context.soundEffects.bootsStolen));
    case "popup-wall":
      context.popupWall?.();
      return resolvedArrival(effectSound(context.soundEffects.wallCreated));
    case "button":
      return resolvedArrival(context.resolveButtonEffects?.() ?? 0);
    case "trap":
      return resolvedArrival(effectSound(context.soundEffects.trapEntered));
    case "exit":
      return completedArrival(effectSound(context.soundEffects.chipWins));
    case "destroy-water":
    case "destroy-fire":
    case "destroy-bomb":
    case "transform-to-dirt":
    case "transform-to-empty":
    case "hold-direction":
    case "teleport":
    case "revert-portable":
      return noArrival();
  }
}
