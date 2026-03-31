import { useEffect, useRef } from "react";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { TIME_NIL } from "@content/api/score";
import type { InteractiveGameTileOverlayRender } from "@game-core/api/interactive";
import type { GameSnapshot } from "@game-core/api/types";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  isDefaultLegacyRenderTileSize,
  type LegacyRenderTileSize,
} from "@player-web/impl/legacyRenderPresets";
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
import {
  LEGACY_COLORS,
  LEGACY_INVENTORY_COUNT_FONT,
  LEGACY_SMALL_FONT,
  clamp,
  createCanvas,
  drawLegacyText,
  drawLegacyWrappedText,
  ensureCanvasSize,
} from "@player-web/impl/legacyCanvasShared";
import {
  drawVisibleLayerStack,
} from "@player-web/impl/legacyCanvasMapRenderer";
import {
  drawLegacyTile,
  getOrCreateOccupiedPetCarrierSprite,
  useLegacyTileset,
} from "@player-web/impl/legacyCanvasTileset";
import type { LegacyTileset } from "@player-web/impl/legacyTileset";
import { MS_STATUS_FLAG, MS_TILE } from "@ruleset-ms/api/tiles";
import type { LegacyLayerCanvasCache } from "@player-web/impl/legacyLayerCanvasCache";

const LIST_HEADER_Y = LEGACY_MARGIN + 8;
const LIST_FIRST_ROW_Y = LIST_HEADER_Y + 24;
const LIST_ROW_HEIGHT = 18;
const LIST_VISIBLE_ROWS = Math.max(1, Math.floor((LEGACY_TITLE_Y - LIST_FIRST_ROW_Y - LEGACY_MARGIN) / LIST_ROW_HEIGHT));
const FILE_COLUMN_X = LEGACY_MARGIN;
const RULESET_COLUMN_X = 520;

const LEGACY_INVENTORY_KEY_IDS = [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green] as const;
const LEGACY_INVENTORY_BOOT_IDS = [MS_TILE.Boots_Ice, MS_TILE.Boots_Slide, MS_TILE.Boots_Fire, MS_TILE.Boots_Water] as const;
const LEGACY_INVENTORY_TOOL_IDS = [MS_TILE.Sandbag] as const;

export type LegacyInventoryStripKind = "keys" | "boots" | "tools";
export type LegacyInventoryStripDirection = "horizontal" | "vertical";

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

export function clampSeriesScrollOffset(offset: number, itemCount: number): number {
  return clamp(offset, 0, Math.max(0, itemCount - LIST_VISIBLE_ROWS));
}

export function ensureSeriesVisible(offset: number, selectedIndex: number, itemCount: number): number {
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

export function seriesIndexAt(y: number, itemCount: number, scrollOffset: number): number {
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

export function drawInventoryTile(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  overlayId: number,
  render: InteractiveGameTileOverlayRender | null | undefined,
  countLabel: string | null,
  x: number,
  y: number,
): void {
  if (render?.mode === "tile" && render.petCarrierRender) {
    const compositeSprite = getOrCreateOccupiedPetCarrierSprite(tileset, render.petCarrierRender, 0);
    if (compositeSprite) {
      context.drawImage(compositeSprite.image, x + compositeSprite.offsetX, y + compositeSprite.offsetY);
      if (!countLabel) {
        return;
      }
    } else {
      drawLegacyTile(context, tileset, MS_TILE.Empty, x, y);
      const renderTileId = render.tileId;
      if (renderTileId !== MS_TILE.Empty && renderTileId !== MS_TILE.Nothing) {
        drawLegacyTile(context, tileset, renderTileId, x, y);
      }
    }
  } else {
    drawLegacyTile(context, tileset, MS_TILE.Empty, x, y);
    const renderTileId = render?.mode === "tile" ? render.tileId : overlayId;
    if (renderTileId !== MS_TILE.Empty && renderTileId !== MS_TILE.Nothing) {
      drawLegacyTile(context, tileset, renderTileId, x, y);
    }
  }

  if (!countLabel) {
    return;
  }

  context.save();
  context.font = LEGACY_INVENTORY_COUNT_FONT;
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.lineWidth = 3;
  context.strokeStyle = LEGACY_COLORS.background;
  context.fillStyle = LEGACY_COLORS.text;
  context.strokeText(countLabel, x + LEGACY_TILE_SIZE - 4, y + LEGACY_TILE_SIZE - 3);
  context.fillText(countLabel, x + LEGACY_TILE_SIZE - 4, y + LEGACY_TILE_SIZE - 3);
  context.restore();
}

function drawInventoryStrip(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  inventory: GameSnapshot["inventory"] | null,
  inventoryRender: InteractiveGameSession["frame"]["inventoryRender"] | null | undefined,
  kind: LegacyInventoryStripKind,
  direction: LegacyInventoryStripDirection,
  visualEnhancementsEnabled: boolean,
): void {
  const tileIds = inventoryStripTileIds(kind);
  const stripWidth = direction === "horizontal" ? tileIds.length * LEGACY_TILE_SIZE : LEGACY_TILE_SIZE;
  const stripHeight = direction === "horizontal" ? LEGACY_TILE_SIZE : tileIds.length * LEGACY_TILE_SIZE;
  context.fillStyle = LEGACY_COLORS.background;
  context.fillRect(0, 0, stripWidth, stripHeight);

  tileIds.forEach((tileId, index) => {
    const count = kind === "keys" ? inventory?.keys[index] ?? 0 : kind === "boots" ? inventory?.boots[index] ?? 0 : 0;
    drawInventoryTile(
      context,
      tileset,
      inventoryStripOverlayTileId(inventory, kind, index),
      kind === "tools" ? inventoryRender?.tools?.[index] ?? null : null,
      kind === "keys" && visualEnhancementsEnabled ? inventoryTileCountLabel(tileId, count) : null,
      direction === "horizontal" ? index * LEGACY_TILE_SIZE : 0,
      direction === "horizontal" ? 0 : index * LEGACY_TILE_SIZE,
    );
  });
}

export function drawLegacySeriesList(
  context: CanvasRenderingContext2D,
  catalog: SeriesCatalogEntry[],
  selectedSeriesFile: string | null,
  message: string | null,
  scrollOffset: number,
): void {
  context.fillStyle = LEGACY_COLORS.background;
  context.fillRect(0, 0, LEGACY_WINDOW_WIDTH, LEGACY_WINDOW_HEIGHT);

  drawLegacyText(context, "Filename", FILE_COLUMN_X, LIST_HEADER_Y, LEGACY_COLORS.text);
  drawLegacyText(context, "Ruleset", RULESET_COLUMN_X, LIST_HEADER_Y, LEGACY_COLORS.text, "center");
  drawLegacyText(
    context,
    `${Math.min(catalog.length, scrollOffset + 1)}-${Math.min(catalog.length, scrollOffset + LIST_VISIBLE_ROWS)} / ${catalog.length}`,
    LEGACY_WINDOW_WIDTH - LEGACY_MARGIN,
    LIST_HEADER_Y,
    LEGACY_COLORS.dim,
    "right",
    LEGACY_SMALL_FONT,
  );

  catalog.slice(scrollOffset, scrollOffset + LIST_VISIBLE_ROWS).forEach((series, visibleIndex) => {
    const y = LIST_FIRST_ROW_Y + visibleIndex * LIST_ROW_HEIGHT;
    const color = series.filebase === selectedSeriesFile ? LEGACY_COLORS.highlight : LEGACY_COLORS.text;
    drawLegacyText(context, series.filebase, FILE_COLUMN_X, y, color);
    drawLegacyText(context, series.ruleset, RULESET_COLUMN_X, y, color, "center");
  });

  if (scrollOffset > 0) {
    drawLegacyText(context, "^^^", RULESET_COLUMN_X + 72, LIST_FIRST_ROW_Y, LEGACY_COLORS.dim, "right", LEGACY_SMALL_FONT);
  }
  if (scrollOffset + LIST_VISIBLE_ROWS < catalog.length) {
    drawLegacyText(
      context,
      "vvv",
      RULESET_COLUMN_X + 72,
      LIST_FIRST_ROW_Y + (LIST_VISIBLE_ROWS - 1) * LIST_ROW_HEIGHT,
      LEGACY_COLORS.dim,
      "right",
      LEGACY_SMALL_FONT,
    );
  }

  drawLegacyText(
    context,
    message ?? "Welcome to Tile World. Type Enter to proceed.",
    LEGACY_MARGIN,
    LEGACY_TITLE_Y,
    message ? LEGACY_COLORS.highlight : LEGACY_COLORS.dim,
    "left",
    LEGACY_SMALL_FONT,
  );
}

export function drawLegacyGameScreen(
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
  context.fillStyle = LEGACY_COLORS.background;
  context.fillRect(0, 0, LEGACY_WINDOW_WIDTH, LEGACY_WINDOW_HEIGHT);

  if (!session || !level || !series) {
    drawLegacyText(context, isLoading ? "Loading level..." : "No level loaded.", LEGACY_MARGIN, LEGACY_MARGIN, LEGACY_COLORS.text);
    return;
  }

  const snapshot = session.frame.snapshot;
  const viewX = clamp(snapshot.view.x / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);
  const viewY = clamp(snapshot.view.y / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4);
  const timerval = (snapshot.statusFlags & MS_STATUS_FLAG.NoAnimation) !== 0 ? -1 : snapshot.currentTime;
  drawVisibleLayerStack(context, tileset, session, ruleset, timerval, viewX, viewY, lowerLayerCache, visualEnhancementsEnabled);

  drawLegacyText(context, `Level ${level.number}`, LEGACY_INFO_X, LEGACY_MAP_Y, LEGACY_COLORS.text);
  drawLegacyText(context, `Password: ${level.password || "----"}`, LEGACY_INFO_X, LEGACY_MAP_Y + 18, LEGACY_COLORS.text);
  drawLegacyText(context, "Chips", LEGACY_INFO_X, LEGACY_MAP_Y + 54, LEGACY_COLORS.text);
  drawLegacyText(context, "Time", LEGACY_INFO_X, LEGACY_MAP_Y + 72, LEGACY_COLORS.text);
  drawLegacyText(context, String(snapshot.chipsNeeded), LEGACY_WINDOW_WIDTH - LEGACY_MARGIN, LEGACY_MAP_Y + 54, LEGACY_COLORS.text, "right");
  drawLegacyText(context, formatLevelTimeLeft(session), LEGACY_WINDOW_WIDTH - LEGACY_MARGIN, LEGACY_MAP_Y + 72, LEGACY_COLORS.text, "right");

  const bestTime = formatBestTime(level);
  if (bestTime) {
    const bestTimeLabel = snapshot.timelimit > 0 ? `Best time: ${bestTime}` : `(Best time: ${bestTime})`;
    drawLegacyText(context, bestTimeLabel, LEGACY_INFO_X, LEGACY_MAP_Y + 108, LEGACY_COLORS.dim);
  }

  const inventoryX = LEGACY_INFO_X;
  const inventoryY = LEGACY_MAP_Y + 128;
  const inventoryKinds = level.hasSpecialTools === true
    ? (["keys", "boots", "tools"] as const)
    : (["keys", "boots"] as const);
  inventoryKinds.forEach((kind, rowIndex) => {
    inventoryStripTileIds(kind).forEach((tileId, columnIndex) => {
      const count = kind === "keys" ? snapshot.inventory.keys[columnIndex] ?? 0 : 0;
      drawInventoryTile(
        context,
        tileset,
        inventoryStripOverlayTileId(snapshot.inventory, kind, columnIndex),
        kind === "tools" ? session.frame.inventoryRender?.tools?.[columnIndex] ?? null : null,
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
    drawLegacyWrappedText(
      context,
      hintText,
      LEGACY_INFO_X,
      inventoryY + LEGACY_TILE_SIZE * inventoryKinds.length + LEGACY_MARGIN,
      LEGACY_WINDOW_WIDTH - LEGACY_MARGIN - LEGACY_INFO_X,
      LEGACY_COLORS.text,
      (snapshot.statusFlags & MS_STATUS_FLAG.ShowHint) !== 0 || snapshot.status !== "playing",
    );
  }

  drawLegacyText(context, level.name, LEGACY_MAP_X, LEGACY_TITLE_Y, LEGACY_COLORS.text);
  drawLegacyText(
    context,
    message ?? (isLoading ? "Loading level..." : series.filebase),
    LEGACY_INFO_X,
    LEGACY_TITLE_Y,
    message ? LEGACY_COLORS.highlight : LEGACY_COLORS.dim,
    "left",
    LEGACY_SMALL_FONT,
  );
}

export function drawLegacyGameMapOnly(
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
  context.fillStyle = LEGACY_COLORS.background;
  context.fillRect(0, 0, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);

  if (!session || !level || !series) {
    drawLegacyText(context, isLoading ? "Loading level..." : "No level loaded.", 12, 12, LEGACY_COLORS.text);
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

export interface LegacyInventoryStripProps {
  className?: string;
  currentRuleset: SeriesCatalogEntry["ruleset"] | null;
  direction?: LegacyInventoryStripDirection;
  inventory: GameSnapshot["inventory"] | null;
  inventoryRender?: InteractiveGameSession["frame"]["inventoryRender"] | null;
  kind: LegacyInventoryStripKind;
  renderTileSize?: LegacyRenderTileSize;
  visualEnhancementsEnabled?: boolean;
}

export function LegacyInventoryStrip({
  className,
  currentRuleset,
  direction = "vertical",
  inventory,
  inventoryRender = null,
  kind,
  renderTileSize = LEGACY_TILE_SIZE,
  visualEnhancementsEnabled = true,
}: LegacyInventoryStripProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scaledCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileset = useLegacyTileset(currentRuleset === "Lynx" ? "Lynx" : "MS");
  const { height: sourceHeight, width: sourceWidth } = inventoryStripPixelDimensionsForKind(LEGACY_TILE_SIZE, direction, kind);
  const { height: targetHeight, width: targetWidth } = inventoryStripPixelDimensionsForKind(renderTileSize, direction, kind);
  const usesDefaultTileSize = isDefaultLegacyRenderTileSize(renderTileSize);

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
      context.fillStyle = LEGACY_COLORS.background;
      context.fillRect(0, 0, sourceWidth, sourceHeight);
      if (tileset) {
        drawInventoryStrip(context, tileset, inventory, inventoryRender, kind, direction, visualEnhancementsEnabled);
      }
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
    scaledContext.fillStyle = LEGACY_COLORS.background;
    scaledContext.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
    if (tileset) {
      drawInventoryStrip(scaledContext, tileset, inventory, inventoryRender, kind, direction, visualEnhancementsEnabled);
    }

    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(scaledCanvas, 0, 0, targetWidth, targetHeight);
  }, [
    direction,
    inventory,
    inventoryRender,
    kind,
    sourceHeight,
    sourceWidth,
    targetHeight,
    targetWidth,
    tileset,
    usesDefaultTileSize,
    visualEnhancementsEnabled,
  ]);

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
