import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { probeLynxTileExitEffect } from "@ruleset-lynx/impl/tileEffects";

describe("Lynx special floor behavior", () => {
  it("probes trap and cloner exits through tile lifecycle behavior", () => {
    expect(probeLynxTileExitEffect(MS_TILE.Beartrap, MS_DIRECTION.east, false)).toBe(false);
    expect(probeLynxTileExitEffect(MS_TILE.Beartrap, MS_DIRECTION.east, true)).toBe(true);
    expect(probeLynxTileExitEffect(MS_TILE.CloneMachine, MS_DIRECTION.east, false)).toBe(false);
    expect(probeLynxTileExitEffect(MS_TILE.CloneMachine, MS_DIRECTION.east, true)).toBe(true);
  });

  it("returns null for tiles without a special exit probe", () => {
    expect(probeLynxTileExitEffect(MS_TILE.Empty, MS_DIRECTION.east, false)).toBeNull();
  });
});
