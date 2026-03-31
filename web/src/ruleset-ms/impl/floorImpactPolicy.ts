import type { ActorFloorImpactAction } from "@game-core/impl/floorImpact";
import { actorBlockedMoveRevertsPortable, actorBlockedMoveKeepsDirection } from "@game-core/api/actorCapabilities";
import type { ActorArrivalOutcome } from "@game-core/api/actorInteractions";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msChipEnterAction } from "@ruleset-ms/impl/catalog";
import { msActorBlockedMoveKind } from "@ruleset-ms/impl/actorLifecycleQueries";
import type { MsChipEnterAction } from "@ruleset-ms/impl/catalogTiles";
import { msActorHeldFloorOutcome } from "@ruleset-ms/impl/actorInteractions";

export function msFloorImpactAction(action: MsChipEnterAction): ActorFloorImpactAction | null {
  switch (action) {
    case "clear-floor":
    case "collect-chip":
    case "collect-item":
    case "open-door":
    case "open-socket":
    case "popup-wall":
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
    case "teleport":
      return "teleport";
    default:
      return null;
  }
}

export function msRuntimeActorFloorImpactAction(action: ActorArrivalOutcome): ActorFloorImpactAction | null {
  switch (action) {
    case "ice-block-water":
      return "transform-to-ice";
    case "ice-block-fire":
      return "transform-to-water";
    case "block-water":
      return "transform-to-dirt";
    case "block-bomb":
      return "transform-to-empty";
    case "creature-water":
      return "destroy-water";
    case "creature-fire":
      return "destroy-fire";
    case "creature-bomb":
      return "destroy-bomb";
    case "none":
      return "none";
    default:
      return null;
  }
}

export function msHeldFloorImpactAction(tileId: number, actorId: number): ActorFloorImpactAction | null {
  return msActorHeldFloorOutcome(tileId, actorId) === "hold-direction" ? "hold-direction" : null;
}

export function msBlockedMoveFloorImpactAction(actorId: number): ActorFloorImpactAction | null {
  const blockedMoveKind = msActorBlockedMoveKind(actorId);
  if (actorBlockedMoveRevertsPortable(blockedMoveKind)) {
    return "revert-portable";
  }
  if (actorBlockedMoveKeepsDirection(blockedMoveKind)) {
    return "hold-direction";
  }
  return null;
}

export function msTilePostEntryAction(tileId: number): ActorFloorImpactAction | null {
  if (tileId === MS_TILE.Teleport) {
    return "teleport";
  }
  return msFloorImpactAction(msChipEnterAction(tileId));
}
