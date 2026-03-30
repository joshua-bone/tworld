import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  isLynxAirForcedFloor,
  isLynxElevatorForcedFloor,
  isLynxIceForcedFloor,
  isLynxSlideForcedFloor,
  resolveLynxForcedFloorDirection,
} from "@ruleset-lynx/impl/elements/tiles/families/forcedFloor";

describe("lynx forced-floor family helpers", () => {
  it("resolves forced-floor direction through the family helper", () => {
    expect(isLynxSlideForcedFloor(MS_TILE.Slide_East)).toBe(true);
    expect(isLynxIceForcedFloor(MS_TILE.Ice)).toBe(true);
    expect(isLynxAirForcedFloor(MS_TILE.Air)).toBe(true);
    expect(isLynxElevatorForcedFloor(MS_TILE.Elevator)).toBe(true);
    expect(resolveLynxForcedFloorDirection(MS_TILE.Slide_East, MS_DIRECTION.north, () => MS_DIRECTION.east)).toBe(MS_DIRECTION.east);
    expect(resolveLynxForcedFloorDirection(MS_TILE.Ice, MS_DIRECTION.south, () => MS_DIRECTION.east)).toBe(MS_DIRECTION.south);
    expect(resolveLynxForcedFloorDirection(MS_TILE.Empty, MS_DIRECTION.south, () => MS_DIRECTION.east)).toBe(0);
  });
});
