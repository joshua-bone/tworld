import { describe, expect, it, vi } from "vitest";
import { getOrCreateHeldTrapSprite } from "@player-web/impl/legacyCanvasTileset";
import { LEGACY_TILE_SIZE } from "@player-web/impl/legacySprites";
import type { LegacyTileSprite, LegacyTileset } from "@player-web/impl/legacyTileset";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("getOrCreateHeldTrapSprite", () => {
  it("creates the composite sprite at full legacy tile size", () => {
    const baseImage = { width: LEGACY_TILE_SIZE, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const floorSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: false };
    const trapSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: false };
    const fakeContext = {
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;
    const tileset: LegacyTileset = {
      get: vi.fn((tileId: number) => {
        if (tileId === MS_TILE.Empty) {
          return floorSprite;
        }
        if (tileId === MS_TILE.Beartrap) {
          return trapSprite;
        }
        return null;
      }),
    };

    try {
      vi.stubGlobal("document", {
        createElement: vi.fn((tagName: string) => {
          if (tagName !== "canvas") {
            throw new Error(`unexpected tag: ${tagName}`);
          }
          return fakeCanvas;
        }),
      });

      const sprite = getOrCreateHeldTrapSprite(tileset);

      expect(sprite).toMatchObject({
        image: fakeCanvas,
        offsetX: 0,
        offsetY: 0,
        transparent: false,
      });
      expect(fakeCanvas.width).toBe(LEGACY_TILE_SIZE);
      expect(fakeCanvas.height).toBe(LEGACY_TILE_SIZE);
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
