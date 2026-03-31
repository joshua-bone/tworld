import { describe, expect, it, vi } from "vitest";
import {
  applyLegacyTileOverrides,
  createLegacyExpansionArtworkSprites,
  createLegacyExpansionArtworkOverrides,
  getOrCreateHeldTrapSprite,
  getOrCreateOccupiedPetCarrierSprite,
} from "@player-web/impl/legacyCanvasTileset";
import { LEGACY_TILE_SIZE } from "@player-web/impl/legacySprites";
import type { LegacyTileSprite, LegacyTileset } from "@player-web/impl/legacyTileset";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

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

describe("getOrCreateOccupiedPetCarrierSprite", () => {
  it("composites terrain, a normalized occupant render, and an opaque carrier overlay", () => {
    const baseImage = { width: LEGACY_TILE_SIZE, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const floorSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: false };
    const carrierSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: true };
    const occupantSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: true };
    const drawAlphas: number[] = [];
    const fakeContext = {
      drawImage: vi.fn(() => drawAlphas.push(fakeContext.globalAlpha)),
      save: vi.fn(),
      restore: vi.fn(() => {
        fakeContext.globalAlpha = 1;
      }),
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
        return null;
      }),
      getArtworkSprite: vi.fn((spriteId: string) => (spriteId === "pet_carrier" ? carrierSprite : null)),
      getCreature: vi.fn((actorId: number) => (actorId === MS_TILE.Bug ? occupantSprite : null)),
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

      const render = {
        baseTileId: MS_TILE.Empty,
        occupant: {
          kind: "creature" as const,
          tileId: MS_TILE.Bug,
          dir: MS_DIRECTION.east,
          moving: 0,
          frame: 0,
        },
      };
      const first = getOrCreateOccupiedPetCarrierSprite(tileset, render, 0);
      const second = getOrCreateOccupiedPetCarrierSprite(tileset, render, 0);

      expect(first).toMatchObject({
        image: fakeCanvas,
        offsetX: 0,
        offsetY: 0,
        transparent: false,
      });
      expect(second).toBe(first);
      expect(fakeCanvas.width).toBe(LEGACY_TILE_SIZE);
      expect(fakeCanvas.height).toBe(LEGACY_TILE_SIZE);
      expect(tileset.getCreature).toHaveBeenCalledWith(MS_TILE.Bug, MS_DIRECTION.north, 0, 0);
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(3);
      expect(drawAlphas).toEqual([1, 1, 1]);
      expect(fakeContext.save).not.toHaveBeenCalled();
      expect(fakeContext.restore).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders teeth facing south inside occupied carriers", () => {
    const baseImage = { width: LEGACY_TILE_SIZE, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const floorSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: false };
    const carrierSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: true };
    const occupantSprite: LegacyTileSprite = { image: baseImage, offsetX: 0, offsetY: 0, transparent: true };
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
      get: vi.fn((tileId: number) => (tileId === MS_TILE.Empty ? floorSprite : null)),
      getArtworkSprite: vi.fn((spriteId: string) => (spriteId === "pet_carrier" ? carrierSprite : null)),
      getCreature: vi.fn((actorId: number) => (actorId === MS_TILE.Teeth ? occupantSprite : null)),
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

      getOrCreateOccupiedPetCarrierSprite(tileset, {
        baseTileId: MS_TILE.Empty,
        occupant: {
          kind: "creature" as const,
          tileId: MS_TILE.Teeth,
          dir: MS_DIRECTION.west,
          moving: 4,
          frame: 2,
        },
      }, 0);

      expect(tileset.getCreature).toHaveBeenCalledWith(MS_TILE.Teeth, MS_DIRECTION.south, 0, 0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("createLegacyExpansionArtworkOverrides", () => {
  it("maps expansion artwork sprites onto the registered portable-item and bowling-ball ids", () => {
    const fakeImage = { width: LEGACY_TILE_SIZE * 7, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const fakeContext = {
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
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

      const overrides = createLegacyExpansionArtworkOverrides(fakeImage);

      expect(overrides.get(MS_TILE.Sandbag)).toMatchObject({ transparent: true });
      expect(overrides.get(MS_TILE.Hook)).toMatchObject({ transparent: true });
      expect(overrides.get(MS_TILE.PetCarrier)).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.north))).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.west))).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.south))).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east))).toMatchObject({ transparent: true });
      expect(overrides.get(MS_TILE.BowlingBall_Still)).toMatchObject({ transparent: true });
      expect(overrides.get(MS_TILE.Cloud)).toMatchObject({
        transparent: true,
        preserveLayerTransparency: true,
      });
      expect(overrides.get(MS_TILE.IceBlock_Static)).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.IceBlock, MS_DIRECTION.north))).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.IceBlock, MS_DIRECTION.west))).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.IceBlock, MS_DIRECTION.south))).toMatchObject({ transparent: true });
      expect(overrides.get(msCreatureTile(MS_TILE.IceBlock, MS_DIRECTION.east))).toMatchObject({ transparent: true });
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(7);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps expansion artwork sprites addressable by sprite id for renderer metadata", () => {
    const fakeImage = { width: LEGACY_TILE_SIZE * 7, height: LEGACY_TILE_SIZE } as HTMLCanvasElement;
    const fakeContext = {
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;
    const emptySprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const baseTileset: LegacyTileset = {
      get: () => emptySprite,
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

      const artworkSprites = createLegacyExpansionArtworkSprites(fakeImage);
      const overridden = applyLegacyTileOverrides(baseTileset, new Map(), artworkSprites);

      expect(overridden.getArtworkSprite?.("sandbag")).toMatchObject({ transparent: true });
      expect(overridden.getArtworkSprite?.("bowling_ball_moving")).toMatchObject({ transparent: true });
      expect(overridden.getArtworkSprite?.("bowling_ball_still")).toMatchObject({ transparent: true });
      expect(overridden.getArtworkSprite?.("cloud")).toMatchObject({
        transparent: true,
        preserveLayerTransparency: true,
      });
      expect(overridden.getArtworkSprite?.("hook")).toMatchObject({ transparent: true });
      expect(overridden.getArtworkSprite?.("ice_block")).toMatchObject({ transparent: true });
      expect(overridden.getArtworkSprite?.("pet_carrier")).toMatchObject({ transparent: true });
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(7);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("draws the floor underneath transparent pickups when compositing bowling-ball artwork cells", () => {
    const fakeContext = {
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;
    const floorSprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const keySprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: true };
    const bowlingBallSprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: true };
    const baseTileset: LegacyTileset = {
      get: (tileId) => {
        if (tileId === MS_TILE.Empty) {
          return floorSprite;
        }
        if (tileId === MS_TILE.Key_Green) {
          return keySprite;
        }
        return null;
      },
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

      const overridden = applyLegacyTileOverrides(
        baseTileset,
        new Map([[msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east), bowlingBallSprite]]),
      );

      const sprite = overridden.getCell?.(msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east), MS_TILE.Key_Green, 0);

      expect(sprite).toMatchObject({ transparent: false });
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the bottom tile's own combined sprite path under a transparent still bowling ball", () => {
    const fakeContext = {
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;
    const floorSprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const waterSprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const bowlingBallSprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: true };
    const baseGetCell = vi.fn((topId: number, bottomId: number) => {
      if (topId === MS_TILE.Empty && bottomId === MS_TILE.Water) {
        return floorSprite;
      }
      if (topId === MS_TILE.Water && bottomId === MS_TILE.Empty) {
        return waterSprite;
      }
      return null;
    });
    const baseTileset: LegacyTileset = {
      get: (tileId) => {
        if (tileId === MS_TILE.Empty) {
          return floorSprite;
        }
        if (tileId === MS_TILE.Water) {
          return waterSprite;
        }
        return null;
      },
      getCell: baseGetCell,
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

      const overridden = applyLegacyTileOverrides(
        baseTileset,
        new Map([[MS_TILE.BowlingBall_Still, bowlingBallSprite]]),
      );

      const sprite = overridden.getCell?.(MS_TILE.BowlingBall_Still, MS_TILE.Water, 0);

      expect(sprite).toMatchObject({ transparent: false });
      expect(baseGetCell).toHaveBeenCalledWith(MS_TILE.Water, MS_TILE.Empty, 0);
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not synthesize an opaque floor behind a layer-passthrough cloud sprite", () => {
    const fakeContext = {
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeContext),
    } as unknown as HTMLCanvasElement;
    const floorSprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: false };
    const cloudSprite: LegacyTileSprite = {
      image: fakeCanvas,
      offsetX: 0,
      offsetY: 0,
      transparent: true,
      preserveLayerTransparency: true,
    };
    const bowlingBallSprite: LegacyTileSprite = { image: fakeCanvas, offsetX: 0, offsetY: 0, transparent: true };
    const baseTileset: LegacyTileset = {
      get: (tileId) => {
        if (tileId === MS_TILE.Empty) {
          return floorSprite;
        }
        if (tileId === MS_TILE.Cloud) {
          return cloudSprite;
        }
        return null;
      },
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

      const overridden = applyLegacyTileOverrides(
        baseTileset,
        new Map([[MS_TILE.BowlingBall_Still, bowlingBallSprite]]),
      );

      const sprite = overridden.getCell?.(MS_TILE.BowlingBall_Still, MS_TILE.Cloud, 0);

      expect(sprite).toMatchObject({ transparent: false });
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
