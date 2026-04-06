import { useEffect, useState } from "react";
import lynxTilesUrl from "@res/atiles.bmp?url";
import msTilesUrl from "@res/tiles.bmp?url";
import expandedArtworkUrl from "@res/expansion_artwork/expanded.png?url";
import type {
  InteractiveGamePetCarrierRender,
  InteractiveGameRenderSprite,
} from "@game-core/api/interactive";
import { expansionArtworkFrameRect, type ExpansionArtworkFrameRect } from "@player-web/impl/expansionArtwork";
import { measurePerfAsync, measurePerfSync } from "@player-web/impl/runtimePerf";
import { buildLegacyTileset, type LegacyTileSprite, type LegacyTileset } from "@player-web/impl/legacyTileset";
import { LEGACY_TILE_SIZE } from "@player-web/impl/legacySprites";
import { createCanvas, drawLegacySpriteImage, loadLegacyImage } from "@player-web/impl/legacyCanvasShared";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

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
  occupiedPetCarriers?: Map<string, LegacyTileSprite | null>;
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

function petCarrierOccupantFacingDir(tileId: number): number {
  return tileId === MS_TILE.Teeth ? MS_DIRECTION.south : MS_DIRECTION.north;
}

function normalizePetCarrierRenderSprite(
  visual: InteractiveGameRenderSprite,
): InteractiveGameRenderSprite {
  const nestedRender = visual.petCarrierRender ? normalizePetCarrierRender(visual.petCarrierRender) : undefined;

  if (visual.kind === "creature") {
    return {
      kind: "creature",
      tileId: visual.tileId,
      artworkSpriteId: visual.artworkSpriteId,
      dir: petCarrierOccupantFacingDir(visual.tileId),
      petCarrierRender: nestedRender,
    };
  }

  return {
    kind: "tile",
    tileId: visual.tileId,
    artworkSpriteId: visual.artworkSpriteId,
    petCarrierRender: nestedRender,
  };
}

function normalizePetCarrierRender(
  render: InteractiveGamePetCarrierRender,
): InteractiveGamePetCarrierRender {
  return {
    baseTileId: render.baseTileId,
    occupant: normalizePetCarrierRenderSprite(render.occupant),
  };
}

function petCarrierRenderCacheKey(render: InteractiveGamePetCarrierRender): string {
  const normalized = normalizePetCarrierRender(render);
  const occupant = normalized.occupant;
  return [
    normalized.baseTileId,
    occupant.kind,
    occupant.tileId,
    occupant.artworkSpriteId ?? "",
    occupant.dir ?? 0,
    occupant.petCarrierRender ? petCarrierRenderCacheKey(occupant.petCarrierRender) : "",
  ].join(":");
}

function resolveLegacyRenderSprite(
  tileset: LegacyTileset,
  visual: InteractiveGameRenderSprite,
): LegacyTileSprite | null {
  if (visual.petCarrierRender) {
    return getOrCreateOccupiedPetCarrierSprite(tileset, visual.petCarrierRender, 0);
  }

  const artworkSprite = visual.artworkSpriteId ? tileset.getArtworkSprite?.(visual.artworkSpriteId) ?? null : null;
  if (artworkSprite) {
    return artworkSprite;
  }

  if (visual.kind === "tile") {
    return tileset.get(visual.tileId);
  }

  if (tileset.getCreature) {
    return tileset.getCreature(
      visual.tileId,
      visual.dir ?? MS_DIRECTION.north,
      visual.moving ?? 0,
      visual.frame ?? 0,
    );
  }

  return tileset.get(msCreatureTile(visual.tileId, visual.dir ?? MS_DIRECTION.north));
}

function createOccupiedPetCarrierSprite(
  tileset: LegacyTileset,
  render: InteractiveGamePetCarrierRender,
  timerval: number,
): LegacyTileSprite | null {
  const normalizedRender = normalizePetCarrierRender(render);
  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const emptyFloorSprite = tileset.get(MS_TILE.Empty);
  const baseSprite =
    (normalizedRender.baseTileId !== MS_TILE.Empty
      ? tileset.getCell?.(normalizedRender.baseTileId, MS_TILE.Empty, timerval)
      : null) ??
    tileset.get(normalizedRender.baseTileId);
  const occupantSprite = resolveLegacyRenderSprite(tileset, normalizedRender.occupant);
  const carrierSprite = tileset.getArtworkSprite?.("pet_carrier") ?? tileset.get(MS_TILE.PetCarrier);

  if (!baseSprite && !occupantSprite && !carrierSprite) {
    return null;
  }

  if (emptyFloorSprite && shouldDrawSyntheticFloorBehindTransparentSprite(baseSprite ?? null)) {
    drawLegacySpriteImage(context, emptyFloorSprite, 0, 0);
  }
  if (baseSprite) {
    drawLegacySpriteImage(context, baseSprite, 0, 0);
  }
  if (occupantSprite) {
    drawLegacySpriteImage(context, occupantSprite, 0, 0);
  }
  if (carrierSprite) {
    drawLegacySpriteImage(context, carrierSprite, 0, 0);
  }

  return {
    image: canvas,
    offsetX: 0,
    offsetY: 0,
    transparent: false,
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

export function getOrCreateOccupiedPetCarrierSprite(
  tileset: LegacyTileset,
  render: InteractiveGamePetCarrierRender,
  timerval = 0,
): LegacyTileSprite | null {
  const cache = legacyDerivedSpritesFor(tileset);
  if (!cache.occupiedPetCarriers) {
    cache.occupiedPetCarriers = new Map();
  }

  const animationPeriod = tileset.getCellAnimationPeriod?.(MS_TILE.Empty, render.baseTileId) ?? 1;
  const timeToken = animationPeriod <= 1 || timerval < 0 ? 0 : (timerval + 1) % animationPeriod;
  const cacheKey = `${render.baseTileId}|${timeToken}|${petCarrierRenderCacheKey(render)}`;
  if (!cache.occupiedPetCarriers.has(cacheKey)) {
    cache.occupiedPetCarriers.set(cacheKey, createOccupiedPetCarrierSprite(tileset, render, timerval));
  }
  return cache.occupiedPetCarriers.get(cacheKey) ?? null;
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
    preserveLayerTransparency: frame.preserveLayerTransparency,
  };
}

function shouldDrawSyntheticFloorBehindTransparentSprite(sprite: LegacyTileSprite | null): boolean {
  return sprite?.transparent === true && sprite.preserveLayerTransparency !== true;
}

export function createLegacyExpansionArtworkOverrides(
  image: CanvasImageSource,
): ReadonlyMap<number, LegacyTileSprite> {
  const overrides = new Map<number, LegacyTileSprite>();
  const artworkSprites = createLegacyExpansionArtworkSprites(image);
  const sandbagSprite = artworkSprites.get("sandbag") ?? null;
  const hookSprite = artworkSprites.get("hook") ?? null;
  const petCarrierSprite = artworkSprites.get("pet_carrier") ?? null;
  const bowlingBallMovingSprite = artworkSprites.get("bowling_ball_moving") ?? null;
  const bowlingBallStillSprite = artworkSprites.get("bowling_ball_still") ?? null;
  const cloudSprite = artworkSprites.get("cloud") ?? null;
  const iceBlockSprite = artworkSprites.get("ice_block") ?? null;

  if (sandbagSprite) {
    overrides.set(MS_TILE.Sandbag, sandbagSprite);
  }
  if (hookSprite) {
    overrides.set(MS_TILE.Hook, hookSprite);
  }
  if (petCarrierSprite) {
    overrides.set(MS_TILE.PetCarrier, petCarrierSprite);
  }
  if (bowlingBallMovingSprite) {
    for (const dir of [MS_DIRECTION.north, MS_DIRECTION.west, MS_DIRECTION.south, MS_DIRECTION.east] as const) {
      overrides.set(msCreatureTile(MS_TILE.BowlingBall, dir), bowlingBallMovingSprite);
    }
  }
  if (bowlingBallStillSprite) {
    overrides.set(MS_TILE.BowlingBall_Still, bowlingBallStillSprite);
  }
  if (cloudSprite) {
    overrides.set(MS_TILE.Cloud, cloudSprite);
  }
  if (iceBlockSprite) {
    overrides.set(MS_TILE.IceBlock_Static, iceBlockSprite);
    for (const dir of [MS_DIRECTION.north, MS_DIRECTION.west, MS_DIRECTION.south, MS_DIRECTION.east] as const) {
      overrides.set(msCreatureTile(MS_TILE.IceBlock, dir), iceBlockSprite);
    }
  }

  return overrides;
}

export function createLegacyExpansionArtworkSprites(
  image: CanvasImageSource,
): ReadonlyMap<string, LegacyTileSprite> {
  const sprites = new Map<string, LegacyTileSprite>();
  for (const spriteId of [
    "sandbag",
    "bowling_ball_moving",
    "bowling_ball_still",
    "cloud",
    "hook",
    "ice_block",
    "pet_carrier",
  ] as const) {
    const frame = expansionArtworkFrameRect(spriteId);
    const sprite = frame ? createLegacyArtworkSpriteFromFrame(image, frame) : null;
    if (sprite) {
      sprites.set(spriteId, sprite);
    }
  }
  return sprites;
}

export function applyLegacyTileOverrides(
  tileset: LegacyTileset,
  overrides: ReadonlyMap<number, LegacyTileSprite>,
  artworkSprites: ReadonlyMap<string, LegacyTileSprite> = new Map(),
): LegacyTileset {
  if (overrides.size === 0 && artworkSprites.size === 0) {
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
    getArtworkSprite(spriteId: string): LegacyTileSprite | null {
      return artworkSprites.get(spriteId) ?? tileset.getArtworkSprite?.(spriteId) ?? null;
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

      const emptyFloorSprite = tileset.get(MS_TILE.Empty);
      const bottomSprite =
        (bottomId !== MS_TILE.Empty ? baseGetCell?.(bottomId, MS_TILE.Empty, timerval) : null) ??
        (bottomId === MS_TILE.Empty ? tileset.get(MS_TILE.Empty) : tileset.get(bottomId));
      if (emptyFloorSprite && shouldDrawSyntheticFloorBehindTransparentSprite(bottomSprite ?? null)) {
        drawLegacySpriteImage(context, emptyFloorSprite, 0, 0);
      }
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

  const nextPromise = measurePerfAsync("tilesetLoadMs", async () => {
    const [image, expandedArtworkImage] = await measurePerfAsync("tilesetImageLoadMs", () =>
      Promise.all([
        loadLegacyImage(LEGACY_TILESET_URLS[ruleset]),
        loadLegacyImage(expandedArtworkUrl),
      ]),
    );
    const tileset = measurePerfSync("tilesetBuildMs", () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to create legacy tileset canvas");
      }

      context.drawImage(image, 0, 0);
      const artworkSprites = createLegacyExpansionArtworkSprites(expandedArtworkImage);
      return applyLegacyTileOverrides(
        buildLegacyTileset(canvas, ruleset),
        createLegacyExpansionArtworkOverrides(expandedArtworkImage),
        artworkSprites,
      );
    });
    legacyTilesetCache.set(ruleset, tileset);
    return tileset;
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
