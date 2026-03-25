import { describe, expect, it } from "vitest";
import {
  isDefaultLegacyRenderTileSize,
  legacyMapPixelsForTileSize,
  pickLegacyRenderTileSize,
} from "@player-web/impl/legacyRenderPresets";

describe("legacyRenderPresets", () => {
  it("computes the 9x9 map viewport size for each supported preset", () => {
    expect(legacyMapPixelsForTileSize(48)).toBe(432);
    expect(legacyMapPixelsForTileSize(32)).toBe(288);
    expect(legacyMapPixelsForTileSize(24)).toBe(216);
  });

  it("chooses the largest preset that fits the available board size", () => {
    expect(pickLegacyRenderTileSize(500)).toBe(48);
    expect(pickLegacyRenderTileSize(432)).toBe(48);
    expect(pickLegacyRenderTileSize(431)).toBe(32);
    expect(pickLegacyRenderTileSize(288)).toBe(32);
    expect(pickLegacyRenderTileSize(287)).toBe(24);
    expect(pickLegacyRenderTileSize(120)).toBe(24);
  });

  it("identifies the default preset", () => {
    expect(isDefaultLegacyRenderTileSize(48)).toBe(true);
    expect(isDefaultLegacyRenderTileSize(32)).toBe(false);
    expect(isDefaultLegacyRenderTileSize(24)).toBe(false);
  });
});
