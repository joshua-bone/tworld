import { useEffect, useRef, useState } from "react";
import lynxTilesUrl from "@res/atiles.bmp?url";
import msTilesUrl from "@res/tiles.bmp?url";
import { buildLegacyTileset, type LegacyTileset } from "@player-web/impl/legacyTileset";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type {
  InteractiveGameRenderFrame,
  InteractiveGameTileOverlay,
  InteractiveGameVisibleLayer,
} from "@game-core/api/interactive";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { MS_DIRECTION, MS_STATUS_FLAG, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
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

interface LegacyCanvasScreenProps {
  mode: LegacyMode;
  catalog: SeriesCatalogEntry[];
  selectedSeriesFile: string | null;
  currentSeries: SeriesCatalogEntry | null;
  currentLevel: SeriesLevel | null;
  currentRuleset: SeriesCatalogEntry["ruleset"] | null;
  session: InteractiveGameSession | null;
  isLoading: boolean;
  message: string | null;
  onSelectSeries: (seriesFile: string) => void;
  onActivateSeries: (seriesFile: string) => void;
  onMapClick?: (position: number) => void;
  onDatDrop?: (files: File[]) => void;
}

const COLORS = {
  background: "#000000",
  text: "#ffffff",
  dim: "#c0c0c0",
  highlight: "#ffff00",
};

const FONT = "16px 'Courier New', monospace";
const SMALL_FONT = "14px 'Courier New', monospace";
const LIST_HEADER_Y = LEGACY_MARGIN + 8;
const LIST_FIRST_ROW_Y = LIST_HEADER_Y + 24;
const LIST_ROW_HEIGHT = 18;
const FILE_COLUMN_X = LEGACY_MARGIN;
const RULESET_COLUMN_X = 520;
const LOWER_LAYER_SCALE = 0.9;
const LOWER_LAYER_BLUR_PX = 1;
const LOWER_LAYER_BRIGHTNESS = 0.75;
const SUPPORT_BORDER_COLOR = "#2c8cff";
const ELEVATOR_FAILURE_BORDER_COLOR = "#ff4040";
const ELEVATOR_BASE_COLOR = "#2f9f4a";
const ELEVATOR_EDGE_COLOR = "#0e401d";
const ELEVATOR_PANEL_COLOR = "#154d23";
const ELEVATOR_TEXT_COLOR = "#d9ffd7";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
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

function seriesIndexAt(y: number, itemCount: number): number {
  if (y < LIST_FIRST_ROW_Y) {
    return -1;
  }

  const index = Math.floor((y - LIST_FIRST_ROW_Y) / LIST_ROW_HEIGHT);
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
    context.fillStyle = ELEVATOR_BASE_COLOR;
    context.fillRect(x, y, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
    context.strokeStyle = ELEVATOR_EDGE_COLOR;
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, LEGACY_TILE_SIZE - 2, LEGACY_TILE_SIZE - 2);
    context.fillStyle = ELEVATOR_PANEL_COLOR;
    context.fillRect(x + 6, y + 14, LEGACY_TILE_SIZE - 12, LEGACY_TILE_SIZE - 28);
    context.font = "bold 12px 'Courier New', monospace";
    context.fillStyle = ELEVATOR_TEXT_COLOR;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("UP", x + LEGACY_TILE_SIZE / 2, y + LEGACY_TILE_SIZE / 2);
    return;
  }

  const sprite = tileset.get(tileId);
  if (!sprite) {
    return;
  }

  context.drawImage(sprite.image, x + sprite.offsetX, y + sprite.offsetY);
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
  topId: number,
  bottomId: number,
  timerval: number,
  x: number,
  y: number,
): void {
  if (
    topId !== MS_TILE.Air &&
    bottomId !== MS_TILE.Air &&
    topId !== MS_TILE.Elevator &&
    bottomId !== MS_TILE.Elevator &&
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
    return;
  }

  if (!topTransparent) {
    drawSprite(context, tileset, top, x, y);
    return;
  }

  if (bottom === MS_TILE.Nothing || bottom === MS_TILE.Air) {
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

  drawSprite(context, tileset, top, x, y);
}

function drawLayerOverlays(
  context: CanvasRenderingContext2D,
  overlays: ReadonlyArray<InteractiveGameTileOverlay>,
  layerZ: number,
  xOrigin: number,
  yOrigin: number,
  canvasWidth: number,
  canvasHeight: number,
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

function renderMapLayerCanvas(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  viewX: number,
  viewY: number,
  depth: number,
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

  for (const cell of layer.cells) {
    const x = xOrigin + cell.position.x * LEGACY_TILE_SIZE;
    const y = yOrigin + cell.position.y * LEGACY_TILE_SIZE;
    if (x + LEGACY_TILE_SIZE <= 0 || x >= canvas.width) {
      continue;
    }
    if (y + LEGACY_TILE_SIZE <= 0 || y >= canvas.height) {
      continue;
    }

    drawCompositedCell(context, tileset, cell.top.id, cell.bottom.id, timerval, x, y);
  }

  if (ruleset === "Lynx") {
    drawLynxActorOverlays(context, tileset, session, xOrigin, yOrigin, layer.z);
  }

  drawLayerOverlays(context, session.frame.tileOverlays, layer.z, xOrigin, yOrigin, canvas.width, canvas.height);
  return canvas;
}

function drawVisibleLayerStack(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  timerval: number,
  viewX: number,
  viewY: number,
): void {
  const visibleLayers = session.frame.visibleLayers;
  if (visibleLayers.length === 0) {
    return;
  }

  const layerCanvases = visibleLayers.map((layer, index) =>
    renderMapLayerCanvas(tileset, session, ruleset, layer, timerval, viewX, viewY, index),
  );

  for (let index = layerCanvases.length - 1; index >= 1; index -= 1) {
    const layerCanvas = layerCanvases[index]!;
    const depth = index;
    const scale = LOWER_LAYER_SCALE ** depth;
    const width = layerCanvas.width * scale;
    const height = layerCanvas.height * scale;
    const x = LEGACY_MAP_X + (LEGACY_MAP_WIDTH - width) / 2;
    const y = LEGACY_MAP_Y + (LEGACY_MAP_HEIGHT - height) / 2;

    context.save();
    context.filter = `blur(${LOWER_LAYER_BLUR_PX}px) brightness(${LOWER_LAYER_BRIGHTNESS})`;
    context.drawImage(layerCanvas, x, y, width, height);
    context.restore();
  }

  context.drawImage(layerCanvases[0]!, LEGACY_MAP_X, LEGACY_MAP_Y);
}

function drawInventoryTile(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  overlayId: number,
  x: number,
  y: number,
): void {
  drawSprite(context, tileset, MS_TILE.Empty, x, y);

  if (overlayId !== MS_TILE.Empty && overlayId !== MS_TILE.Nothing) {
    drawSprite(context, tileset, overlayId, x, y);
  }
}

function drawSeriesList(
  context: CanvasRenderingContext2D,
  catalog: SeriesCatalogEntry[],
  selectedSeriesFile: string | null,
  message: string | null,
): void {
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, LEGACY_WINDOW_WIDTH, LEGACY_WINDOW_HEIGHT);

  drawText(context, "Filename", FILE_COLUMN_X, LIST_HEADER_Y, COLORS.text);
  drawText(context, "Ruleset", RULESET_COLUMN_X, LIST_HEADER_Y, COLORS.text, "center");

  catalog.forEach((series, index) => {
    const y = LIST_FIRST_ROW_Y + index * LIST_ROW_HEIGHT;
    const color = series.filebase === selectedSeriesFile ? COLORS.highlight : COLORS.text;
    drawText(context, series.filebase, FILE_COLUMN_X, y, color);
    drawText(context, series.ruleset, RULESET_COLUMN_X, y, color, "center");
  });

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
  drawVisibleLayerStack(context, tileset, session, ruleset, timerval, viewX, viewY);

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
  const keyIds = [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green] as const;
  const bootIds = [MS_TILE.Boots_Ice, MS_TILE.Boots_Slide, MS_TILE.Boots_Fire, MS_TILE.Boots_Water] as const;
  keyIds.forEach((tileId, index) => {
    drawInventoryTile(
      context,
      tileset,
      snapshot.inventory.keys[index] > 0 ? tileId : MS_TILE.Empty,
      inventoryX + index * LEGACY_TILE_SIZE,
      inventoryY,
    );
  });
  bootIds.forEach((tileId, index) => {
    drawInventoryTile(
      context,
      tileset,
      snapshot.inventory.boots[index] > 0 ? tileId : MS_TILE.Empty,
      inventoryX + index * LEGACY_TILE_SIZE,
      inventoryY + LEGACY_TILE_SIZE,
    );
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
      inventoryY + LEGACY_TILE_SIZE * 2 + LEGACY_MARGIN,
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

function useLegacyTileset(ruleset: "MS" | "Lynx" | null): LegacyTileset | null {
  const [tileset, setTileset] = useState<LegacyTileset | null>(null);
  const tilesUrl = ruleset === "Lynx" ? lynxTilesUrl : msTilesUrl;

  useEffect(() => {
    let active = true;
    const image = new Image();
    setTileset(null);
    image.src = tilesUrl;
    image.onload = () => {
      if (!active) {
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.drawImage(image, 0, 0);
      try {
        setTileset(buildLegacyTileset(canvas, ruleset === "Lynx" ? "Lynx" : "MS"));
      } catch (error) {
        console.error("Failed to decode legacy tileset", error);
      }
    };

    return () => {
      active = false;
    };
  }, [ruleset, tilesUrl]);

  return tileset;
}

export function LegacyCanvasScreen({
  mode,
  catalog,
  selectedSeriesFile,
  currentSeries,
  currentLevel,
  currentRuleset,
  session,
  isLoading,
  message,
  onSelectSeries,
  onActivateSeries,
  onMapClick,
  onDatDrop,
}: LegacyCanvasScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileset = useLegacyTileset(currentRuleset === "Lynx" ? "Lynx" : "MS");
  const [isDatDragActive, setIsDatDragActive] = useState(false);

  useEffect(() => {
    if (!onDatDrop) {
      setIsDatDragActive(false);
    }
  }, [onDatDrop]);

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

    if (mode === "series-list") {
      drawSeriesList(context, catalog, selectedSeriesFile, message);
      return;
    }

    if (!tileset) {
      context.fillStyle = COLORS.background;
      context.fillRect(0, 0, LEGACY_WINDOW_WIDTH, LEGACY_WINDOW_HEIGHT);
      drawText(context, "Loading tiles...", LEGACY_MARGIN, LEGACY_MARGIN, COLORS.text);
      return;
    }

    drawGameScreen(context, tileset, session, currentLevel, currentSeries, message, isLoading, currentRuleset);
  }, [catalog, currentLevel, currentRuleset, currentSeries, isLoading, message, mode, selectedSeriesFile, session, tileset]);

  return (
    <canvas
      className={`legacy-canvas${isDatDragActive ? " legacy-canvas--drop-active" : ""}`}
      height={LEGACY_WINDOW_HEIGHT}
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

          const position = mapPositionAtCanvasPoint(session, x, y);
          if (position !== null) {
            onMapClick(position);
          }
          return;
        }

        const index = seriesIndexAt(y, catalog.length);
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
      ref={canvasRef}
      width={LEGACY_WINDOW_WIDTH}
    />
  );
}
