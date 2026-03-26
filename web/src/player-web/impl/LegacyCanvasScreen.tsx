import { useEffect, useEffectEvent, useRef, useState } from "react";
import lynxTilesUrl from "@res/atiles.bmp?url";
import msTilesUrl from "@res/tiles.bmp?url";
import sandbagUrl from "@res/expansion_artwork/sandbag.png?url";
import {
  isDefaultLegacyRenderTileSize,
  legacyMapPixelsForTileSize,
  type LegacyRenderTileSize,
} from "@player-web/impl/legacyRenderPresets";
import { buildLegacyTileset, type LegacyTileSprite, type LegacyTileset } from "@player-web/impl/legacyTileset";
import { measurePerfSync } from "@player-web/impl/runtimePerf";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type {
  InteractiveGameRenderFrame,
  InteractiveGameTileOverlay,
  InteractiveGameVisibleLayer,
} from "@game-core/api/interactive";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import type { GameSnapshot } from "@game-core/api/types";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { MS_DIRECTION, MS_FLOOR_STATE, MS_STATUS_FLAG, MS_TILE, isMsCreature, msCreatureId, msCreatureTile } from "@ruleset-ms/api/tiles";
import { TIME_NIL } from "@content/api/score";
import {
  LEGACY_INFO_X,
  LEGACY_MAP_HEIGHT,
  LEGACY_MAP_TILES,
  LEGACY_MAP_WIDTH,
  LEGACY_MAP_X,
  LEGACY_MAP_Y,
  LEGACY_MARGIN,
  LEGACY_TILE_SIZE,
  LEGACY_TITLE_Y,
  LEGACY_WINDOW_HEIGHT,
  LEGACY_WINDOW_WIDTH,
} from "@player-web/impl/legacySprites";

export type LegacyMode = "series-list" | "game";
export type LegacyCanvasPresentation = "legacy" | "map-only";

interface LegacyCanvasScreenProps {
  className?: string;
  mode: LegacyMode;
  presentation?: LegacyCanvasPresentation;
  catalog: SeriesCatalogEntry[];
  selectedSeriesFile: string | null;
  currentSeries: SeriesCatalogEntry | null;
  currentLevel: SeriesLevel | null;
  currentRuleset: SeriesCatalogEntry["ruleset"] | null;
  session: InteractiveGameSession | null;
  liveSessionRef?: Readonly<{ current: InteractiveGameSession | null }>;
  isLoading: boolean;
  message: string | null;
  onSelectSeries: (seriesFile: string) => void;
  onActivateSeries: (seriesFile: string) => void;
  onMapClick?: (position: number) => void;
  onDatDrop?: (files: File[]) => void;
  renderTileSize?: LegacyRenderTileSize;
  visualEnhancementsEnabled?: boolean;
}

const COLORS = {
  background: "#000000",
  text: "#ffffff",
  dim: "#c0c0c0",
  highlight: "#ffff00",
};

const FONT = "16px 'Courier New', monospace";
const SMALL_FONT = "14px 'Courier New', monospace";
const INVENTORY_COUNT_FONT = "bold 14px 'Courier New', monospace";
const LIST_HEADER_Y = LEGACY_MARGIN + 8;
const LIST_FIRST_ROW_Y = LIST_HEADER_Y + 24;
const LIST_ROW_HEIGHT = 18;
const LIST_VISIBLE_ROWS = Math.max(1, Math.floor((LEGACY_TITLE_Y - LIST_FIRST_ROW_Y - LEGACY_MARGIN) / LIST_ROW_HEIGHT));
const FILE_COLUMN_X = LEGACY_MARGIN;
const RULESET_COLUMN_X = 520;
const LOWER_LAYER_SCALE = 0.9;
const LOWER_LAYER_BLUR_PX = 1;
const LOWER_LAYER_DARKEN_PER_DEPTH = 0.25;
const MAX_CACHED_LOWER_LAYER_DEPTH = 3;
const INITIAL_RENDER_PREWARM_TICK_COUNT = 4;
const LAYER_CANVAS_PADDING_TILES = Math.ceil((layerViewportTileWindow(MAX_CACHED_LOWER_LAYER_DEPTH) - LEGACY_MAP_TILES) / 2);
const LAYER_CANVAS_PADDING_PX = LAYER_CANVAS_PADDING_TILES * LEGACY_TILE_SIZE;
const LAYER_CANVAS_BOARD_SIZE = 32 * LEGACY_TILE_SIZE + LAYER_CANVAS_PADDING_PX * 2;
const MAX_LAYER_CANVAS_CACHE_ENTRIES = 16;
const SUPPORT_BORDER_COLOR = "#2c8cff";
const ELEVATOR_FAILURE_BORDER_COLOR = "#ff4040";
const ELEVATOR_BASE_COLOR = "#2f9f4a";
const ELEVATOR_EDGE_COLOR = "#0e401d";
const ELEVATOR_PANEL_COLOR = "#154d23";
const ELEVATOR_TEXT_COLOR = "#d9ffd7";
const HELD_TRAP_ALPHA = 0.5;
const CARRIED_TOOL_ALPHA = 0.25;
const VISUAL_ENHANCEMENT_ARROW_COLOR = "#000000";
const BLOCK_SUPPORT_WINDOW_SOLID_BORDER_PX = 4;
const BLOCK_SUPPORT_WINDOW_TRANSPARENT_CENTER_SIZE = 8;
type LegacyTilesetRuleset = "MS" | "Lynx";

const LEGACY_TILESET_URLS: Record<LegacyTilesetRuleset, string> = {
  MS: msTilesUrl,
  Lynx: lynxTilesUrl,
};

const legacyTilesetCache = new Map<LegacyTilesetRuleset, LegacyTileset>();
const legacyTilesetPromiseCache = new Map<LegacyTilesetRuleset, Promise<LegacyTileset>>();
let blockSupportWindowMaskCanvas: HTMLCanvasElement | null | undefined;

interface LegacyDerivedSpriteCache {
  elevator?: LegacyTileSprite | null;
  heldTrap?: LegacyTileSprite | null;
  thinWallOverlays?: Map<number, LegacyTileSprite | null>;
}

const legacyDerivedSpriteCache = new WeakMap<LegacyTileset, LegacyDerivedSpriteCache>();

interface LegacyLayerCanvasCacheEntry {
  key: string;
  canvas: HTMLCanvasElement;
}

interface LegacyLayerCanvasCache {
  entries: Map<string, LegacyLayerCanvasCacheEntry>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
}

function drawLegacySpriteImage(
  context: CanvasRenderingContext2D,
  sprite: LegacyTileSprite,
  x: number,
  y: number,
): void {
  context.drawImage(sprite.image, x + sprite.offsetX, y + sprite.offsetY);
}

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

function getOrCreateElevatorSprite(tileset: LegacyTileset): LegacyTileSprite | null {
  const cache = legacyDerivedSpritesFor(tileset);
  if (cache.elevator === undefined) {
    cache.elevator = createElevatorSprite();
  }
  return cache.elevator;
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

function getOrCreateHeldTrapSprite(tileset: LegacyTileset): LegacyTileSprite | null {
  const cache = legacyDerivedSpritesFor(tileset);
  if (cache.heldTrap === undefined) {
    cache.heldTrap = createHeldTrapSprite(tileset);
  }
  return cache.heldTrap;
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

function getOrCreateThinWallOverlaySprite(tileset: LegacyTileset, tileId: number): LegacyTileSprite | null {
  const cache = legacyDerivedSpritesFor(tileset);
  if (!cache.thinWallOverlays) {
    cache.thinWallOverlays = new Map();
  }
  if (!cache.thinWallOverlays.has(tileId)) {
    cache.thinWallOverlays.set(tileId, createThinWallOverlaySprite(tileset, tileId));
  }
  return cache.thinWallOverlays.get(tileId) ?? null;
}

function loadLegacyImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = url;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image asset: ${url}`));
  });
}

function createLegacyArtworkSprite(image: CanvasImageSource): LegacyTileSprite | null {
  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  return {
    image: canvas,
    offsetX: 0,
    offsetY: 0,
    transparent: true,
  };
}

function applyLegacyTileOverrides(
  tileset: LegacyTileset,
  overrides: ReadonlyMap<number, LegacyTileSprite>,
): LegacyTileset {
  if (overrides.size === 0) {
    return tileset;
  }

  return {
    ...tileset,
    get(tileId: number): LegacyTileSprite | null {
      return overrides.get(tileId) ?? tileset.get(tileId);
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
    void Promise.all([loadLegacyImage(LEGACY_TILESET_URLS[ruleset]), loadLegacyImage(sandbagUrl)])
      .then(([image, sandbagImage]) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Unable to create legacy tileset canvas");
        }

        context.drawImage(image, 0, 0);
        const sandbagSprite = createLegacyArtworkSprite(sandbagImage);
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

function createLayerCanvasCache(): LegacyLayerCanvasCache {
  return {
    entries: new Map(),
  };
}

function clearLayerCanvasCache(cache: LegacyLayerCanvasCache): void {
  cache.entries.clear();
}

function getCachedLayerCanvas(cache: LegacyLayerCanvasCache, key: string): HTMLCanvasElement | null {
  const cached = cache.entries.get(key);
  if (!cached) {
    return null;
  }

  cache.entries.delete(key);
  cache.entries.set(key, cached);
  return cached.canvas;
}

function storeCachedLayerCanvas(cache: LegacyLayerCanvasCache, key: string, canvas: HTMLCanvasElement): HTMLCanvasElement {
  cache.entries.set(key, { key, canvas });
  while (cache.entries.size > MAX_LAYER_CANVAS_CACHE_ENTRIES) {
    const oldestKey = cache.entries.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    cache.entries.delete(oldestKey);
  }
  return canvas;
}

function hashLayerValue(hash: number, value: number): number {
  let next = hash ^ (value & 0xff_ff_ff_ff);
  next = Math.imul(next, 0x01_00_01_93);
  return next >>> 0;
}

function buildVisibleLayerCellsSummary(
  tileset: LegacyTileset,
  layer: InteractiveGameVisibleLayer,
): { hash: number; animationPeriod: number } {
  let hash = 0x81_1c_9d_c5;
  let animationPeriod = 1;

  for (const cell of layer.cells) {
    hash = hashLayerValue(hash, cell.top.id);
    hash = hashLayerValue(hash, cell.top.state);
    hash = hashLayerValue(hash, cell.bottom.id);
    hash = hashLayerValue(hash, cell.bottom.state);
    animationPeriod = Math.max(animationPeriod, tileset.getCellAnimationPeriod?.(cell.top.id, cell.bottom.id) ?? 1);
  }

  return { hash, animationPeriod };
}

function buildLayerOverlayHash(overlays: ReadonlyArray<InteractiveGameTileOverlay>, targetZ: number): number {
  let hash = 0x81_1c_9d_c5;
  for (const overlay of overlays) {
    if (overlay.z !== targetZ) {
      continue;
    }
    const kindCode =
      overlay.kind === "support"
        ? 1
        : overlay.kind === "elevator-failure"
          ? 2
          : overlay.kind === "hidden-wall-reveal"
            ? 3
            : overlay.kind === "blue-wall-reveal"
              ? 4
              : overlay.kind === "push-pickup-reveal"
                ? 5
                : 6;
    hash = hashLayerValue(hash, overlay.pos);
    hash = hashLayerValue(hash, kindCode);
    hash = hashLayerValue(hash, overlay.tileId ?? 0);
  }
  return hash >>> 0;
}

function buildPickupRevealOverlayTileIds(
  overlays: ReadonlyArray<InteractiveGameTileOverlay>,
  targetZ: number,
  visualEnhancementsEnabled: boolean,
): Map<number, number> {
  const pickupRevealTileIds = new Map<number, number>();
  if (!visualEnhancementsEnabled) {
    return pickupRevealTileIds;
  }

  for (const overlay of overlays) {
    if (overlay.z !== targetZ || overlay.kind !== "push-pickup-reveal" || typeof overlay.tileId !== "number") {
      continue;
    }
    pickupRevealTileIds.set(overlay.pos, overlay.tileId);
  }

  return pickupRevealTileIds;
}

function buildRenderLayerHash(session: InteractiveGameSession, targetZ: number): number {
  const render = session.frame.render;
  if (!render) {
    return 0;
  }

  let hash = 0x81_1c_9d_c5;
  const chip = render.chip;
  if (chip && (chip.z ?? 1) === targetZ) {
    hash = hashLayerValue(hash, chip.pos);
    hash = hashLayerValue(hash, chip.dir);
    hash = hashLayerValue(hash, chip.moving);
    hash = hashLayerValue(hash, chip.pushing ? 1 : 0);
    hash = hashLayerValue(hash, chip.hidden ? 1 : 0);
    hash = hashLayerValue(hash, chip.failed ? 1 : 0);
    hash = hashLayerValue(hash, chip.endGameAnimationTileId ?? 0);
    hash = hashLayerValue(hash, chip.endGameAnimationFrame ?? 0);
    hash = hashLayerValue(hash, Math.round((chip.scale ?? 1) * 1000));
  }

  for (const actor of render.actors) {
    if ((actor.z ?? 1) !== targetZ) {
      continue;
    }
    hash = hashLayerValue(hash, actor.id);
    hash = hashLayerValue(hash, actor.pos);
    hash = hashLayerValue(hash, actor.dir);
    hash = hashLayerValue(hash, actor.moving);
    hash = hashLayerValue(hash, actor.frame);
    hash = hashLayerValue(hash, actor.hidden ? 1 : 0);
    hash = hashLayerValue(hash, actor.animationReserved ? 1 : 0);
    hash = hashLayerValue(hash, Math.round((actor.scale ?? 1) * 1000));
  }

  for (const animation of render.animations) {
    if ((animation.z ?? chip?.z ?? 1) !== targetZ) {
      continue;
    }
    hash = hashLayerValue(hash, animation.pos);
    hash = hashLayerValue(hash, animation.frame);
    hash = hashLayerValue(hash, animation.tileId);
  }

  return hash >>> 0;
}

function animationFrameToken(animationPeriod: number, timerval: number): number {
  if (animationPeriod <= 1 || timerval < 0) {
    return 0;
  }
  return (timerval + 1) % animationPeriod;
}

function buildCachedLowerLayerKey(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): string {
  const cellsSummary = buildVisibleLayerCellsSummary(tileset, layer);
  const overlayHash = buildLayerOverlayHash(session.frame.tileOverlays, layer.z);
  const renderHash = buildRenderLayerHash(session, layer.z);
  const timeToken = animationFrameToken(cellsSummary.animationPeriod, timerval);
  return `${ruleset ?? "None"}:${visualEnhancementsEnabled ? 1 : 0}:${layer.z}:${cellsSummary.hash.toString(16)}:${timeToken}:${overlayHash.toString(16)}:${renderHash.toString(16)}`;
}

function formatLevelTimeLeft(session: InteractiveGameSession): string {
  const { timelimit, currentTime } = session.frame.snapshot;
  if (timelimit <= 0) {
    return "---";
  }

  const remainingTicks = Math.max(0, timelimit - Math.max(currentTime, 0));
  return String(Math.ceil(remainingTicks / 20));
}

function formatBestTime(level: SeriesLevel | null): string | null {
  if (!level || level.bestTimeTicks <= 0 || level.bestTimeTicks === TIME_NIL) {
    return null;
  }

  return String(Math.ceil(level.bestTimeTicks / 20));
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign = "left",
  font = FONT,
): void {
  context.font = font;
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = "top";
  context.fillText(text, x, y);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  color: string,
  center = false,
): void {
  context.font = FONT;
  context.fillStyle = color;
  context.textAlign = center ? "center" : "left";
  context.textBaseline = "top";

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= width || line.length === 0) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  lines.forEach((entry, index) => {
    context.fillText(entry, center ? x + width / 2 : x, y + index * 18);
  });
}

function clampSeriesScrollOffset(offset: number, itemCount: number): number {
  return clamp(offset, 0, Math.max(0, itemCount - LIST_VISIBLE_ROWS));
}

function ensureSeriesVisible(offset: number, selectedIndex: number, itemCount: number): number {
  const clampedOffset = clampSeriesScrollOffset(offset, itemCount);
  if (selectedIndex < 0 || selectedIndex >= itemCount) {
    return clampedOffset;
  }
  if (selectedIndex < clampedOffset) {
    return selectedIndex;
  }
  if (selectedIndex >= clampedOffset + LIST_VISIBLE_ROWS) {
    return clampSeriesScrollOffset(selectedIndex - LIST_VISIBLE_ROWS + 1, itemCount);
  }
  return clampedOffset;
}

function seriesIndexAt(y: number, itemCount: number, scrollOffset: number): number {
  if (y < LIST_FIRST_ROW_Y) {
    return -1;
  }

  const visibleIndex = Math.floor((y - LIST_FIRST_ROW_Y) / LIST_ROW_HEIGHT);
  if (visibleIndex < 0 || visibleIndex >= LIST_VISIBLE_ROWS) {
    return -1;
  }

  const index = scrollOffset + visibleIndex;
  return index >= 0 && index < itemCount ? index : -1;
}

function mapPositionAtCanvasPoint(
  session: InteractiveGameSession,
  canvasX: number,
  canvasY: number,
): number | null {
  if (
    canvasX < LEGACY_MAP_X ||
    canvasY < LEGACY_MAP_Y ||
    canvasX >= LEGACY_MAP_X + LEGACY_MAP_WIDTH ||
    canvasY >= LEGACY_MAP_Y + LEGACY_MAP_HEIGHT
  ) {
    return null;
  }

  const viewX = clamp(
    session.frame.snapshot.view.x / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4),
    0,
    (32 - LEGACY_MAP_TILES) * 4,
  );
  const viewY = clamp(
    session.frame.snapshot.view.y / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4),
    0,
    (32 - LEGACY_MAP_TILES) * 4,
  );
  const xOrigin = LEGACY_MAP_X - (viewX * LEGACY_TILE_SIZE) / 4;
  const yOrigin = LEGACY_MAP_Y - (viewY * LEGACY_TILE_SIZE) / 4;
  const tileX = Math.floor((canvasX - xOrigin) / LEGACY_TILE_SIZE);
  const tileY = Math.floor((canvasY - yOrigin) / LEGACY_TILE_SIZE);

  if (tileX < 0 || tileX >= 32 || tileY < 0 || tileY >= 32) {
    return null;
  }

  return tileY * 32 + tileX;
}

function drawSprite(
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
  if (!sprite) {
    return;
  }

  drawLegacySpriteImage(context, sprite, x, y);
}

function drawLynxActorSprite(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  actorId: number,
  dir: number,
  moving: number,
  frame: number,
  x: number,
  y: number,
  scale = 1,
): void {
  if (!tileset.getCreature) {
    return;
  }

  const sprite = tileset.getCreature(actorId, dir, moving, frame);
  if (!sprite) {
    return;
  }

  const drawX = x + sprite.offsetX;
  const drawY = y + sprite.offsetY;
  if (Math.abs(scale - 1) < 0.001) {
    context.drawImage(sprite.image, drawX, drawY);
    return;
  }

  context.save();
  context.translate(drawX + sprite.image.width / 2, drawY + sprite.image.height / 2);
  context.scale(scale, scale);
  context.drawImage(sprite.image, -sprite.image.width / 2, -sprite.image.height / 2);
  context.restore();
}

function drawLynxActorOverlays(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  xOrigin: number,
  yOrigin: number,
  targetZ: number,
): void {
  const render = session.frame.render;
  if (!render) {
    return;
  }

  drawProjectedLynxRender(context, tileset, render, xOrigin, yOrigin, targetZ);
}

function visualEnhancementActorId(tileId: number): number | null {
  if (tileId === MS_TILE.Block_Static) {
    return MS_TILE.Block;
  }
  return isMsCreature(tileId) ? msCreatureId(tileId) : null;
}

function visualEnhancementActorTileId(actorId: number, topId: number, bottomId: number): number {
  if (visualEnhancementActorId(topId) === actorId) {
    return topId;
  }
  if (visualEnhancementActorId(bottomId) === actorId) {
    return bottomId;
  }
  return actorId;
}

function visualEnhancementSupportFloorId(topId: number, bottomId: number): number | null {
  if (topId === MS_TILE.Beartrap || topId === MS_TILE.CloneMachine) {
    return topId;
  }
  if (bottomId === MS_TILE.Beartrap || bottomId === MS_TILE.CloneMachine) {
    return bottomId;
  }
  return null;
}

export function isThinWallTileId(tileId: number): boolean {
  return (
    tileId === MS_TILE.Wall_North ||
    tileId === MS_TILE.Wall_West ||
    tileId === MS_TILE.Wall_South ||
    tileId === MS_TILE.Wall_East ||
    tileId === MS_TILE.Wall_Southeast
  );
}

export function visualEnhancementActorMarker(
  actorId: number,
  topId: number,
  bottomId: number,
): { floorId: number; showBlockWindow: boolean } | null {
  if (
    actorId !== MS_TILE.Block &&
    actorId !== MS_TILE.Blob &&
    actorId !== MS_TILE.Ball &&
    actorId !== MS_TILE.Walker &&
    actorId !== MS_TILE.Paramecium
  ) {
    return null;
  }

  const floorId = visualEnhancementSupportFloorId(topId, bottomId);
  if (floorId === null) {
    return null;
  }

  return {
    floorId,
    showBlockWindow: actorId === MS_TILE.Block,
  };
}

export function visualEnhancementThinWallOverlayTileId(
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  topId: number,
  bottomId: number,
): number | null {
  if (
    (ruleset !== "MS" && ruleset !== "Lynx") ||
    visualEnhancementActorId(topId) !== MS_TILE.Block ||
    !isThinWallTileId(bottomId)
  ) {
    return null;
  }

  return bottomId;
}

export function visualEnhancementThinWallActorPassTileId(
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  actorId: number,
  topId: number,
  bottomId: number,
): number | null {
  if (ruleset !== "Lynx" || actorId !== MS_TILE.Block) {
    return null;
  }

  if (isThinWallTileId(topId)) {
    return topId;
  }

  if (isThinWallTileId(bottomId)) {
    return bottomId;
  }

  return null;
}

export function shouldUseLegacyCombinedCellSprite(
  topId: number,
  bottomId: number,
  pickupRevealTileId: number | null,
  thinWallOverlayTileId: number | null,
): boolean {
  return (
    thinWallOverlayTileId === null &&
    pickupRevealTileId === null &&
    topId !== MS_TILE.Air &&
    bottomId !== MS_TILE.Air &&
    topId !== MS_TILE.Elevator &&
    bottomId !== MS_TILE.Elevator
  );
}

export function visualEnhancementBlockWindowOpacity(squareDistanceFromCenterPx: number): number {
  const transparentHalfSize = BLOCK_SUPPORT_WINDOW_TRANSPARENT_CENTER_SIZE / 2;
  const solidStartDistance = LEGACY_TILE_SIZE / 2 - BLOCK_SUPPORT_WINDOW_SOLID_BORDER_PX;
  const clampedDistance = clamp(squareDistanceFromCenterPx, transparentHalfSize, solidStartDistance);
  return (clampedDistance - transparentHalfSize) / (solidStartDistance - transparentHalfSize);
}

function createBlockSupportWindowMask(): HTMLCanvasElement | null {
  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const imageData = context.createImageData(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const halfSize = LEGACY_TILE_SIZE / 2;

  for (let y = 0; y < LEGACY_TILE_SIZE; y += 1) {
    for (let x = 0; x < LEGACY_TILE_SIZE; x += 1) {
      const squareDistance = Math.max(Math.abs(x + 0.5 - halfSize), Math.abs(y + 0.5 - halfSize));
      const blockOpacity = visualEnhancementBlockWindowOpacity(squareDistance);
      const eraseAlpha = 1 - blockOpacity;
      const pixelIndex = (y * LEGACY_TILE_SIZE + x) * 4;
      imageData.data[pixelIndex + 3] = Math.round(eraseAlpha * 255);
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function getOrCreateBlockSupportWindowMask(): HTMLCanvasElement | null {
  if (blockSupportWindowMaskCanvas === undefined) {
    blockSupportWindowMaskCanvas = createBlockSupportWindowMask();
  }
  return blockSupportWindowMaskCanvas;
}

function drawVisualEnhancementArrow(
  context: Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "fillStyle">,
  dir: number,
  x: number,
  y: number,
): void {
  const centerX = x + LEGACY_TILE_SIZE / 2;
  const centerY = y + LEGACY_TILE_SIZE / 2;
  const tipInset = 4;
  const baseInset = 11;
  const halfBase = 4;

  switch (dir) {
    case MS_DIRECTION.north:
      context.beginPath();
      context.moveTo(centerX, y + tipInset);
      context.lineTo(centerX - halfBase, y + baseInset);
      context.lineTo(centerX + halfBase, y + baseInset);
      break;
    case MS_DIRECTION.south:
      context.beginPath();
      context.moveTo(centerX, y + LEGACY_TILE_SIZE - tipInset);
      context.lineTo(centerX - halfBase, y + LEGACY_TILE_SIZE - baseInset);
      context.lineTo(centerX + halfBase, y + LEGACY_TILE_SIZE - baseInset);
      break;
    case MS_DIRECTION.west:
      context.beginPath();
      context.moveTo(x + tipInset, centerY);
      context.lineTo(x + baseInset, centerY - halfBase);
      context.lineTo(x + baseInset, centerY + halfBase);
      break;
    case MS_DIRECTION.east:
      context.beginPath();
      context.moveTo(x + LEGACY_TILE_SIZE - tipInset, centerY);
      context.lineTo(x + LEGACY_TILE_SIZE - baseInset, centerY - halfBase);
      context.lineTo(x + LEGACY_TILE_SIZE - baseInset, centerY + halfBase);
      break;
    default:
      return;
  }

  context.closePath();
  context.fillStyle = VISUAL_ENHANCEMENT_ARROW_COLOR;
  context.fill();
}

function drawVisualEnhancementSupportWindow(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  actorTileId: number,
  floorId: number,
  x: number,
  y: number,
): void {
  const maskCanvas = getOrCreateBlockSupportWindowMask();
  const blockCanvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const blockContext = blockCanvas.getContext("2d");
  if (!blockContext || !maskCanvas) {
    drawSprite(context, tileset, floorId, x, y);
    drawSprite(context, tileset, actorTileId, x, y);
    return;
  }

  drawSprite(blockContext, tileset, actorTileId, 0, 0);
  blockContext.save();
  blockContext.globalCompositeOperation = "destination-out";
  blockContext.drawImage(maskCanvas, 0, 0);
  blockContext.restore();

  drawSprite(context, tileset, floorId, x, y);
  context.drawImage(blockCanvas, x, y);
}

function drawActorVisualEnhancements(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  render: InteractiveGameRenderFrame | null,
  cells: ReadonlyArray<InteractiveGameVisibleLayer["cells"][number]>,
  xOrigin: number,
  yOrigin: number,
  targetZ: number,
  visualEnhancementsEnabled: boolean,
): void {
  if (!visualEnhancementsEnabled || !render) {
    return;
  }

  for (const actor of render.actors) {
    if ((actor.z ?? 1) !== targetZ || actor.hidden) {
      continue;
    }

    const cell = cells[actor.pos];
    if (!cell) {
      continue;
    }

    const x = xOrigin + (actor.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(actor.pos / 32) * LEGACY_TILE_SIZE;
    const thinWallActorOverlayTileId = visualEnhancementThinWallActorPassTileId(ruleset, actor.id, cell.top.id, cell.bottom.id);
    if (thinWallActorOverlayTileId !== null) {
      const overlaySprite = getOrCreateThinWallOverlaySprite(tileset, thinWallActorOverlayTileId);
      if (overlaySprite) {
        drawLegacySpriteImage(context, overlaySprite, x, y);
      }
    }

    const marker = visualEnhancementActorMarker(actor.id, cell.top.id, cell.bottom.id);
    if (!marker) {
      continue;
    }

    if (marker.showBlockWindow) {
      drawVisualEnhancementSupportWindow(
        context,
        tileset,
        visualEnhancementActorTileId(actor.id, cell.top.id, cell.bottom.id),
        marker.floorId,
        x,
        y,
      );
    }
    drawVisualEnhancementArrow(context, actor.dir, x, y);
  }
}

function drawProjectedLynxRender(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  render: InteractiveGameRenderFrame,
  xOrigin: number,
  yOrigin: number,
  targetZ: number,
): void {
  const chip = render.chip;
  const chipZ = chip?.z ?? 1;
  if (chip && chipZ === targetZ) {
    const chipX = xOrigin + (chip.pos % 32) * LEGACY_TILE_SIZE;
    const chipY = yOrigin + Math.floor(chip.pos / 32) * LEGACY_TILE_SIZE;
    if (
      chip.failed &&
      chip.endGameAnimationTileId !== null &&
      chip.endGameAnimationFrame !== null
    ) {
      drawLynxActorSprite(
        context,
        tileset,
        chip.endGameAnimationTileId,
        MS_DIRECTION.north,
        0,
        chip.endGameAnimationFrame,
        chipX,
        chipY,
        chip.scale ?? 1,
      );
    } else if (!chip.hidden && !chip.failed) {
      drawLynxActorSprite(
        context,
        tileset,
        chip.pushing ? MS_TILE.Pushing_Chip : MS_TILE.Chip,
        chip.dir,
        chip.moving,
        Math.trunc(chip.moving / 2),
        chipX,
        chipY,
        chip.scale ?? 1,
      );
    }
  }

  const animations = render.animations;
  const animationsByPos = new Map(animations.map((animation) => [animation.pos, animation] as const));
  const drawnAnimations = new Set<number>();

  for (const actor of render.actors) {
    const actorZ = actor.z ?? 1;
    if (actorZ !== targetZ) {
      continue;
    }
    const x = xOrigin + (actor.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(actor.pos / 32) * LEGACY_TILE_SIZE;

    if (actor.hidden) {
      if (actor.animationReserved) {
        const animation = animationsByPos.get(actor.pos);
        if (animation) {
          drawLynxActorSprite(context, tileset, animation.tileId, MS_DIRECTION.north, 0, animation.frame, x, y);
          drawnAnimations.add(animation.pos);
        }
      }
      continue;
    }

    drawLynxActorSprite(context, tileset, actor.id, actor.dir, actor.moving, actor.frame, x, y, actor.scale ?? 1);
  }

  for (const animation of animations) {
    const animationZ = animation.z ?? chipZ;
    if (animationZ !== targetZ) {
      continue;
    }
    if (drawnAnimations.has(animation.pos)) {
      continue;
    }
    const x = xOrigin + (animation.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(animation.pos / 32) * LEGACY_TILE_SIZE;
    drawLynxActorSprite(context, tileset, animation.tileId, MS_DIRECTION.north, 0, animation.frame, x, y);
  }
}

function drawCompositedCell(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  topId: number,
  topState: number,
  bottomId: number,
  bottomState: number,
  timerval: number,
  x: number,
  y: number,
  visualEnhancementsEnabled: boolean,
  pickupRevealTileId: number | null,
): void {
  const topTrapOpen =
    visualEnhancementsEnabled &&
    topId === MS_TILE.Beartrap &&
    (((topState & MS_FLOOR_STATE.TrapOpen) !== 0) || ((topState & LYNX_CELL_FLAG.TrapOpen) !== 0));
  const bottomTrapOpen =
    visualEnhancementsEnabled &&
    bottomId === MS_TILE.Beartrap &&
    (((bottomState & MS_FLOOR_STATE.TrapOpen) !== 0) || ((bottomState & LYNX_CELL_FLAG.TrapOpen) !== 0));
  const thinWallOverlayTileId = visualEnhancementThinWallOverlayTileId(ruleset, topId, bottomId);

  if (topTrapOpen || bottomTrapOpen) {
    const heldTrapSprite = getOrCreateHeldTrapSprite(tileset);
    if (heldTrapSprite) {
      drawLegacySpriteImage(context, heldTrapSprite, x, y);
    } else {
      drawSprite(context, tileset, MS_TILE.Empty, x, y);
      context.save();
      context.globalAlpha = HELD_TRAP_ALPHA;
      drawSprite(context, tileset, MS_TILE.Beartrap, x, y);
      context.restore();
    }

    if (bottomTrapOpen && topId !== MS_TILE.Air && topId !== MS_TILE.Nothing && topId !== MS_TILE.Empty) {
      drawSprite(context, tileset, topId, x, y);
    }
    return;
  }

  if (
    shouldUseLegacyCombinedCellSprite(topId, bottomId, pickupRevealTileId, thinWallOverlayTileId) &&
    tileset.getCell
  ) {
    const sprite = tileset.getCell(topId, bottomId, timerval);
    if (sprite) {
      context.drawImage(sprite.image, x + sprite.offsetX, y + sprite.offsetY);
      return;
    }
  }

  const top = topId || MS_TILE.Empty;
  const bottom = bottomId || MS_TILE.Empty;
  const topSprite = tileset.get(top);
  const bottomSprite = tileset.get(bottom);
  const topTransparent = top === MS_TILE.Air || top === MS_TILE.Nothing || topSprite?.transparent === true;
  const bottomTransparent =
    bottom === MS_TILE.Air || bottom === MS_TILE.Nothing || bottomSprite?.transparent === true;

  if (top === MS_TILE.Air && (bottom === MS_TILE.Air || bottom === MS_TILE.Empty || bottom === MS_TILE.Nothing)) {
    return;
  }

  if (top === MS_TILE.Empty && bottom === MS_TILE.Air) {
    return;
  }

  if (!topSprite) {
    drawSprite(context, tileset, bottom, x, y);
    if (pickupRevealTileId !== null) {
      drawSprite(context, tileset, pickupRevealTileId, x, y);
    }
    return;
  }

  if (!topTransparent && pickupRevealTileId === null) {
    drawSprite(context, tileset, top, x, y);
    if (thinWallOverlayTileId !== null) {
      const overlaySprite = getOrCreateThinWallOverlaySprite(tileset, thinWallOverlayTileId);
      if (overlaySprite) {
        drawLegacySpriteImage(context, overlaySprite, x, y);
      }
    }
    return;
  }

  if (bottom === MS_TILE.Nothing || bottom === MS_TILE.Air) {
    if (pickupRevealTileId !== null) {
      drawSprite(context, tileset, pickupRevealTileId, x, y);
    }
    drawSprite(context, tileset, top, x, y);
    return;
  }

  if (bottom === MS_TILE.Empty) {
    drawSprite(context, tileset, MS_TILE.Empty, x, y);
  } else if (bottomTransparent) {
    drawSprite(context, tileset, MS_TILE.Empty, x, y);
    drawSprite(context, tileset, bottom, x, y);
  } else {
    drawSprite(context, tileset, bottom, x, y);
  }

  if (pickupRevealTileId !== null) {
    drawSprite(context, tileset, pickupRevealTileId, x, y);
  }
  drawSprite(context, tileset, top, x, y);
  if (thinWallOverlayTileId !== null) {
    const overlaySprite = getOrCreateThinWallOverlaySprite(tileset, thinWallOverlayTileId);
    if (overlaySprite) {
      drawLegacySpriteImage(context, overlaySprite, x, y);
    }
  }
}

function drawLayerOverlays(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  overlays: ReadonlyArray<InteractiveGameTileOverlay>,
  layerZ: number,
  xOrigin: number,
  yOrigin: number,
  canvasWidth: number,
  canvasHeight: number,
  visualEnhancementsEnabled: boolean,
): void {
  for (const overlay of overlays) {
    if (overlay.z !== layerZ) {
      continue;
    }

    const x = xOrigin + (overlay.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(overlay.pos / 32) * LEGACY_TILE_SIZE;
    if (x + LEGACY_TILE_SIZE <= 0 || x >= canvasWidth || y + LEGACY_TILE_SIZE <= 0 || y >= canvasHeight) {
      continue;
    }

    if (overlay.kind === "hidden-wall-reveal" || overlay.kind === "blue-wall-reveal") {
      if (visualEnhancementsEnabled) {
        drawSprite(context, tileset, MS_TILE.Wall, x, y);
      }
      continue;
    }
    if (overlay.kind === "carried-tool") {
      if (typeof overlay.tileId !== "number") {
        continue;
      }

      context.save();
      context.globalAlpha = CARRIED_TOOL_ALPHA;
      drawSprite(context, tileset, overlay.tileId, x, y);
      context.restore();
      continue;
    }
    if (overlay.kind === "push-pickup-reveal") {
      continue;
    }

    context.strokeStyle = overlay.kind === "support" ? SUPPORT_BORDER_COLOR : ELEVATOR_FAILURE_BORDER_COLOR;
    context.lineWidth = 3;
    context.strokeRect(x + 1.5, y + 1.5, LEGACY_TILE_SIZE - 3, LEGACY_TILE_SIZE - 3);
  }
}

function layerViewportTileWindow(depth: number): number {
  if (depth <= 0) {
    return LEGACY_MAP_TILES;
  }

  return Math.ceil(LEGACY_MAP_TILES / (LOWER_LAYER_SCALE ** depth));
}

export function withLegacyMapViewportClip(
  context: Pick<CanvasRenderingContext2D, "save" | "beginPath" | "rect" | "clip" | "restore">,
  draw: () => void,
): void {
  context.save();
  context.beginPath();
  context.rect(LEGACY_MAP_X, LEGACY_MAP_Y, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);
  context.clip();

  try {
    draw();
  } finally {
    context.restore();
  }
}

function renderMapLayerCanvas(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  viewX: number,
  viewY: number,
  depth: number,
  visualEnhancementsEnabled: boolean,
): HTMLCanvasElement {
  const tileWindowSize = layerViewportTileWindow(depth);
  const canvas = createCanvas(tileWindowSize * LEGACY_TILE_SIZE, tileWindowSize * LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = false;
  const padding = ((tileWindowSize - LEGACY_MAP_TILES) * LEGACY_TILE_SIZE) / 2;
  const xOrigin = padding - (viewX * LEGACY_TILE_SIZE) / 4;
  const yOrigin = padding - (viewY * LEGACY_TILE_SIZE) / 4;
  const pickupRevealTileIds = buildPickupRevealOverlayTileIds(
    session.frame.tileOverlays,
    layer.z,
    visualEnhancementsEnabled,
  );

  for (const cell of layer.cells) {
    const x = xOrigin + cell.position.x * LEGACY_TILE_SIZE;
    const y = yOrigin + cell.position.y * LEGACY_TILE_SIZE;
    if (x + LEGACY_TILE_SIZE <= 0 || x >= canvas.width) {
      continue;
    }
    if (y + LEGACY_TILE_SIZE <= 0 || y >= canvas.height) {
      continue;
    }

    drawCompositedCell(
      context,
      tileset,
      ruleset,
      cell.top.id,
      cell.top.state,
      cell.bottom.id,
      cell.bottom.state,
      timerval,
      x,
      y,
      visualEnhancementsEnabled,
      pickupRevealTileIds.get(cell.position.pos) ?? null,
    );
  }

  if (ruleset === "Lynx") {
    drawLynxActorOverlays(context, tileset, session, xOrigin, yOrigin, layer.z);
  }

  drawActorVisualEnhancements(
    context,
    tileset,
    ruleset,
    session.frame.render,
    layer.cells,
    xOrigin,
    yOrigin,
    layer.z,
    visualEnhancementsEnabled,
  );

  drawLayerOverlays(
    context,
    tileset,
    session.frame.tileOverlays,
    layer.z,
    xOrigin,
    yOrigin,
    canvas.width,
    canvas.height,
    visualEnhancementsEnabled,
  );
  return canvas;
}

function renderCachedLowerLayerCanvas(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): HTMLCanvasElement {
  const canvas = createCanvas(LAYER_CANVAS_BOARD_SIZE, LAYER_CANVAS_BOARD_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = false;
  const xOrigin = LAYER_CANVAS_PADDING_PX;
  const yOrigin = LAYER_CANVAS_PADDING_PX;
  const pickupRevealTileIds = buildPickupRevealOverlayTileIds(
    session.frame.tileOverlays,
    layer.z,
    visualEnhancementsEnabled,
  );

  for (const cell of layer.cells) {
    const x = xOrigin + cell.position.x * LEGACY_TILE_SIZE;
    const y = yOrigin + cell.position.y * LEGACY_TILE_SIZE;
    drawCompositedCell(
      context,
      tileset,
      ruleset,
      cell.top.id,
      cell.top.state,
      cell.bottom.id,
      cell.bottom.state,
      timerval,
      x,
      y,
      visualEnhancementsEnabled,
      pickupRevealTileIds.get(cell.position.pos) ?? null,
    );
  }

  if (ruleset === "Lynx") {
    drawLynxActorOverlays(context, tileset, session, xOrigin, yOrigin, layer.z);
  }

  drawActorVisualEnhancements(
    context,
    tileset,
    ruleset,
    session.frame.render,
    layer.cells,
    xOrigin,
    yOrigin,
    layer.z,
    visualEnhancementsEnabled,
  );

  drawLayerOverlays(
    context,
    tileset,
    session.frame.tileOverlays,
    layer.z,
    xOrigin,
    yOrigin,
    canvas.width,
    canvas.height,
    visualEnhancementsEnabled,
  );
  return canvas;
}

function getOrRenderCachedLowerLayerCanvas(
  cache: LegacyLayerCanvasCache,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): HTMLCanvasElement {
  const key = buildCachedLowerLayerKey(tileset, session, ruleset, layer, timerval, visualEnhancementsEnabled);
  const cached = getCachedLayerCanvas(cache, key);
  if (cached) {
    return cached;
  }

  return storeCachedLayerCanvas(
    cache,
    key,
    renderCachedLowerLayerCanvas(tileset, session, ruleset, layer, timerval, visualEnhancementsEnabled),
  );
}

function drawVisibleLayerStack(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  timerval: number,
  viewX: number,
  viewY: number,
  lowerLayerCache: LegacyLayerCanvasCache,
  visualEnhancementsEnabled: boolean,
): void {
  const visibleLayers = session.frame.visibleLayers;
  if (visibleLayers.length === 0) {
    return;
  }

  const topLayerCanvas = renderMapLayerCanvas(
    tileset,
    session,
    ruleset,
    visibleLayers[0]!,
    timerval,
    viewX,
    viewY,
    0,
    visualEnhancementsEnabled,
  );

  withLegacyMapViewportClip(context, () => {
    for (let index = visibleLayers.length - 1; index >= 1; index -= 1) {
      const layer = visibleLayers[index]!;
      const layerCanvas = getOrRenderCachedLowerLayerCanvas(
        lowerLayerCache,
        tileset,
        session,
        ruleset,
        layer,
        timerval,
        visualEnhancementsEnabled,
      );
      const depth = index;
      const scale = LOWER_LAYER_SCALE ** depth;
      const brightness = Math.max(0, 1 - depth * LOWER_LAYER_DARKEN_PER_DEPTH);
      const tileWindowSize = layerViewportTileWindow(depth);
      const sourceSize = tileWindowSize * LEGACY_TILE_SIZE;
      const layerPadding = ((tileWindowSize - LEGACY_MAP_TILES) * LEGACY_TILE_SIZE) / 2;
      const sourceX = LAYER_CANVAS_PADDING_PX + (viewX * LEGACY_TILE_SIZE) / 4 - layerPadding;
      const sourceY = LAYER_CANVAS_PADDING_PX + (viewY * LEGACY_TILE_SIZE) / 4 - layerPadding;
      const width = sourceSize * scale;
      const height = sourceSize * scale;
      const x = LEGACY_MAP_X + (LEGACY_MAP_WIDTH - width) / 2;
      const y = LEGACY_MAP_Y + (LEGACY_MAP_HEIGHT - height) / 2;

      context.save();
      context.filter = `blur(${LOWER_LAYER_BLUR_PX}px) brightness(${brightness})`;
      context.drawImage(layerCanvas, sourceX, sourceY, sourceSize, sourceSize, x, y, width, height);
      context.restore();
    }

    context.drawImage(topLayerCanvas, LEGACY_MAP_X, LEGACY_MAP_Y);
  });
}

function collectInitialWarmupTimervals(session: InteractiveGameSession): number[] {
  const snapshot = session.frame.snapshot;
  const timerval = (snapshot.statusFlags & MS_STATUS_FLAG.NoAnimation) !== 0 ? -1 : snapshot.currentTime;
  const values = new Set<number>();
  values.add(timerval);

  const start = Math.max(timerval, -1);
  for (let offset = 0; offset <= INITIAL_RENDER_PREWARM_TICK_COUNT; offset += 1) {
    values.add(start + offset);
  }

  return [...values];
}

function prewarmVisibleLayerCaches(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  lowerLayerCache: LegacyLayerCanvasCache,
  visualEnhancementsEnabled: boolean,
): void {
  const snapshot = session.frame.snapshot;
  const visibleLayers = session.frame.visibleLayers;
  if (visibleLayers.length === 0) {
    return;
  }

  const viewX = clamp(snapshot.view.x / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);
  const viewY = clamp(snapshot.view.y / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);

  for (const timerval of collectInitialWarmupTimervals(session)) {
    // Warm the hot top-layer render path once so the first live movement does not
    // pay its setup cost on the visible tick.
    renderMapLayerCanvas(tileset, session, ruleset, visibleLayers[0]!, timerval, viewX, viewY, 0, visualEnhancementsEnabled);

    for (let index = visibleLayers.length - 1; index >= 1; index -= 1) {
      const layer = visibleLayers[index]!;
      getOrRenderCachedLowerLayerCanvas(lowerLayerCache, tileset, session, ruleset, layer, timerval, visualEnhancementsEnabled);
    }
  }
}

function drawInventoryTile(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  overlayId: number,
  countLabel: string | null,
  x: number,
  y: number,
): void {
  drawSprite(context, tileset, MS_TILE.Empty, x, y);

  if (overlayId !== MS_TILE.Empty && overlayId !== MS_TILE.Nothing) {
    drawSprite(context, tileset, overlayId, x, y);
  }

  if (!countLabel) {
    return;
  }

  context.save();
  context.font = INVENTORY_COUNT_FONT;
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.lineWidth = 3;
  context.strokeStyle = COLORS.background;
  context.fillStyle = COLORS.text;
  context.strokeText(countLabel, x + LEGACY_TILE_SIZE - 4, y + LEGACY_TILE_SIZE - 3);
  context.fillText(countLabel, x + LEGACY_TILE_SIZE - 4, y + LEGACY_TILE_SIZE - 3);
  context.restore();
}

const LEGACY_INVENTORY_KEY_IDS = [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green] as const;
const LEGACY_INVENTORY_BOOT_IDS = [MS_TILE.Boots_Ice, MS_TILE.Boots_Slide, MS_TILE.Boots_Fire, MS_TILE.Boots_Water] as const;
const LEGACY_INVENTORY_TOOL_IDS = [MS_TILE.Sandbag] as const;
type LegacyInventoryStripKind = "keys" | "boots" | "tools";
type LegacyInventoryStripDirection = "horizontal" | "vertical";

function inventoryStripTileIds(kind: LegacyInventoryStripKind): readonly number[] {
  switch (kind) {
    case "keys":
      return LEGACY_INVENTORY_KEY_IDS;
    case "boots":
      return LEGACY_INVENTORY_BOOT_IDS;
    case "tools":
      return LEGACY_INVENTORY_TOOL_IDS;
  }
}

function inventoryStripOverlayTileId(
  inventory: GameSnapshot["inventory"] | null,
  kind: LegacyInventoryStripKind,
  index: number,
): number {
  switch (kind) {
    case "keys":
      return (inventory?.keys[index] ?? 0) > 0 ? LEGACY_INVENTORY_KEY_IDS[index] ?? MS_TILE.Empty : MS_TILE.Empty;
    case "boots":
      return (inventory?.boots[index] ?? 0) > 0 ? LEGACY_INVENTORY_BOOT_IDS[index] ?? MS_TILE.Empty : MS_TILE.Empty;
    case "tools":
      return inventory?.tools[index] ?? MS_TILE.Empty;
  }
}

export function inventoryTileCountLabel(tileId: number, count: number): string | null {
  if (count <= 1) {
    return null;
  }

  switch (tileId) {
    case MS_TILE.Key_Red:
    case MS_TILE.Key_Blue:
    case MS_TILE.Key_Yellow:
      return String(count);
    default:
      return null;
  }
}

export function inventoryStripPixelDimensions(tileSize: number, direction: LegacyInventoryStripDirection): {
  height: number;
  width: number;
} {
  const tileCount = inventoryStripTileIds("keys").length;
  return direction === "horizontal"
    ? { height: tileSize, width: tileCount * tileSize }
    : { height: tileCount * tileSize, width: tileSize };
}

export function inventoryStripPixelDimensionsForKind(
  tileSize: number,
  direction: LegacyInventoryStripDirection,
  kind: LegacyInventoryStripKind,
): {
  height: number;
  width: number;
} {
  const tileCount = inventoryStripTileIds(kind).length;
  return direction === "horizontal"
    ? { height: tileSize, width: tileCount * tileSize }
    : { height: tileCount * tileSize, width: tileSize };
}

function drawInventoryStrip(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  inventory: GameSnapshot["inventory"] | null,
  kind: LegacyInventoryStripKind,
  direction: LegacyInventoryStripDirection,
  visualEnhancementsEnabled: boolean,
): void {
  const tileIds = inventoryStripTileIds(kind);
  const stripWidth = direction === "horizontal" ? tileIds.length * LEGACY_TILE_SIZE : LEGACY_TILE_SIZE;
  const stripHeight = direction === "horizontal" ? LEGACY_TILE_SIZE : tileIds.length * LEGACY_TILE_SIZE;
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, stripWidth, stripHeight);

  tileIds.forEach((tileId, index) => {
    const count = kind === "keys" ? inventory?.keys[index] ?? 0 : kind === "boots" ? inventory?.boots[index] ?? 0 : 0;
    drawInventoryTile(
      context,
      tileset,
      inventoryStripOverlayTileId(inventory, kind, index),
      kind === "keys" && visualEnhancementsEnabled ? inventoryTileCountLabel(tileId, count) : null,
      direction === "horizontal" ? index * LEGACY_TILE_SIZE : 0,
      direction === "horizontal" ? 0 : index * LEGACY_TILE_SIZE,
    );
  });
}

function drawSeriesList(
  context: CanvasRenderingContext2D,
  catalog: SeriesCatalogEntry[],
  selectedSeriesFile: string | null,
  message: string | null,
  scrollOffset: number,
): void {
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, LEGACY_WINDOW_WIDTH, LEGACY_WINDOW_HEIGHT);

  drawText(context, "Filename", FILE_COLUMN_X, LIST_HEADER_Y, COLORS.text);
  drawText(context, "Ruleset", RULESET_COLUMN_X, LIST_HEADER_Y, COLORS.text, "center");
  drawText(
    context,
    `${Math.min(catalog.length, scrollOffset + 1)}-${Math.min(catalog.length, scrollOffset + LIST_VISIBLE_ROWS)} / ${catalog.length}`,
    LEGACY_WINDOW_WIDTH - LEGACY_MARGIN,
    LIST_HEADER_Y,
    COLORS.dim,
    "right",
    SMALL_FONT,
  );

  catalog.slice(scrollOffset, scrollOffset + LIST_VISIBLE_ROWS).forEach((series, visibleIndex) => {
    const y = LIST_FIRST_ROW_Y + visibleIndex * LIST_ROW_HEIGHT;
    const color = series.filebase === selectedSeriesFile ? COLORS.highlight : COLORS.text;
    drawText(context, series.filebase, FILE_COLUMN_X, y, color);
    drawText(context, series.ruleset, RULESET_COLUMN_X, y, color, "center");
  });

  if (scrollOffset > 0) {
    drawText(context, "^^^", RULESET_COLUMN_X + 72, LIST_FIRST_ROW_Y, COLORS.dim, "right", SMALL_FONT);
  }

  if (scrollOffset + LIST_VISIBLE_ROWS < catalog.length) {
    drawText(
      context,
      "vvv",
      RULESET_COLUMN_X + 72,
      LIST_FIRST_ROW_Y + (LIST_VISIBLE_ROWS - 1) * LIST_ROW_HEIGHT,
      COLORS.dim,
      "right",
      SMALL_FONT,
    );
  }

  drawText(
    context,
    message ?? "Welcome to Tile World. Type Enter to proceed.",
    LEGACY_MARGIN,
    LEGACY_TITLE_Y,
    message ? COLORS.highlight : COLORS.dim,
    "left",
    SMALL_FONT,
  );
}

function drawGameScreen(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  session: InteractiveGameSession | null,
  level: SeriesLevel | null,
  series: SeriesCatalogEntry | null,
  message: string | null,
  isLoading: boolean,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  lowerLayerCache: LegacyLayerCanvasCache,
  visualEnhancementsEnabled: boolean,
): void {
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, LEGACY_WINDOW_WIDTH, LEGACY_WINDOW_HEIGHT);

  if (!session || !level || !series) {
    drawText(context, isLoading ? "Loading level..." : "No level loaded.", LEGACY_MARGIN, LEGACY_MARGIN, COLORS.text);
    return;
  }

  const snapshot = session.frame.snapshot;
  const viewX = clamp(snapshot.view.x / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);
  const viewY = clamp(snapshot.view.y / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);
  const timerval = (snapshot.statusFlags & MS_STATUS_FLAG.NoAnimation) !== 0 ? -1 : snapshot.currentTime;
  drawVisibleLayerStack(context, tileset, session, ruleset, timerval, viewX, viewY, lowerLayerCache, visualEnhancementsEnabled);

  drawText(context, `Level ${level.number}`, LEGACY_INFO_X, LEGACY_MAP_Y, COLORS.text);
  drawText(context, `Password: ${level.password || "----"}`, LEGACY_INFO_X, LEGACY_MAP_Y + 18, COLORS.text);
  drawText(context, "Chips", LEGACY_INFO_X, LEGACY_MAP_Y + 54, COLORS.text);
  drawText(context, "Time", LEGACY_INFO_X, LEGACY_MAP_Y + 72, COLORS.text);
  drawText(context, String(snapshot.chipsNeeded), LEGACY_WINDOW_WIDTH - LEGACY_MARGIN, LEGACY_MAP_Y + 54, COLORS.text, "right");
  drawText(context, formatLevelTimeLeft(session), LEGACY_WINDOW_WIDTH - LEGACY_MARGIN, LEGACY_MAP_Y + 72, COLORS.text, "right");

  const bestTime = formatBestTime(level);
  if (bestTime) {
    const bestTimeLabel = snapshot.timelimit > 0 ? `Best time: ${bestTime}` : `(Best time: ${bestTime})`;
    drawText(context, bestTimeLabel, LEGACY_INFO_X, LEGACY_MAP_Y + 108, COLORS.dim);
  }

  const inventoryX = LEGACY_INFO_X;
  const inventoryY = LEGACY_MAP_Y + 128;
  (["keys", "boots", "tools"] as const).forEach((kind, rowIndex) => {
    inventoryStripTileIds(kind).forEach((tileId, columnIndex) => {
      const count = kind === "keys" ? snapshot.inventory.keys[columnIndex] ?? 0 : 0;
      drawInventoryTile(
        context,
        tileset,
        inventoryStripOverlayTileId(snapshot.inventory, kind, columnIndex),
        kind === "keys" && visualEnhancementsEnabled ? inventoryTileCountLabel(tileId, count) : null,
        inventoryX + columnIndex * LEGACY_TILE_SIZE,
        inventoryY + rowIndex * LEGACY_TILE_SIZE,
      );
    });
  });

  let hintText = "";
  if ((snapshot.statusFlags & MS_STATUS_FLAG.Invalid) !== 0) {
    hintText = "This level cannot be played.";
  } else if (snapshot.currentTime < 0 && level.unsolvable) {
    hintText =
      level.unsolvable.length > 0
        ? `This level is reported to be unsolvable: ${level.unsolvable}.`
        : "This level is reported to be unsolvable.";
  } else if ((snapshot.statusFlags & MS_STATUS_FLAG.ShowHint) !== 0 && session.hintText) {
    hintText = session.hintText;
  } else if (snapshot.status === "completed") {
    hintText = "Level Completed";
  } else if (snapshot.status === "failed") {
    hintText = "Chip died";
  }

  if (hintText) {
    drawWrappedText(
      context,
      hintText,
      LEGACY_INFO_X,
      inventoryY + LEGACY_TILE_SIZE * 3 + LEGACY_MARGIN,
      LEGACY_WINDOW_WIDTH - LEGACY_MARGIN - LEGACY_INFO_X,
      COLORS.text,
      (snapshot.statusFlags & MS_STATUS_FLAG.ShowHint) !== 0 || snapshot.status !== "playing",
    );
  }

  drawText(context, level.name, LEGACY_MAP_X, LEGACY_TITLE_Y, COLORS.text);
  drawText(
    context,
    message ?? (isLoading ? "Loading level..." : series.filebase),
    LEGACY_INFO_X,
    LEGACY_TITLE_Y,
    message ? COLORS.highlight : COLORS.dim,
    "left",
    SMALL_FONT,
  );
}

function drawGameMapOnly(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  session: InteractiveGameSession | null,
  level: SeriesLevel | null,
  series: SeriesCatalogEntry | null,
  isLoading: boolean,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  lowerLayerCache: LegacyLayerCanvasCache,
  visualEnhancementsEnabled: boolean,
): void {
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);

  if (!session || !level || !series) {
    drawText(context, isLoading ? "Loading level..." : "No level loaded.", 12, 12, COLORS.text);
    return;
  }

  const snapshot = session.frame.snapshot;
  const viewX = clamp(snapshot.view.x / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);
  const viewY = clamp(snapshot.view.y / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);
  const timerval = (snapshot.statusFlags & MS_STATUS_FLAG.NoAnimation) !== 0 ? -1 : snapshot.currentTime;

  context.save();
  context.translate(-LEGACY_MAP_X, -LEGACY_MAP_Y);
  drawVisibleLayerStack(context, tileset, session, ruleset, timerval, viewX, viewY, lowerLayerCache, visualEnhancementsEnabled);
  context.restore();
}

function buildGameDrawStateKey(
  session: InteractiveGameSession | null,
  currentSeries: SeriesCatalogEntry | null,
  currentLevel: SeriesLevel | null,
  currentRuleset: SeriesCatalogEntry["ruleset"] | null,
  isLoading: boolean,
  message: string | null,
  presentation: LegacyCanvasPresentation,
  hasTileset: boolean,
  visualEnhancementsEnabled: boolean,
): string {
  if (!hasTileset) {
    return `no-tileset:${presentation}:${visualEnhancementsEnabled ? 1 : 0}:${isLoading ? 1 : 0}:${message ?? ""}:${currentSeries?.filebase ?? ""}:${currentLevel?.number ?? 0}:${currentRuleset ?? "None"}`;
  }

  if (!session) {
    return `no-session:${presentation}:${visualEnhancementsEnabled ? 1 : 0}:${isLoading ? 1 : 0}:${message ?? ""}:${currentSeries?.filebase ?? ""}:${currentLevel?.number ?? 0}:${currentRuleset ?? "None"}`;
  }

  const snapshot = session.frame.snapshot;
  return [
    presentation,
    session.request.seriesFile,
    session.request.levelNumber,
    session.request.ruleset,
    snapshot.tick,
    snapshot.currentTime,
    snapshot.status,
    snapshot.statusFlags,
    snapshot.view.x,
    snapshot.view.y,
    session.history.currentTick,
    session.history.restoreMode,
    session.frame.visibleLayers.length,
    session.frame.tileOverlays.length,
    snapshot.chipsNeeded,
    visualEnhancementsEnabled ? 1 : 0,
    message ?? "",
    isLoading ? 1 : 0,
  ].join(":");
}

function useLegacyTileset(ruleset: "MS" | "Lynx" | null): LegacyTileset | null {
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
        if (!active) {
          return;
        }

        setTileset(nextTileset);
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

interface LegacyInventoryStripProps {
  className?: string;
  currentRuleset: SeriesCatalogEntry["ruleset"] | null;
  direction?: LegacyInventoryStripDirection;
  inventory: GameSnapshot["inventory"] | null;
  kind: LegacyInventoryStripKind;
  renderTileSize?: LegacyRenderTileSize;
  visualEnhancementsEnabled?: boolean;
}

export function LegacyInventoryStrip({
  className,
  currentRuleset,
  direction = "vertical",
  inventory,
  kind,
  renderTileSize = LEGACY_TILE_SIZE,
  visualEnhancementsEnabled = true,
}: LegacyInventoryStripProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scaledCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileset = useLegacyTileset(currentRuleset === "Lynx" ? "Lynx" : "MS");
  const targetTileSize = renderTileSize;
  const { height: sourceHeight, width: sourceWidth } = inventoryStripPixelDimensionsForKind(LEGACY_TILE_SIZE, direction, kind);
  const { height: targetHeight, width: targetWidth } = inventoryStripPixelDimensionsForKind(targetTileSize, direction, kind);
  const usesDefaultTileSize = isDefaultLegacyRenderTileSize(targetTileSize);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;
    if (usesDefaultTileSize) {
      context.fillStyle = COLORS.background;
      context.fillRect(0, 0, sourceWidth, sourceHeight);

      if (!tileset) {
        return;
      }

      drawInventoryStrip(context, tileset, inventory, kind, direction, visualEnhancementsEnabled);
      return;
    }

    const scaledCanvas = scaledCanvasRef.current ?? createCanvas(sourceWidth, sourceHeight);
    scaledCanvasRef.current = scaledCanvas;
    ensureCanvasSize(scaledCanvas, sourceWidth, sourceHeight);
    const scaledContext = scaledCanvas.getContext("2d");
    if (!scaledContext) {
      return;
    }

    scaledContext.imageSmoothingEnabled = false;
    scaledContext.fillStyle = COLORS.background;
    scaledContext.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);

    if (tileset) {
      drawInventoryStrip(scaledContext, tileset, inventory, kind, direction, visualEnhancementsEnabled);
    }

    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(scaledCanvas, 0, 0, targetWidth, targetHeight);
  }, [direction, inventory, kind, sourceHeight, sourceWidth, targetHeight, targetWidth, tileset, usesDefaultTileSize, visualEnhancementsEnabled]);

  return (
    <canvas
      aria-label="Inventory"
      className={className}
      height={targetHeight}
      ref={canvasRef}
      width={targetWidth}
    />
  );
}

export function LegacyCanvasScreen({
  className,
  mode,
  presentation = "legacy",
  catalog,
  selectedSeriesFile,
  currentSeries,
  currentLevel,
  currentRuleset,
  session,
  liveSessionRef,
  isLoading,
  message,
  onSelectSeries,
  onActivateSeries,
  onMapClick,
  onDatDrop,
  renderTileSize = LEGACY_TILE_SIZE,
  visualEnhancementsEnabled = true,
}: LegacyCanvasScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scaledMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lowerLayerCacheRef = useRef<LegacyLayerCanvasCache>(createLayerCanvasCache());
  const tileset = useLegacyTileset(currentRuleset === "Lynx" ? "Lynx" : "MS");
  const [isDatDragActive, setIsDatDragActive] = useState(false);
  const [seriesScrollOffset, setSeriesScrollOffset] = useState(0);
  const targetMapWidth = legacyMapPixelsForTileSize(renderTileSize);
  const targetMapHeight = legacyMapPixelsForTileSize(renderTileSize);
  const usesDefaultMapTileSize = isDefaultLegacyRenderTileSize(renderTileSize);

  const selectedSeriesIndex = catalog.findIndex((series) => series.filebase === selectedSeriesFile);

  const drawFrame = useEffectEvent((
    targetContext: CanvasRenderingContext2D,
    activeSession: InteractiveGameSession | null,
  ) => {
    if (mode === "series-list") {
      drawSeriesList(targetContext, catalog, selectedSeriesFile, message, seriesScrollOffset);
      return;
    }

    if (presentation === "map-only" && !usesDefaultMapTileSize) {
      const scaledMapCanvas = scaledMapCanvasRef.current ?? createCanvas(LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);
      scaledMapCanvasRef.current = scaledMapCanvas;
      ensureCanvasSize(scaledMapCanvas, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);
      const scaledMapContext = scaledMapCanvas.getContext("2d");
      if (!scaledMapContext) {
        return;
      }

      scaledMapContext.imageSmoothingEnabled = false;
      if (!tileset) {
        scaledMapContext.fillStyle = COLORS.background;
        scaledMapContext.fillRect(0, 0, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);
        drawText(scaledMapContext, "Loading tiles...", LEGACY_MARGIN, LEGACY_MARGIN, COLORS.text);
      } else {
        drawGameMapOnly(
          scaledMapContext,
          tileset,
          activeSession,
          currentLevel,
          currentSeries,
          isLoading,
          currentRuleset,
          lowerLayerCacheRef.current,
          visualEnhancementsEnabled,
        );
      }

      targetContext.clearRect(0, 0, targetMapWidth, targetMapHeight);
      targetContext.drawImage(scaledMapCanvas, 0, 0, targetMapWidth, targetMapHeight);
      return;
    }

    if (!tileset) {
      targetContext.fillStyle = COLORS.background;
      targetContext.fillRect(
        0,
        0,
        presentation === "map-only" ? LEGACY_MAP_WIDTH : LEGACY_WINDOW_WIDTH,
        presentation === "map-only" ? LEGACY_MAP_HEIGHT : LEGACY_WINDOW_HEIGHT,
      );
      drawText(targetContext, "Loading tiles...", LEGACY_MARGIN, LEGACY_MARGIN, COLORS.text);
      return;
    }

    if (presentation === "map-only") {
      drawGameMapOnly(
        targetContext,
        tileset,
        activeSession,
        currentLevel,
        currentSeries,
        isLoading,
        currentRuleset,
        lowerLayerCacheRef.current,
        visualEnhancementsEnabled,
      );
      return;
    }

    drawGameScreen(
      targetContext,
      tileset,
      activeSession,
      currentLevel,
      currentSeries,
      message,
      isLoading,
      currentRuleset,
      lowerLayerCacheRef.current,
      visualEnhancementsEnabled,
    );
  });

  useEffect(() => {
    if (!onDatDrop) {
      setIsDatDragActive(false);
    }
  }, [onDatDrop]);

  useEffect(() => {
    if (mode !== "series-list") {
      return;
    }

    setSeriesScrollOffset((current) => ensureSeriesVisible(current, selectedSeriesIndex, catalog.length));
  }, [catalog.length, mode, selectedSeriesIndex]);

  useEffect(() => {
    clearLayerCanvasCache(lowerLayerCacheRef.current);
  }, [currentRuleset, currentSeries?.filebase, currentLevel?.number, tileset, visualEnhancementsEnabled]);

  useEffect(() => {
    if (mode !== "game" || !tileset) {
      return;
    }

    const activeSession = liveSessionRef?.current ?? session;
    if (!activeSession) {
      return;
    }

    measurePerfSync("initialRenderWarmupMs", () => {
      prewarmVisibleLayerCaches(tileset, activeSession, currentRuleset, lowerLayerCacheRef.current, visualEnhancementsEnabled);
    });
  }, [currentLevel?.number, currentRuleset, currentSeries?.filebase, liveSessionRef, mode, session, tileset, visualEnhancementsEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;

    if (mode === "game") {
      return;
    }
    drawFrame(context, liveSessionRef?.current ?? session);
  }, [
    catalog,
    currentLevel,
    currentRuleset,
    currentSeries,
    isLoading,
    liveSessionRef,
    message,
    mode,
    presentation,
    renderTileSize,
    selectedSeriesFile,
    seriesScrollOffset,
    session,
    targetMapHeight,
    targetMapWidth,
    tileset,
    usesDefaultMapTileSize,
    visualEnhancementsEnabled,
  ]);

  useEffect(() => {
    if (mode !== "game") {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;
    let animationFrameId = 0;
    let lastDrawStateKey = "";

    const drawLiveFrame = () => {
      const activeSession = liveSessionRef?.current ?? session;
      const drawStateKey = buildGameDrawStateKey(
        activeSession,
        currentSeries,
        currentLevel,
        currentRuleset,
        isLoading,
        message,
        presentation,
        tileset !== null,
        visualEnhancementsEnabled,
      );

      if (drawStateKey !== lastDrawStateKey) {
        measurePerfSync("renderMs", () => {
          drawFrame(context, activeSession);
        });
        lastDrawStateKey = drawStateKey;
      }

      animationFrameId = window.requestAnimationFrame(drawLiveFrame);
    };

    drawLiveFrame();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [
    currentLevel,
    currentRuleset,
    currentSeries,
    isLoading,
    liveSessionRef,
    message,
    mode,
    presentation,
    renderTileSize,
    session,
    targetMapHeight,
    targetMapWidth,
    tileset,
    usesDefaultMapTileSize,
    visualEnhancementsEnabled,
  ]);

  return (
    <canvas
      className={`${className ?? "legacy-canvas"}${isDatDragActive ? " legacy-canvas--drop-active" : ""}`}
      height={presentation === "map-only" ? targetMapHeight : LEGACY_WINDOW_HEIGHT}
      onClick={(event) => {
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        const scaleX = canvas.width / bounds.width;
        const scaleY = canvas.height / bounds.height;
        const x = (event.clientX - bounds.left) * scaleX;
        const y = (event.clientY - bounds.top) * scaleY;

        if (mode !== "series-list") {
          if (!session || currentRuleset !== "MS" || !onMapClick) {
            return;
          }

          const mapScale = presentation === "map-only" ? LEGACY_TILE_SIZE / renderTileSize : 1;
          const position = mapPositionAtCanvasPoint(
            session,
            presentation === "map-only" ? x * mapScale + LEGACY_MAP_X : x,
            presentation === "map-only" ? y * mapScale + LEGACY_MAP_Y : y,
          );
          if (position !== null) {
            onMapClick(position);
          }
          return;
        }

        const index = seriesIndexAt(y, catalog.length, seriesScrollOffset);
        if (index < 0) {
          return;
        }

        const selected = catalog[index];
        if (!selected) {
          return;
        }

        if (selected.filebase === selectedSeriesFile) {
          onActivateSeries(selected.filebase);
        } else {
          onSelectSeries(selected.filebase);
        }
      }}
      onDragEnter={(event) => {
        if (!onDatDrop || !Array.from(event.dataTransfer.types).includes("Files")) {
          return;
        }

        event.preventDefault();
        setIsDatDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }

        setIsDatDragActive(false);
      }}
      onDragOver={(event) => {
        if (!onDatDrop || !Array.from(event.dataTransfer.types).includes("Files")) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!isDatDragActive) {
          setIsDatDragActive(true);
        }
      }}
      onDrop={(event) => {
        if (!onDatDrop) {
          return;
        }

        event.preventDefault();
        setIsDatDragActive(false);
        const files = Array.from(event.dataTransfer.files ?? []).filter((file) => /\.dat$/iu.test(file.name));
        if (files.length === 0) {
          return;
        }

        onDatDrop(files);
      }}
      onWheel={(event) => {
        if (mode !== "series-list" || catalog.length === 0) {
          return;
        }

        event.preventDefault();
        const currentIndex = selectedSeriesIndex >= 0 ? selectedSeriesIndex : 0;
        const direction = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
        if (direction === 0) {
          return;
        }

        const nextIndex = clamp(currentIndex + direction, 0, catalog.length - 1);
        const next = catalog[nextIndex];
        if (next) {
          onSelectSeries(next.filebase);
        }
      }}
      ref={canvasRef}
      width={presentation === "map-only" ? targetMapWidth : LEGACY_WINDOW_WIDTH}
    />
  );
}
