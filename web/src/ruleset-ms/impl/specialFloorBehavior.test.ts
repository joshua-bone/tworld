import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { probeMsTileExitEffect } from "@ruleset-ms/impl/tileEffects";

describe("MS special floor behavior", () => {
  it("probes trap and cloner exits through tile lifecycle behavior", () => {
    expect(probeMsTileExitEffect(MS_TILE.Beartrap, MS_DIRECTION.east, false)).toBe(false);
    expect(probeMsTileExitEffect(MS_TILE.Beartrap, MS_DIRECTION.east, true)).toBe(true);
    expect(probeMsTileExitEffect(MS_TILE.CloneMachine, MS_DIRECTION.east, false)).toBeNull();
    expect(probeMsTileExitEffect(MS_TILE.CloneMachine, MS_DIRECTION.east, true)).toBeNull();
  });

  it("returns null for tiles without a special exit probe", () => {
    expect(probeMsTileExitEffect(MS_TILE.Empty, MS_DIRECTION.east, false)).toBeNull();
  });
});
