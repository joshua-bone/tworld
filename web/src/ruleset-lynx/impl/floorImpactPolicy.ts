import type { ActorFloorImpactAction } from "@game-core/impl/floorImpact";
import type { LynxChipEnterAction } from "@ruleset-lynx/impl/catalogTiles";

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
    default:
      return null;
  }
}
