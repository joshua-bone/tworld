import type { ActorFloorImpactAction } from "@game-core/impl/floorImpact";
import type { MsChipEnterAction } from "@ruleset-ms/impl/catalogTiles";

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
    default:
      return null;
  }
}
