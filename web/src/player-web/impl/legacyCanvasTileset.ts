import { useEffect, useState } from "react";
import lynxTilesUrl from "@res/atiles.bmp?url";
import msTilesUrl from "@res/tiles.bmp?url";
import expandedArtworkUrl from "@res/expansion_artwork/expanded.png?url";
import { expansionArtworkFrameRect, type ExpansionArtworkFrameRect } from "@player-web/impl/expansionArtwork";
import { buildLegacyTileset, type LegacyTileSprite, type LegacyTileset } from "@player-web/impl/legacyTileset";
import { LEGACY_TILE_SIZE } from "@player-web/impl/legacySprites";
import { createCanvas, drawLegacySpriteImage, loadLegacyImage } from "@player-web/impl/legacyCanvasShared";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export type LegacyTilesetRuleset = "MS" | "Lynx";

const HELD_TRAP_ALPHA = 0.5;
const ELEVATOR_BASE_COLOR = "#2f9f4a";
const ELEVATOR_EDGE_COLOR = "#0e401d";
const ELEVATOR_PANEL_COLOR = "#154d23";
const ELEVATOR_TEXT_COLOR = "#d9ffd7";

const LEGACY_TILESET_URLS: Record<LegacyTilesetRuleset, string> = {
  MS: msTilesUrl,
  Lynx: lynxTilesUrl,
};

const legacyTilesetCache = new Map<LegacyTilesetRuleset, LegacyTileset>();
const legacyTilesetPromiseCache = new Map<LegacyTilesetRuleset, Promise<LegacyTileset>>();

interface LegacyDerivedSpriteCache {
  elevator?: LegacyTileSprite | null;
  heldTrap?: LegacyTileSprite | null;
  thinWallOverlays?: Map<number, LegacyTileSprite | null>;
}

const legacyDerivedSpriteCache = new WeakMap<LegacyTileset, LegacyDerivedSpriteCache>();

function legacyDerivedSpritesFor(tileset: LegacyTileset): LegacyDerivedSpriteCache {
  const cached = legacyDerivedSpriteCache.get(tileset);
  if (cached) {
    return cached;
  }

  const next: LegacyDerivedSpriteCache = {};
  legacyDerivedSpriteCache.set(tileset, next);
  return next;
}

function createElevatorSprite(): LegacyTileSprite | null {
  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.fillStyle = ELEVATOR_BASE_COLOR;
  context.fillRect(0, 0, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  context.strokeStyle = ELEVATOR_EDGE_COLOR;
  context.lineWidth = 2;
  context.strokeRect(1, 1, LEGACY_TILE_SIZE - 2, LEGACY_TILE_SIZE - 2);
  context.fillStyle = ELEVATOR_PANEL_COLOR;
  context.fillRect(6, 14, LEGACY_TILE_SIZE - 12, LEGACY_TILE_SIZE - 28);
  context.font = "bold 12px 'Courier New', monospace";
  context.fillStyle = ELEVATOR_TEXT_COLOR;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("UP", LEGACY_TILE_SIZE / 2, LEGACY_TILE_SIZE / 2);

  return {
    image: canvas,
    offsetX: 0,
    offsetY: 0,
    transparent: false,
  };
}

function createHeldTrapSprite(tileset: LegacyTileset): LegacyTileSprite | null {
  const floorSprite = tileset.get(MS_TILE.Empty);
  const trapSprite = tileset.get(MS_TILE.Beartrap);
  if (!floorSprite || !trapSprite) {
    return null;
  }

  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  drawLegacySpriteImage(context, floorSprite, 0, 0);
  context.save();
  context.globalAlpha = HELD_TRAP_ALPHA;
  drawLegacySpriteImage(context, trapSprite, 0, 0);
  context.restore();

  return {
    image: canvas,
    offsetX: 0,
    offsetY: 0,
    transparent: false,
  };
}

function renderSpriteToCanvas(sprite: LegacyTileSprite): HTMLCanvasElement {
  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  drawLegacySpriteImage(context, sprite, 0, 0);
  return canvas;
}

function createThinWallOverlaySprite(tileset: LegacyTileset, tileId: number): LegacyTileSprite | null {
  const floorSprite = tileset.get(MS_TILE.Empty);
  const wallSprite = tileset.get(tileId);
  if (!floorSprite || !wallSprite) {
    return null;
  }

  const floorCanvas = renderSpriteToCanvas(floorSprite);
  const wallCanvas = renderSpriteToCanvas(wallSprite);
  const floorContext = floorCanvas.getContext("2d");
  const wallContext = wallCanvas.getContext("2d");
  if (!floorContext || !wallContext) {
    return null;
  }

  const floorData = floorContext.getImageData(0, 0, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const wallData = wallContext.getImageData(0, 0, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  for (let index = 0; index < wallData.data.length; index += 4) {
    if (
      wallData.data[index] === floorData.data[index] &&
      wallData.data[index + 1] === floorData.data[index + 1] &&
      wallData.data[index + 2] === floorData.data[index + 2] &&
      wallData.data[index + 3] === floorData.data[index + 3]
    ) {
      wallData.data[index + 3] = 0;
    }
  }

  wallContext.clearRect(0, 0, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  wallContext.putImageData(wallData, 0, 0);
  return {
    image: wallCanvas,
    offsetX: 0,
    offsetY: 0,
    transparent: true,
  };
}

export function getOrCreateHeldTrapSprite(tileset: LegacyTileset): LegacyTileSprite | null {
  const cache = legacyDerivedSpritesFor(tileset);
  if (cache.heldTrap === undefined) {
    cache.heldTrap = createHeldTrapSprite(tileset);
  }
  return cache.heldTrap;
}

export function getOrCreateThinWallOverlaySprite(tileset: LegacyTileset, tileId: number): LegacyTileSprite | null {
  const cache = legacyDerivedSpritesFor(tileset);
  if (!cache.thinWallOverlays) {
    cache.thinWallOverlays = new Map();
  }
  if (!cache.thinWallOverlays.has(tileId)) {
    cache.thinWallOverlays.set(tileId, createThinWallOverlaySprite(tileset, tileId));
  }
  return cache.thinWallOverlays.get(tileId) ?? null;
}

function getOrCreateElevatorSprite(tileset: LegacyTileset): LegacyTileSprite | null {
  const cache = legacyDerivedSpritesFor(tileset);
  if (cache.elevator === undefined) {
    cache.elevator = createElevatorSprite();
  }
  return cache.elevator;
}

export function createLegacyArtworkSpriteFromFrame(
  image: CanvasImageSource,
  frame: Readonly<ExpansionArtworkFrameRect>,
): LegacyTileSprite | null {
  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, 0, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  return {
    image: canvas,
    offsetX: 0,
    offsetY: 0,
    transparent: frame.transparent,
  };
}

export function applyLegacyTileOverrides(
  tileset: LegacyTileset,
  overrides: ReadonlyMap<number, LegacyTileSprite>,
): LegacyTileset {
  if (overrides.size === 0) {
    return tileset;
  }

  const overriddenCellCache = new Map<string, LegacyTileSprite>();
  const baseGetCell = tileset.getCell?.bind(tileset);
  const baseGetCellAnimationPeriod = tileset.getCellAnimationPeriod?.bind(tileset);

  return {
    ...tileset,
    get(tileId: number): LegacyTileSprite | null {
      return overrides.get(tileId) ?? tileset.get(tileId);
    },
    getCell(topId: number, bottomId: number, timerval: number): LegacyTileSprite | null {
      const overrideTop = overrides.get(topId);
      if (!overrideTop) {
        return baseGetCell?.(topId, bottomId, timerval) ?? null;
      }

      if (!overrideTop.transparent || bottomId === MS_TILE.Nothing || bottomId === MS_TILE.Air) {
        return overrideTop;
      }

      const animationPeriod = baseGetCellAnimationPeriod?.(MS_TILE.Empty, bottomId) ?? 1;
      const timeToken = animationPeriod <= 1 || timerval < 0 ? 0 : (timerval + 1) % animationPeriod;
      const cacheKey = `${topId}|${bottomId}|${timeToken}`;
      const cached = overriddenCellCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
      const context = canvas.getContext("2d");
      if (!context) {
        return overrideTop;
      }

      const bottomSprite =
        baseGetCell?.(MS_TILE.Empty, bottomId, timerval) ??
        (bottomId === MS_TILE.Empty ? tileset.get(MS_TILE.Empty) : tileset.get(bottomId));
      if (bottomSprite) {
        drawLegacySpriteImage(context, bottomSprite, 0, 0);
      }
      drawLegacySpriteImage(context, overrideTop, 0, 0);

      const sprite = {
        image: canvas,
        offsetX: 0,
        offsetY: 0,
        transparent: false,
      } satisfies LegacyTileSprite;
      overriddenCellCache.set(cacheKey, sprite);
      return sprite;
    },
    getCellAnimationPeriod(topId: number, bottomId: number): number {
      if (overrides.has(topId)) {
        return baseGetCellAnimationPeriod?.(MS_TILE.Empty, bottomId) ?? 1;
      }
      return baseGetCellAnimationPeriod?.(topId, bottomId) ?? 1;
    },
  };
}

function loadLegacyTileset(ruleset: LegacyTilesetRuleset): Promise<LegacyTileset> {
  const cached = legacyTilesetCache.get(ruleset);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = legacyTilesetPromiseCache.get(ruleset);
  if (pending) {
    return pending;
  }

  const nextPromise = new Promise<LegacyTileset>((resolve, reject) => {
    void Promise.all([loadLegacyImage(LEGACY_TILESET_URLS[ruleset]), loadLegacyImage(expandedArtworkUrl)])
      .then(([image, expandedArtworkImage]) => {
        try {
          const sandbagFrame = expansionArtworkFrameRect("sandbag");
          if (!sandbagFrame) {
            throw new Error("Missing sandbag frame in expansion artwork sheet");
          }

          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Unable to create legacy tileset canvas");
          }

          context.drawImage(image, 0, 0);
          const sandbagSprite = createLegacyArtworkSpriteFromFrame(expandedArtworkImage, sandbagFrame);
          const tileset = applyLegacyTileOverrides(
            buildLegacyTileset(canvas, ruleset),
            sandbagSprite ? new Map([[MS_TILE.Sandbag, sandbagSprite]]) : new Map(),
          );
          legacyTilesetCache.set(ruleset, tileset);
          resolve(tileset);
        } catch (error) {
          reject(error);
        }
      })
      .catch(reject);
  });

  legacyTilesetPromiseCache.set(ruleset, nextPromise);
  void nextPromise.catch(() => {
    legacyTilesetPromiseCache.delete(ruleset);
  });
  return nextPromise;
}

export function prewarmLegacyTileset(ruleset: LegacyTilesetRuleset): void {
  void loadLegacyTileset(ruleset).catch((error) => {
    console.error(`Failed to prewarm ${ruleset} legacy tileset`, error);
  });
}

export function useLegacyTileset(ruleset: LegacyTilesetRuleset | null): LegacyTileset | null {
  const [tileset, setTileset] = useState<LegacyTileset | null>(() =>
    ruleset ? legacyTilesetCache.get(ruleset) ?? null : null,
  );

  useEffect(() => {
    if (!ruleset) {
      setTileset(null);
      return;
    }

    let active = true;
    const cached = legacyTilesetCache.get(ruleset);
    if (cached) {
      setTileset(cached);
      return;
    }

    setTileset(null);
    void loadLegacyTileset(ruleset)
      .then((nextTileset) => {
        if (active) {
          setTileset(nextTileset);
        }
      })
      .catch((error) => {
        console.error("Failed to decode legacy tileset", error);
      });

    return () => {
      active = false;
    };
  }, [ruleset]);

  return tileset;
}

export function drawLegacyTile(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  tileId: number,
  x: number,
  y: number,
): void {
  if (tileId === MS_TILE.Nothing || tileId === MS_TILE.Air) {
    return;
  }

  if (tileId === MS_TILE.Elevator) {
    const elevatorSprite = getOrCreateElevatorSprite(tileset);
    if (elevatorSprite) {
      drawLegacySpriteImage(context, elevatorSprite, x, y);
    }
    return;
  }

  const sprite = tileset.get(tileId);
  if (sprite) {
    drawLegacySpriteImage(context, sprite, x, y);
  }
}
