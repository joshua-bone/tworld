import type { ActorFloorImpactAction } from "@game-core/impl/floorImpact";
import { actorBlockedMoveKeepsDirection, actorBlockedMoveRevertsPortable } from "@game-core/api/actorCapabilities";
import type { ActorArrivalOutcome } from "@game-core/api/actorInteractions";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { lynxChipEnterAction, lynxTileForcedFloorKind } from "@ruleset-lynx/impl/catalog";
import { lynxActorBlockedMoveKind } from "@ruleset-lynx/impl/actorLifecycleQueries";
import type { LynxChipEnterAction } from "@ruleset-lynx/impl/catalogTiles";
import { lynxActorHeldFloorOutcome } from "@ruleset-lynx/impl/actorInteractions";

export function lynxFloorImpactAction(action: LynxChipEnterAction): ActorFloorImpactAction | null {
  switch (action) {
    case "clear-floor":
    case "collect-chip":
    case "collect-item":
    case "open-door":
    case "open-socket":
    case "popup-wall":
    case "button":
    case "trap":
    case "exit":
    case "none":
      return action;
    case "steal-boots":
      return "steal-boots-tools";
    case "explode-bomb":
      return "destroy-bomb";
    case "water-death":
      return "destroy-water";
    case "fire-death":
      return "destroy-fire";
    default:
      return null;
  }
}

export function lynxRuntimeActorFloorImpactAction(action: ActorArrivalOutcome): ActorFloorImpactAction | null {
  switch (action) {
    case "trap":
      return "trap";
    case "button":
      return "button";
    case "clear-key-blue":
      return "transform-to-empty";
    case "block-water":
      return "transform-to-dirt";
    case "block-bomb":
      return "transform-to-empty";
    case "creature-water":
      return "destroy-water";
    case "creature-bomb":
      return "destroy-bomb";
    case "none":
      return "none";
    default:
      return null;
  }
}

export function lynxHeldFloorImpactAction(tileId: number, actorId: number): ActorFloorImpactAction | null {
  return lynxActorHeldFloorOutcome(tileId, actorId) === "hold-direction" ? "hold-direction" : null;
}

export function lynxBlockedMoveFloorImpactAction(actorId: number): ActorFloorImpactAction | null {
  const blockedMoveKind = lynxActorBlockedMoveKind(actorId);
  if (actorBlockedMoveRevertsPortable(blockedMoveKind)) {
    return "revert-portable";
  }
  if (actorBlockedMoveKeepsDirection(blockedMoveKind)) {
    return "hold-direction";
  }
  return null;
}

export function lynxTilePostEntryAction(tileId: number): ActorFloorImpactAction | null {
  if (lynxTileForcedFloorKind(tileId) === "teleport") {
    return "teleport";
  }
  return lynxFloorImpactAction(lynxChipEnterAction(tileId));
}
