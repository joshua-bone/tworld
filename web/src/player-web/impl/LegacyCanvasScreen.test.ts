import { describe, expect, it, vi } from "vitest";
import { inventoryTileCountLabel, withLegacyMapViewportClip } from "@player-web/impl/LegacyCanvasScreen";
import { LEGACY_MAP_HEIGHT, LEGACY_MAP_WIDTH, LEGACY_MAP_X, LEGACY_MAP_Y } from "@player-web/impl/legacySprites";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("withLegacyMapViewportClip", () => {
  it("clips drawing to the 9x9 legacy map viewport", () => {
    const calls: string[] = [];
    const context = {
      save: vi.fn(() => calls.push("save")),
      beginPath: vi.fn(() => calls.push("beginPath")),
      rect: vi.fn((x: number, y: number, width: number, height: number) =>
        calls.push(`rect:${x},${y},${width},${height}`),
      ),
      clip: vi.fn(() => calls.push("clip")),
      restore: vi.fn(() => calls.push("restore")),
    } as unknown as Pick<CanvasRenderingContext2D, "save" | "beginPath" | "rect" | "clip" | "restore">;
    const draw = vi.fn(() => calls.push("draw"));

    withLegacyMapViewportClip(context, draw);

    expect(draw).toHaveBeenCalledTimes(1);
    expect(context.rect).toHaveBeenCalledWith(LEGACY_MAP_X, LEGACY_MAP_Y, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);
    expect(calls).toEqual([
      "save",
      "beginPath",
      `rect:${LEGACY_MAP_X},${LEGACY_MAP_Y},${LEGACY_MAP_WIDTH},${LEGACY_MAP_HEIGHT}`,
      "clip",
      "draw",
      "restore",
    ]);
  });

  it("restores the canvas state when drawing throws", () => {
    const context = {
      save: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      restore: vi.fn(),
    } as unknown as Pick<CanvasRenderingContext2D, "save" | "beginPath" | "rect" | "clip" | "restore">;
    const error = new Error("boom");

    expect(() => withLegacyMapViewportClip(context, () => {
      throw error;
    })).toThrow(error);
    expect(context.restore).toHaveBeenCalledTimes(1);
  });
});

describe("inventoryTileCountLabel", () => {
  it("shows counts only for stacked red, blue, and yellow keys", () => {
    expect(inventoryTileCountLabel(MS_TILE.Key_Red, 2)).toBe("2");
    expect(inventoryTileCountLabel(MS_TILE.Key_Blue, 3)).toBe("3");
    expect(inventoryTileCountLabel(MS_TILE.Key_Yellow, 4)).toBe("4");
  });

  it("hides counts for single keys, green keys, and boots", () => {
    expect(inventoryTileCountLabel(MS_TILE.Key_Red, 1)).toBeNull();
    expect(inventoryTileCountLabel(MS_TILE.Key_Green, 2)).toBeNull();
    expect(inventoryTileCountLabel(MS_TILE.Boots_Water, 2)).toBeNull();
  });
});
