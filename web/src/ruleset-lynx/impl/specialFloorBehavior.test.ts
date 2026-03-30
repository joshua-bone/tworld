import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { probeLynxTileExitByBehavior } from "@ruleset-lynx/impl/specialFloorBehavior";

describe("Lynx special floor behavior", () => {
  it("probes trap and cloner exits through tile lifecycle behavior", () => {
    expect(probeLynxTileExitByBehavior(MS_TILE.Beartrap, MS_DIRECTION.east, false)).toBe(false);
    expect(probeLynxTileExitByBehavior(MS_TILE.Beartrap, MS_DIRECTION.east, true)).toBe(true);
    expect(probeLynxTileExitByBehavior(MS_TILE.CloneMachine, MS_DIRECTION.east, false)).toBe(false);
    expect(probeLynxTileExitByBehavior(MS_TILE.CloneMachine, MS_DIRECTION.east, true)).toBe(true);
  });

  it("returns null for tiles without a special exit probe", () => {
    expect(probeLynxTileExitByBehavior(MS_TILE.Empty, MS_DIRECTION.east, false)).toBeNull();
  });
});
