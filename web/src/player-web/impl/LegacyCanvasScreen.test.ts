import { describe, expect, it, vi } from "vitest";
import {
  inventoryTileCountLabel,
  isThinWallTileId,
  visualEnhancementActorMarker,
  visualEnhancementBlockWindowOpacity,
  visualEnhancementThinWallOverlayTileId,
  withLegacyMapViewportClip,
} from "@player-web/impl/LegacyCanvasScreen";
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

describe("visualEnhancementActorMarker", () => {
  it("marks supported mobs on traps and cloners", () => {
    expect(visualEnhancementActorMarker(MS_TILE.Block, MS_TILE.Empty, MS_TILE.CloneMachine)).toEqual({
      floorId: MS_TILE.CloneMachine,
      showBlockWindow: true,
    });
    expect(visualEnhancementActorMarker(MS_TILE.Blob, MS_TILE.Beartrap, MS_TILE.Empty)).toEqual({
      floorId: MS_TILE.Beartrap,
      showBlockWindow: false,
    });
    expect(visualEnhancementActorMarker(MS_TILE.Paramecium, MS_TILE.Empty, MS_TILE.Beartrap)).toEqual({
      floorId: MS_TILE.Beartrap,
      showBlockWindow: false,
    });
  });

  it("ignores other actors and non-support floors", () => {
    expect(visualEnhancementActorMarker(MS_TILE.Glider, MS_TILE.Empty, MS_TILE.CloneMachine)).toBeNull();
    expect(visualEnhancementActorMarker(MS_TILE.Block, MS_TILE.Empty, MS_TILE.Empty)).toBeNull();
  });
});

describe("visualEnhancementBlockWindowOpacity", () => {
  it("keeps a transparent 8x8 center, a solid 4px border, and a linear fade between them", () => {
    expect(visualEnhancementBlockWindowOpacity(0)).toBe(0);
    expect(visualEnhancementBlockWindowOpacity(4)).toBe(0);
    expect(visualEnhancementBlockWindowOpacity(12)).toBe(0.5);
    expect(visualEnhancementBlockWindowOpacity(20)).toBe(1);
  });

  it("clamps distances outside the window domain", () => {
    expect(visualEnhancementBlockWindowOpacity(-1)).toBe(0);
    expect(visualEnhancementBlockWindowOpacity(20)).toBe(1);
  });
});

describe("visualEnhancementThinWallOverlayTileId", () => {
  it("marks MS blocks on thin walls for an overlaid wall-edge pass", () => {
    expect(isThinWallTileId(MS_TILE.Wall_North)).toBe(true);
    expect(isThinWallTileId(MS_TILE.Wall_Southeast)).toBe(true);
    expect(visualEnhancementThinWallOverlayTileId("MS", MS_TILE.Block_Static, MS_TILE.Wall_South)).toBe(MS_TILE.Wall_South);
  });

  it("ignores non-MS rulesets, non-block actors, and non-thin walls", () => {
    expect(isThinWallTileId(MS_TILE.Wall)).toBe(false);
    expect(visualEnhancementThinWallOverlayTileId("Lynx", MS_TILE.Block_Static, MS_TILE.Wall_South)).toBeNull();
    expect(visualEnhancementThinWallOverlayTileId("MS", MS_TILE.Paramecium, MS_TILE.Wall_South)).toBeNull();
    expect(visualEnhancementThinWallOverlayTileId("MS", MS_TILE.Block_Static, MS_TILE.Empty)).toBeNull();
  });
});
