import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msBlockedMoveFloorImpactAction,
  msFloorImpactAction,
  msHeldFloorImpactAction,
  msRuntimeActorFloorImpactAction,
  msTilePostEntryAction,
} from "@ruleset-ms/impl/floorImpactPolicy";

describe("ms floor impact policy", () => {
  it("maps chip tiles, actor arrivals, and blocked moves onto typed floor-impact actions", () => {
    expect(msFloorImpactAction("water-death")).toBe("destroy-water");
    expect(msTilePostEntryAction(MS_TILE.Teleport)).toBe("teleport");
    expect(msRuntimeActorFloorImpactAction("creature-fire")).toBe("destroy-fire");
    expect(msRuntimeActorFloorImpactAction("ice-block-water")).toBe("transform-to-ice");
    expect(msRuntimeActorFloorImpactAction("ice-block-fire")).toBe("transform-to-water");
    expect(msHeldFloorImpactAction(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(msBlockedMoveFloorImpactAction(MS_TILE.BowlingBall)).toBe("revert-portable");
  });
});
