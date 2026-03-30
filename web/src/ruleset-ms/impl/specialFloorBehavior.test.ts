import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { probeMsTileExitByBehavior } from "@ruleset-ms/impl/specialFloorBehavior";

describe("MS special floor behavior", () => {
  it("probes trap and cloner exits through tile lifecycle behavior", () => {
    expect(probeMsTileExitByBehavior(MS_TILE.Beartrap, MS_DIRECTION.east, false)).toBe(false);
    expect(probeMsTileExitByBehavior(MS_TILE.Beartrap, MS_DIRECTION.east, true)).toBe(true);
    expect(probeMsTileExitByBehavior(MS_TILE.CloneMachine, MS_DIRECTION.east, false)).toBeNull();
    expect(probeMsTileExitByBehavior(MS_TILE.CloneMachine, MS_DIRECTION.east, true)).toBeNull();
  });

  it("returns null for tiles without a special exit probe", () => {
    expect(probeMsTileExitByBehavior(MS_TILE.Empty, MS_DIRECTION.east, false)).toBeNull();
  });
});
