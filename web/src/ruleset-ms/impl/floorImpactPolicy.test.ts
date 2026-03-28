import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msBlockedEnterEffect,
  msBlockedMoveFloorImpactAction,
  msFloorImpactAction,
  msHeldFloorImpactAction,
  msRuntimeActorFloorImpactAction,
  msTilePostEntryAction,
} from "@ruleset-ms/impl/floorImpactPolicy";

describe("ms floor impact policy", () => {
  it("maps chip tiles, actor arrivals, blocked moves, and blocked reveals onto typed floor-impact actions", () => {
    expect(msFloorImpactAction("water-death")).toBe("destroy-water");
    expect(msTilePostEntryAction(MS_TILE.Teleport)).toBe("teleport");
    expect(msRuntimeActorFloorImpactAction("creature-fire")).toBe("destroy-fire");
    expect(msHeldFloorImpactAction(MS_TILE.Beartrap, MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(msBlockedMoveFloorImpactAction(MS_TILE.BowlingBall)).toBe("revert-portable");
    expect(msBlockedEnterEffect(MS_TILE.BlueWall_Real)).toBe("reveal-wall");
    expect(msBlockedEnterEffect(MS_TILE.Empty)).toBe("none");
  });
});
