import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lynxBlockedMoveFloorImpactAction,
  lynxFloorImpactAction,
  lynxHeldFloorImpactAction,
  lynxRuntimeActorFloorImpactAction,
  lynxTilePostEntryAction,
} from "@ruleset-lynx/impl/floorImpactPolicy";

describe("lynx floor impact policy", () => {
  it("maps chip tiles, actor arrivals, and blocked moves onto typed floor-impact actions", () => {
    expect(lynxFloorImpactAction("fire-death")).toBe("destroy-fire");
    expect(lynxTilePostEntryAction(MS_TILE.Teleport)).toBe("teleport");
    expect(lynxRuntimeActorFloorImpactAction("button")).toBe("button");
    expect(lynxRuntimeActorFloorImpactAction("clear-key-blue")).toBe("transform-to-empty");
    expect(lynxHeldFloorImpactAction(MS_TILE.CloneMachine, MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(lynxBlockedMoveFloorImpactAction(MS_TILE.BowlingBall)).toBe("revert-portable");
  });
});
