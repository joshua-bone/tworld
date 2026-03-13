import { useEffect, useRef, useState } from "react";
import lynxTilesUrl from "../../../../../res/atiles.bmp?url";
import msTilesUrl from "../../../../../res/tiles.bmp?url";
import type { InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { SeriesCatalogEntry, SeriesLevel } from "@domain/series";
import { MS_STATUS_FLAG, MS_TILE, isMsBoots, isMsCreature, isMsKey } from "@domain/game/rules/ms/tiles";
import { TIME_NIL } from "@domain/score";
import {
  getLegacySpriteCoords,
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
} from "@adapters/react/legacySprites";

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function drawSprite(
  context: CanvasRenderingContext2D,
  spritesheet: CanvasImageSource,
  tileId: number,
  x: number,
  y: number,
): void {
  if (tileId === MS_TILE.Nothing) {
    return;
  }

  const coords = getLegacySpriteCoords(tileId);
  if (!coords) {
    return;
  }

  context.drawImage(
    spritesheet,
    coords.x * LEGACY_TILE_SIZE,
    coords.y * LEGACY_TILE_SIZE,
    LEGACY_TILE_SIZE,
    LEGACY_TILE_SIZE,
    x,
    y,
    LEGACY_TILE_SIZE,
    LEGACY_TILE_SIZE,
  );
}

function isTransparentLegacyTile(tileId: number): boolean {
  return tileId !== MS_TILE.Empty && tileId !== MS_TILE.Nothing && (isMsKey(tileId) || isMsBoots(tileId) || isMsCreature(tileId));
}

function drawCompositedCell(
  context: CanvasRenderingContext2D,
  spritesheet: CanvasImageSource,
  topId: number,
  bottomId: number,
  x: number,
  y: number,
): void {
  const top = topId || MS_TILE.Empty;
  const bottom = bottomId || MS_TILE.Empty;

  if (!isTransparentLegacyTile(top)) {
    drawSprite(context, spritesheet, top, x, y);
    return;
  }

  if (bottom === MS_TILE.Nothing || bottom === MS_TILE.Empty) {
    drawSprite(context, spritesheet, MS_TILE.Empty, x, y);
  } else if (isTransparentLegacyTile(bottom)) {
    drawSprite(context, spritesheet, MS_TILE.Empty, x, y);
    drawSprite(context, spritesheet, bottom, x, y);
  } else {
    drawSprite(context, spritesheet, bottom, x, y);
  }

  drawSprite(context, spritesheet, top, x, y);
}

function drawInventoryTile(
  context: CanvasRenderingContext2D,
  spritesheet: CanvasImageSource,
  overlayId: number,
  x: number,
  y: number,
): void {
  drawSprite(context, spritesheet, MS_TILE.Empty, x, y);

  if (overlayId !== MS_TILE.Empty && overlayId !== MS_TILE.Nothing) {
    drawSprite(context, spritesheet, overlayId, x, y);
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
  spritesheet: CanvasImageSource,
  session: InteractiveGameSession | null,
  level: SeriesLevel | null,
  series: SeriesCatalogEntry | null,
  message: string | null,
  isLoading: boolean,
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
  const xOrigin = LEGACY_MAP_X - (viewX * LEGACY_TILE_SIZE) / 4;
  const yOrigin = LEGACY_MAP_Y - (viewY * LEGACY_TILE_SIZE) / 4;

  context.save();
  context.beginPath();
  context.rect(LEGACY_MAP_X, LEGACY_MAP_Y, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);
  context.clip();

  for (const cell of session.frame.cells) {
    const x = xOrigin + cell.position.x * LEGACY_TILE_SIZE;
    const y = yOrigin + cell.position.y * LEGACY_TILE_SIZE;
    if (x + LEGACY_TILE_SIZE <= LEGACY_MAP_X || x >= LEGACY_MAP_X + LEGACY_MAP_WIDTH) {
      continue;
    }
    if (y + LEGACY_TILE_SIZE <= LEGACY_MAP_Y || y >= LEGACY_MAP_Y + LEGACY_MAP_HEIGHT) {
      continue;
    }

    drawCompositedCell(context, spritesheet, cell.top.id, cell.bottom.id, x, y);
  }

  context.restore();

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
      spritesheet,
      snapshot.inventory.keys[index] > 0 ? tileId : MS_TILE.Empty,
      inventoryX + index * LEGACY_TILE_SIZE,
      inventoryY,
    );
  });
  bootIds.forEach((tileId, index) => {
    drawInventoryTile(
      context,
      spritesheet,
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

function useLegacyTilesheet(tilesUrl: string): CanvasImageSource | null {
  const [sheet, setSheet] = useState<CanvasImageSource | null>(null);

  useEffect(() => {
    let active = true;
    const image = new Image();
    setSheet(null);
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
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < imageData.data.length; index += 4) {
        if (
          imageData.data[index] === 255 &&
          imageData.data[index + 1] === 0 &&
          imageData.data[index + 2] === 255
        ) {
          imageData.data[index + 3] = 0;
        }
      }
      context.putImageData(imageData, 0, 0);
      setSheet(canvas);
    };

    return () => {
      active = false;
    };
  }, [tilesUrl]);

  return sheet;
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
}: LegacyCanvasScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spritesheet = useLegacyTilesheet(currentRuleset === "Lynx" ? lynxTilesUrl : msTilesUrl);

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

    if (!spritesheet) {
      context.fillStyle = COLORS.background;
      context.fillRect(0, 0, LEGACY_WINDOW_WIDTH, LEGACY_WINDOW_HEIGHT);
      drawText(context, "Loading tiles...", LEGACY_MARGIN, LEGACY_MARGIN, COLORS.text);
      return;
    }

    drawGameScreen(context, spritesheet, session, currentLevel, currentSeries, message, isLoading);
  }, [catalog, currentLevel, currentSeries, isLoading, message, mode, selectedSeriesFile, session, spritesheet]);

  return (
    <canvas
      className="legacy-canvas"
      height={LEGACY_WINDOW_HEIGHT}
      onClick={(event) => {
        if (mode !== "series-list") {
          return;
        }

        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        const scaleY = canvas.height / bounds.height;
        const y = (event.clientY - bounds.top) * scaleY;
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
      ref={canvasRef}
      width={LEGACY_WINDOW_WIDTH}
    />
  );
}
