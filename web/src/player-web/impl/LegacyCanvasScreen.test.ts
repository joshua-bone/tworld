import { describe, expect, it, vi } from "vitest";
import {
  applyLegacyTileOverrides,
  createLegacyArtworkSpriteFromFrame,
  inventoryStripPixelDimensions,
  inventoryStripPixelDimensionsForKind,
  inventoryTileCountLabel,
  isThinWallTileId,
  shouldBypassLegacyFrameDrawMemo,
  shouldUseLegacyCombinedCellSprite,
  visualEnhancementThinWallActorPassTileId,
  visualEnhancementActorMarker,
  visualEnhancementBlockWindowOpacity,
  visualEnhancementThinWallOverlayTileId,
  withLegacyMapViewportClip,
} from "@player-web/impl/LegacyCanvasScreen";
import { LEGACY_MAP_HEIGHT, LEGACY_MAP_WIDTH, LEGACY_MAP_X, LEGACY_MAP_Y, LEGACY_TILE_SIZE } from "@player-web/impl/legacySprites";
import type { LegacyTileSprite, LegacyTileset } from "@player-web/impl/legacyTileset";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { MS_TILE } from "@ruleset-ms/api/tiles";

function createMemoTestSession(visibleLayerCount: number): InteractiveGameSession {
  return {
    request: { seriesFile: "TEST", levelNumber: 1, ruleset: "Lynx" },
    mode: "manual",
    hintText: null,
    frame: {
      snapshot: {
        phase: "tick",
        input: "none",
        inputCode: 0,
        status: "playing",
        tick: 0,
        currentTime: 0,
        timeOffset: 0,
        secondsPlayed: 0,
        timelimit: 0,
        chipsNeeded: 0,
        statusFlags: 0,
        lastMoveCode: 0,
        lastMove: "none",
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: 0,
        randomState: {
          main: { initial: "0", value: "0", shared: false },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects: 0,
        view: { x: 0, y: 0 },
        inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0], tools: [0] },
        chip: null,
        creatureCount: 0,
        creaturesHash: "",
        mapHash: "",
        creatures: [],
      },
      cells: [],
      currentZ: visibleLayerCount > 1 ? 2 : 1,
      visibleLayers: Array.from({ length: visibleLayerCount }, (_, index) => ({
        z: visibleLayerCount - index,
        cells: [],
      })),
      tileOverlays: [],
      render: null,
    },
    history: {
      enabled: true,
      initialTick: -1,
      currentTick: -1,
      latestTick: -1,
      checkpointTicks: [-1],
      previousTick: null,
      previousCheckpointTick: null,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
    run: {
      undoUsedCount: 0,
      replayAvailable: false,
      result: null,
    },
    recordedMoves: [],
    handle: {} as InteractiveGameSession["handle"],
  };
}

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

describe("shouldBypassLegacyFrameDrawMemo", () => {
  it("bypasses draw-state memoization for layered gameplay frames", () => {
    expect(shouldBypassLegacyFrameDrawMemo(createMemoTestSession(2))).toBe(true);
    expect(shouldBypassLegacyFrameDrawMemo(createMemoTestSession(1))).toBe(false);
    expect(shouldBypassLegacyFrameDrawMemo(null)).toBe(false);
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

describe("inventoryStripPixelDimensions", () => {
  it("supports both vertical and horizontal strip layouts", () => {
    expect(inventoryStripPixelDimensions(48, "vertical")).toEqual({ height: 192, width: 48 });
    expect(inventoryStripPixelDimensions(48, "horizontal")).toEqual({ height: 48, width: 192 });
  });
});

describe("inventoryStripPixelDimensionsForKind", () => {
  it("supports the single-slot tools strip", () => {
    expect(inventoryStripPixelDimensionsForKind(48, "vertical", "tools")).toEqual({ height: 48, width: 48 });
    expect(inventoryStripPixelDimensionsForKind(48, "horizontal", "tools")).toEqual({ height: 48, width: 48 });
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
  it("marks MS and Lynx blocks on thin walls for an overlaid wall-edge pass", () => {
    expect(isThinWallTileId(MS_TILE.Wall_North)).toBe(true);
    expect(isThinWallTileId(MS_TILE.Wall_Southeast)).toBe(true);
    expect(visualEnhancementThinWallOverlayTileId("MS", MS_TILE.Block_Static, MS_TILE.Wall_South)).toBe(MS_TILE.Wall_South);
    expect(visualEnhancementThinWallOverlayTileId("Lynx", MS_TILE.Block_Static, MS_TILE.Wall_South)).toBe(MS_TILE.Wall_South);
  });

  it("ignores unsupported rulesets, non-block actors, and non-thin walls", () => {
    expect(isThinWallTileId(MS_TILE.Wall)).toBe(false);
    expect(visualEnhancementThinWallOverlayTileId(null, MS_TILE.Block_Static, MS_TILE.Wall_South)).toBeNull();
    expect(visualEnhancementThinWallOverlayTileId("MS", MS_TILE.Paramecium, MS_TILE.Wall_South)).toBeNull();
    expect(visualEnhancementThinWallOverlayTileId("MS", MS_TILE.Block_Static, MS_TILE.Empty)).toBeNull();
  });
});

describe("shouldUseLegacyCombinedCellSprite", () => {
  it("bypasses the combined cell fast path when a thin-wall overlay needs a separate pass", () => {
    expect(shouldUseLegacyCombinedCellSprite(MS_TILE.Block_Static, MS_TILE.Wall_South, null, MS_TILE.Wall_South)).toBe(false);
  });

  it("still allows the combined cell fast path for ordinary composited cells", () => {
    expect(shouldUseLegacyCombinedCellSprite(MS_TILE.Chip, MS_TILE.Ice, null, null)).toBe(true);
  });
});

describe("createLegacyArtworkSpriteFromFrame", () => {
  it("crops a sprite from the expansion artwork sheet", () => {
    const spriteSheet = { width: 144, height: 48 } as CanvasImageSource;
    const fakeDrawImage = vi.fn();
    const fakeContext = {
      drawImage: fakeDrawImage,
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;

    try {
      vi.stubGlobal("document", {
        createElement: vi.fn((tagName: string) => {
          if (tagName !== "canvas") {
            throw new Error(`unexpected tag: ${tagName}`);
          }
          return fakeCanvas;
        }),
      });

      const sprite = createLegacyArtworkSpriteFromFrame(spriteSheet, {
        x: 48,
        y: 0,
        width: 48,
        height: 48,
        transparent: true,
        preserveLayerTransparency: false,
      });

      expect(sprite).toMatchObject({
        image: fakeCanvas,
        offsetX: 0,
        offsetY: 0,
        transparent: true,
      });
      expect(fakeContext.imageSmoothingEnabled).toBe(false);
      expect(fakeDrawImage).toHaveBeenCalledWith(
        spriteSheet,
        48,
        0,
        48,
        48,
        0,
        0,
        LEGACY_TILE_SIZE,
        LEGACY_TILE_SIZE,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("applyLegacyTileOverrides", () => {
  it("keeps bottom-tile animation available under a transparent overridden top tile", () => {
    const baseCanvas = { width: LEGACY_TILE_SIZE, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const fakeDrawImage = vi.fn();
    const fakeContext = {
      drawImage: fakeDrawImage,
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;

    const emptySprite: LegacyTileSprite = { image: baseCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const animatedFloorSprite: LegacyTileSprite = { image: baseCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const sandbagSprite: LegacyTileSprite = { image: baseCanvas, offsetX: 0, offsetY: 0, transparent: true };
    const baseTileset: LegacyTileset = {
      get: vi.fn((tileId: number) => (tileId === MS_TILE.Empty ? emptySprite : null)),
      getCell: vi.fn((topId: number, bottomId: number, timerval: number) =>
        topId === MS_TILE.Slide_East && bottomId === MS_TILE.Empty && timerval === 7 ? animatedFloorSprite : null,
      ),
      getCellAnimationPeriod: vi.fn((topId: number, bottomId: number) =>
        topId === MS_TILE.Empty && bottomId === MS_TILE.Slide_East ? 4 : 1,
      ),
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
      const overridden = applyLegacyTileOverrides(baseTileset, new Map([[MS_TILE.Sandbag, sandbagSprite]]));

      expect(overridden.getCellAnimationPeriod?.(MS_TILE.Sandbag, MS_TILE.Slide_East)).toBe(4);
      expect(overridden.getCell?.(MS_TILE.Sandbag, MS_TILE.Slide_East, 7)).toMatchObject({
        transparent: false,
        offsetX: 0,
        offsetY: 0,
      });
      expect(baseTileset.getCell).toHaveBeenCalledWith(MS_TILE.Slide_East, MS_TILE.Empty, 7);
      expect(fakeDrawImage).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("supports a second portable item family using the same transparent override path", () => {
    const baseCanvas = { width: LEGACY_TILE_SIZE, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const fakeDrawImage = vi.fn();
    const fakeContext = {
      drawImage: fakeDrawImage,
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;

    const emptySprite: LegacyTileSprite = { image: baseCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const hookSprite: LegacyTileSprite = { image: baseCanvas, offsetX: 0, offsetY: 0, transparent: true };
    const baseTileset: LegacyTileset = {
      get: vi.fn((tileId: number) => (tileId === MS_TILE.Empty ? emptySprite : null)),
      getCell: vi.fn(() => emptySprite),
      getCellAnimationPeriod: vi.fn(() => 1),
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
      const overridden = applyLegacyTileOverrides(baseTileset, new Map([[MS_TILE.Hook, hookSprite]]));

      expect(overridden.getCell?.(MS_TILE.Hook, MS_TILE.Slide_East, 7)).toMatchObject({
        transparent: false,
        offsetX: 0,
        offsetY: 0,
      });
      expect(baseTileset.getCell).toHaveBeenCalledWith(MS_TILE.Slide_East, MS_TILE.Empty, 7);
      expect(fakeDrawImage).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("composes transparent overrides over closed traps using the floor sprite order", () => {
    const baseCanvas = { width: LEGACY_TILE_SIZE, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const fakeDrawImage = vi.fn();
    const fakeContext = {
      drawImage: fakeDrawImage,
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;

    const trapSprite: LegacyTileSprite = { image: baseCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const sandbagSprite: LegacyTileSprite = { image: baseCanvas, offsetX: 0, offsetY: 0, transparent: true };
    const baseTileset: LegacyTileset = {
      get: vi.fn(() => null),
      getCell: vi.fn((topId: number, bottomId: number, timerval: number) =>
        topId === MS_TILE.Beartrap && bottomId === MS_TILE.Empty && timerval === 0 ? trapSprite : null,
      ),
      getCellAnimationPeriod: vi.fn(() => 1),
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
      const overridden = applyLegacyTileOverrides(baseTileset, new Map([[MS_TILE.Sandbag, sandbagSprite]]));

      expect(overridden.getCell?.(MS_TILE.Sandbag, MS_TILE.Beartrap, 0)).toMatchObject({
        transparent: false,
        offsetX: 0,
        offsetY: 0,
      });
      expect(baseTileset.getCell).toHaveBeenCalledWith(MS_TILE.Beartrap, MS_TILE.Empty, 0);
      expect(fakeDrawImage).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("visualEnhancementThinWallActorPassTileId", () => {
  it("moves Lynx block thin-wall overlays into the actor pass", () => {
    expect(visualEnhancementThinWallActorPassTileId("Lynx", MS_TILE.Block, MS_TILE.Wall_South, MS_TILE.Empty)).toBe(MS_TILE.Wall_South);
  });

  it("keeps MS using the cell compositor path", () => {
    expect(visualEnhancementThinWallActorPassTileId("MS", MS_TILE.Block, MS_TILE.Wall_South, MS_TILE.Empty)).toBeNull();
  });

  it("ignores non-block Lynx actors even on thin walls", () => {
    expect(visualEnhancementThinWallActorPassTileId("Lynx", MS_TILE.Ball, MS_TILE.Wall_South, MS_TILE.Empty)).toBeNull();
  });
});
