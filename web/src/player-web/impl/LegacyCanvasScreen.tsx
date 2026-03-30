import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  isDefaultLegacyRenderTileSize,
  legacyMapPixelsForTileSize,
  type LegacyRenderTileSize,
} from "@player-web/impl/legacyRenderPresets";
import { measurePerfSync } from "@player-web/impl/runtimePerf";
import {
  buildLegacyGameDrawStateKey,
  isThinWallTileId,
  mapPositionAtCanvasPoint,
  prewarmVisibleLayerCaches,
  shouldUseLegacyCombinedCellSprite,
  visualEnhancementActorMarker,
  visualEnhancementBlockWindowOpacity,
  visualEnhancementThinWallActorPassTileId,
  visualEnhancementThinWallOverlayTileId,
  withLegacyMapViewportClip,
} from "@player-web/impl/legacyCanvasMapRenderer";
import {
  clampSeriesScrollOffset,
  drawLegacyGameMapOnly,
  drawLegacyGameScreen,
  drawLegacySeriesList,
  ensureSeriesVisible,
  inventoryStripPixelDimensions,
  inventoryStripPixelDimensionsForKind,
  inventoryTileCountLabel,
  LegacyInventoryStrip,
  seriesIndexAt,
} from "@player-web/impl/legacyCanvasHud";
import {
  applyLegacyTileOverrides,
  createLegacyArtworkSpriteFromFrame,
  prewarmLegacyTileset,
  useLegacyTileset,
} from "@player-web/impl/legacyCanvasTileset";
import {
  clearLayerCanvasCache,
  createLayerCanvasCache,
} from "@player-web/impl/legacyLayerCanvasCache";
import {
  LEGACY_COLORS,
  clamp,
  createCanvas,
  drawLegacyText,
  ensureCanvasSize,
} from "@player-web/impl/legacyCanvasShared";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import {
  LEGACY_MAP_HEIGHT,
  LEGACY_MAP_WIDTH,
  LEGACY_MAP_X,
  LEGACY_MAP_Y,
  LEGACY_MARGIN,
  LEGACY_TILE_SIZE,
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

function drawLegacyTilesLoadingPlaceholder(
  context: CanvasRenderingContext2D,
  presentation: LegacyCanvasPresentation,
): void {
  context.fillStyle = LEGACY_COLORS.background;
  context.fillRect(
    0,
    0,
    presentation === "map-only" ? LEGACY_MAP_WIDTH : LEGACY_WINDOW_WIDTH,
    presentation === "map-only" ? LEGACY_MAP_HEIGHT : LEGACY_WINDOW_HEIGHT,
  );
  drawLegacyText(context, "Loading tiles...", LEGACY_MARGIN, LEGACY_MARGIN, LEGACY_COLORS.text);
}

export function shouldBypassLegacyFrameDrawMemo(session: InteractiveGameSession | null): boolean {
  return (session?.frame.visibleLayers.length ?? 0) > 1;
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
  const lowerLayerCacheRef = useRef(createLayerCanvasCache());
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
      drawLegacySeriesList(targetContext, catalog, selectedSeriesFile, message, seriesScrollOffset);
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
        drawLegacyTilesLoadingPlaceholder(scaledMapContext, "map-only");
      } else {
        drawLegacyGameMapOnly(
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
      drawLegacyTilesLoadingPlaceholder(targetContext, presentation);
      return;
    }

    if (presentation === "map-only") {
      drawLegacyGameMapOnly(
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

    drawLegacyGameScreen(
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
      prewarmVisibleLayerCaches(
        tileset,
        activeSession,
        currentRuleset,
        lowerLayerCacheRef.current,
        visualEnhancementsEnabled,
      );
    });
  }, [currentLevel?.number, currentRuleset, currentSeries?.filebase, liveSessionRef, mode, session, tileset, visualEnhancementsEnabled]);

  useEffect(() => {
    if (mode === "game") {
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
    drawFrame(context, liveSessionRef?.current ?? session);
  }, [
    catalog,
    currentLevel,
    currentRuleset,
    currentSeries,
    drawFrame,
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
      const drawStateKey = buildLegacyGameDrawStateKey(
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
      const shouldRedrawUnconditionally = shouldBypassLegacyFrameDrawMemo(activeSession);

      if (shouldRedrawUnconditionally || drawStateKey !== lastDrawStateKey) {
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
    drawFrame,
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
        if (files.length > 0) {
          onDatDrop(files);
        }
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

export {
  applyLegacyTileOverrides,
  createLegacyArtworkSpriteFromFrame,
  inventoryStripPixelDimensions,
  inventoryStripPixelDimensionsForKind,
  inventoryTileCountLabel,
  isThinWallTileId,
  LegacyInventoryStrip,
  prewarmLegacyTileset,
  shouldUseLegacyCombinedCellSprite,
  visualEnhancementActorMarker,
  visualEnhancementBlockWindowOpacity,
  visualEnhancementThinWallActorPassTileId,
  visualEnhancementThinWallOverlayTileId,
  withLegacyMapViewportClip,
};
