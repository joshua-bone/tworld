import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  isDefaultLegacyRenderTileSize,
  legacyMapPixelsForTileSize,
  type LegacyRenderTileSize,
} from "@player-web/impl/legacyRenderPresets";
import {
  createSessionVisualLoadLevelKey,
  createSessionVisualLoadSessionKey,
  measurePerfSync,
  recordPerfMeasurement,
  recordSessionVisualLoadPaint,
  setPerfDiagnosticsEnabled,
  snapshotRuntimePerf,
} from "@player-web/impl/runtimePerf";
import {
  isThinWallTileId,
  collectVisibleLayerCacheWarmupTasks,
  mapPositionAtCanvasPoint,
  prewarmVisibleLayerCacheTask,
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
  resolveInventoryKeyCountLabelsEnabled,
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
  buildLegacyCanvasDebugReadout,
  buildLegacyCanvasPerfReadout,
  type LegacyCanvasPerfReadout,
  type LegacyCanvasPerfWindowSnapshot,
} from "@player-web/impl/legacyCanvasDebug";
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
  LEGACY_MAP_TILES,
  LEGACY_MAP_X,
  LEGACY_MAP_Y,
  LEGACY_MARGIN,
  LEGACY_TILE_SIZE,
  LEGACY_WINDOW_HEIGHT,
  LEGACY_WINDOW_WIDTH,
} from "@player-web/impl/legacySprites";
import {
  createDefaultBrowserSpecialModesSettings,
  type BrowserSpecialModesSettings,
  type DihedralOrientation,
} from "@player-web/impl/specialModesSettings";
import {
  createMonsterMadnessTileset,
  createDihedralArtworkTileset,
  drawSpecialModesMap,
  inverseTransformCanvasPoint,
  isFlashlightDirectionTransitionActive,
  sessionWithoutMonsterArtwork,
} from "@player-web/impl/specialModesRender";
import type { SpecialModesRuntimeSnapshot } from "@player-web/impl/useSpecialModesRuntime";

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
  inventoryKeyCountLabelsEnabled?: boolean;
  viewportTileCount?: number;
  specialModesSettings?: BrowserSpecialModesSettings;
  specialModesRuntimeRef?: Readonly<{ current: SpecialModesRuntimeSnapshot }>;
  specialModesArtworkOrientation?: DihedralOrientation;
  visualEnhancementsEnabled?: boolean;
  debugModeEnabled?: boolean;
  buildCommitHash?: string;
}

interface LegacyCanvasPerfTrackerState {
  frameFps: number;
  frameSampleCount: number;
  frameWindowSamples: LegacyCanvasPerfWindowSample[];
  gameHz: number;
  gameSampleElapsedMs: number;
  gameSampleTickDelta: number;
  gameWindowSamples: LegacyCanvasPerfWindowSample[];
  lastFrameSampleAtMs: number | null;
  lastGameSampleAtMs: number | null;
  lastGameTick: number | null;
  lastRenderSampleAtMs: number | null;
  lastRenderSampleCount: number;
  renderFps: number;
  renderWindowSamples: LegacyCanvasPerfWindowSample[];
  sessionKey: string | null;
}

const DEBUG_PERF_SAMPLE_INTERVAL_MS = 500;
const DEBUG_PERF_WINDOW_MS = 5000;
const INITIAL_RENDER_WARMUP_SLICE_BUDGET_MS = 6;
const INITIAL_RENDER_WARMUP_IDLE_TIMEOUT_MS = 120;

type IdleCallbackHandle = number;
type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type BackgroundCallbackHandle =
  | { kind: "idle"; id: IdleCallbackHandle }
  | { kind: "timeout"; id: number };

interface LegacyCanvasPerfWindowSample {
  atMs: number;
  value: number;
}

function createLegacyCanvasPerfTrackerState(): LegacyCanvasPerfTrackerState {
  return {
    frameFps: 0,
    frameSampleCount: 0,
    frameWindowSamples: [],
    gameHz: 0,
    gameSampleElapsedMs: 0,
    gameSampleTickDelta: 0,
    gameWindowSamples: [],
    lastFrameSampleAtMs: null,
    lastGameSampleAtMs: null,
    lastGameTick: null,
    lastRenderSampleAtMs: null,
    lastRenderSampleCount: 0,
    renderFps: 0,
    renderWindowSamples: [],
    sessionKey: null,
  };
}

function pruneLegacyCanvasPerfWindowSamples(
  samples: LegacyCanvasPerfWindowSample[],
  now: number,
): void {
  while (samples.length > 0 && now - samples[0]!.atMs > DEBUG_PERF_WINDOW_MS) {
    samples.shift();
  }
}

function recordLegacyCanvasPerfWindowSample(
  samples: LegacyCanvasPerfWindowSample[],
  now: number,
  value: number,
): LegacyCanvasPerfWindowSnapshot {
  samples.push({ atMs: now, value });
  return snapshotLegacyCanvasPerfWindow(samples, now);
}

function snapshotLegacyCanvasPerfWindow(
  samples: LegacyCanvasPerfWindowSample[],
  now: number,
): LegacyCanvasPerfWindowSnapshot {
  pruneLegacyCanvasPerfWindowSamples(samples, now);
  if (samples.length === 0) {
    return {
      avgValue: 0,
      lastValue: 0,
      maxValue: 0,
      samples: 0,
      windowMs: DEBUG_PERF_WINDOW_MS,
    };
  }

  let totalValue = 0;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    totalValue += sample.value;
    maxValue = Math.max(maxValue, sample.value);
  }

  return {
    avgValue: totalValue / samples.length,
    lastValue: samples[samples.length - 1]!.value,
    maxValue,
    samples: samples.length,
    windowMs: DEBUG_PERF_WINDOW_MS,
  };
}

function formatPerfCaptureTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function requestBackgroundWarmupCallback(
  callback: (deadline: IdleDeadline | null) => void,
): BackgroundCallbackHandle {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const windowWithIdleCallback = window as Window & {
      requestIdleCallback?: (
        callback: (deadline: IdleDeadline) => void,
        options?: { timeout: number },
      ) => IdleCallbackHandle;
    };
    const idleId = windowWithIdleCallback.requestIdleCallback?.(callback, {
      timeout: INITIAL_RENDER_WARMUP_IDLE_TIMEOUT_MS,
    });
    if (typeof idleId === "number") {
      return {
        kind: "idle",
        id: idleId,
      };
    }
  }

  return {
    kind: "timeout",
    id: window.setTimeout(() => {
      callback(null);
    }, 16),
  };
}

function cancelBackgroundWarmupCallback(handle: BackgroundCallbackHandle | null): void {
  if (!handle) {
    return;
  }

  if (handle.kind === "idle") {
    const windowWithIdleCallback = window as Window & {
      cancelIdleCallback?: (id: IdleCallbackHandle) => void;
    };
    windowWithIdleCallback.cancelIdleCallback?.(handle.id);
    return;
  }

  window.clearTimeout(handle.id);
}

function buildLegacyCanvasRenderContextKey(options: {
  currentLevel: SeriesLevel | null;
  currentRuleset: SeriesCatalogEntry["ruleset"] | null;
  currentSeries: SeriesCatalogEntry | null;
  hasTileset: boolean;
  isLoading: boolean;
  message: string | null;
  presentation: LegacyCanvasPresentation;
  inventoryKeyCountLabelsEnabled: boolean;
  viewportTileCount: number;
  visualEnhancementsEnabled: boolean;
}): string {
  return [
    options.currentSeries?.filebase ?? "",
    options.currentLevel?.number ?? 0,
    options.currentRuleset ?? "None",
    options.isLoading ? 1 : 0,
    options.message ?? "",
    options.presentation,
    options.viewportTileCount,
    options.hasTileset ? 1 : 0,
    options.inventoryKeyCountLabelsEnabled ? 1 : 0,
    options.visualEnhancementsEnabled ? 1 : 0,
  ].join(":");
}

function sessionPerfKey(session: InteractiveGameSession | null): string | null {
  if (!session) {
    return null;
  }

  return `${session.request.seriesFile}:${session.request.levelNumber}:${session.request.ruleset}`;
}

function selectedLevelPerfKey(options: {
  currentRuleset: SeriesCatalogEntry["ruleset"] | null;
  selectedLevelNumber: number | null;
  selectedSeriesFile: string | null;
}): string | null {
  if (
    !options.selectedSeriesFile ||
    options.selectedLevelNumber === null ||
    (options.currentRuleset !== "MS" && options.currentRuleset !== "Lynx")
  ) {
    return null;
  }

  return createSessionVisualLoadLevelKey({
    seriesFile: options.selectedSeriesFile,
    levelNumber: options.selectedLevelNumber,
    ruleset: options.currentRuleset,
  });
}

function updateLegacyCanvasPerfTracker(
  state: LegacyCanvasPerfTrackerState,
  now: number,
  session: InteractiveGameSession | null,
  buildCommitHash: string,
): LegacyCanvasPerfReadout {
  const perf = snapshotRuntimePerf();
  const metrics = perf.metrics;
  const nextSessionKey = sessionPerfKey(session);
  if (state.sessionKey !== nextSessionKey) {
    const nextState = createLegacyCanvasPerfTrackerState();
    state.frameFps = nextState.frameFps;
    state.frameSampleCount = nextState.frameSampleCount;
    state.frameWindowSamples = nextState.frameWindowSamples;
    state.gameHz = nextState.gameHz;
    state.gameSampleElapsedMs = nextState.gameSampleElapsedMs;
    state.gameSampleTickDelta = nextState.gameSampleTickDelta;
    state.gameWindowSamples = nextState.gameWindowSamples;
    state.lastFrameSampleAtMs = nextState.lastFrameSampleAtMs;
    state.lastGameSampleAtMs = nextState.lastGameSampleAtMs;
    state.lastGameTick = nextState.lastGameTick;
    state.lastRenderSampleAtMs = nextState.lastRenderSampleAtMs;
    state.lastRenderSampleCount = nextState.lastRenderSampleCount;
    state.renderFps = nextState.renderFps;
    state.renderWindowSamples = nextState.renderWindowSamples;
    state.sessionKey = nextSessionKey;
  }

  pruneLegacyCanvasPerfWindowSamples(state.frameWindowSamples, now);
  pruneLegacyCanvasPerfWindowSamples(state.gameWindowSamples, now);
  pruneLegacyCanvasPerfWindowSamples(state.renderWindowSamples, now);

  state.frameSampleCount += 1;
  if (state.lastFrameSampleAtMs === null) {
    state.lastFrameSampleAtMs = now;
  } else if (now - state.lastFrameSampleAtMs >= DEBUG_PERF_SAMPLE_INTERVAL_MS) {
    const elapsedMs = now - state.lastFrameSampleAtMs;
    state.frameFps = elapsedMs > 0 ? (state.frameSampleCount * 1000) / elapsedMs : 0;
    recordLegacyCanvasPerfWindowSample(state.frameWindowSamples, now, state.frameFps);
    state.frameSampleCount = 0;
    state.lastFrameSampleAtMs = now;
  }

  if (state.lastRenderSampleAtMs === null) {
    state.lastRenderSampleAtMs = now;
    state.lastRenderSampleCount = metrics.renderMs.samples;
  } else if (now - state.lastRenderSampleAtMs >= DEBUG_PERF_SAMPLE_INTERVAL_MS) {
    const elapsedMs = now - state.lastRenderSampleAtMs;
    const renderSamples = metrics.renderMs.samples - state.lastRenderSampleCount;
    state.renderFps = elapsedMs > 0 ? (renderSamples * 1000) / elapsedMs : 0;
    recordLegacyCanvasPerfWindowSample(state.renderWindowSamples, now, state.renderFps);
    state.lastRenderSampleAtMs = now;
    state.lastRenderSampleCount = metrics.renderMs.samples;
  }

  if (state.lastGameSampleAtMs === null) {
    state.lastGameSampleAtMs = now;
    state.lastGameTick = session?.frame.snapshot.tick ?? null;
  } else if (now - state.lastGameSampleAtMs >= DEBUG_PERF_SAMPLE_INTERVAL_MS) {
    const elapsedMs = now - state.lastGameSampleAtMs;
    const currentTick = session?.frame.snapshot.tick ?? null;
    const currentStatus = session?.frame.snapshot.status ?? null;
    const tickDelta =
      currentTick !== null && state.lastGameTick !== null
        ? Math.max(0, currentTick - state.lastGameTick)
        : 0;
    state.gameSampleElapsedMs = elapsedMs;
    state.gameSampleTickDelta = tickDelta;
    state.gameHz =
      elapsedMs > 0 &&
      currentStatus === "playing" &&
      currentTick !== null &&
      state.lastGameTick !== null
        ? Math.max(0, (tickDelta * 1000) / elapsedMs)
        : 0;
    recordLegacyCanvasPerfWindowSample(state.gameWindowSamples, now, state.gameHz);
    state.lastGameSampleAtMs = now;
    state.lastGameTick = currentTick;
  }

  return {
    audioBootstrapMs: metrics.audioBootstrapMs,
    buildCommitHash,
    cappedCatchUpBatches: perf.scheduler.cappedBatchCount,
    clockMode: "worker-accumulator",
    droppedCatchUpTicks: perf.scheduler.droppedTickCount,
    frameFps: state.frameFps,
    frameFpsWindow: snapshotLegacyCanvasPerfWindow(state.frameWindowSamples, now),
    firstCanvasPaintMs: metrics.firstCanvasPaintMs,
    firstInteractiveDrawMs: metrics.firstInteractiveDrawMs,
    renderFps: state.renderFps,
    renderFpsWindow: snapshotLegacyCanvasPerfWindow(state.renderWindowSamples, now),
    gameHz: state.gameHz,
    gameSampleElapsedMs: state.gameSampleElapsedMs,
    gameSampleTickDelta: state.gameSampleTickDelta,
    gameHzWindow: snapshotLegacyCanvasPerfWindow(state.gameWindowSamples, now),
    initialFrameProjectionMs: metrics.initialFrameProjectionMs,
    initialHistoryProjectionMs: metrics.initialHistoryProjectionMs,
    initialProjectionMs: metrics.initialProjectionMs,
    initialRenderWarmupMs: metrics.initialRenderWarmupMs,
    initialRuntimeInitMs: metrics.initialRuntimeInitMs,
    initialSessionPackagingMs: metrics.initialSessionPackagingMs,
    initialSessionStateMs: metrics.initialSessionStateMs,
    lastCatchUpBatchTicks: perf.scheduler.lastBatchTicks,
    levelLoadMs: metrics.levelLoadMs,
    loopDriftMs: metrics.loopDriftMs,
    maxCatchUpBatchTicks: perf.scheduler.maxBatchTicks,
    prepareLevelMs: metrics.prepareLevelMs,
    renderMs: metrics.renderMs,
    sessionLoadMs: metrics.sessionLoadMs,
    tickMs: metrics.tickMs,
    tilesetBuildMs: metrics.tilesetBuildMs,
    tilesetImageLoadMs: metrics.tilesetImageLoadMs,
    tilesetLoadMs: metrics.tilesetLoadMs,
    workerSessionStartMs: metrics.workerSessionStartMs,
    workerAdvancePayloadBytes: perf.worker.advancePayloadBytes,
    workerAdvanceRoundTripMs: perf.worker.advanceRoundTripMs,
  };
}

function drawLegacyTilesLoadingPlaceholder(
  context: CanvasRenderingContext2D,
  presentation: LegacyCanvasPresentation,
  viewportTileCount = LEGACY_MAP_TILES,
): void {
  const viewportPixelSize = viewportTileCount * LEGACY_TILE_SIZE;
  context.fillStyle = LEGACY_COLORS.background;
  context.fillRect(
    0,
    0,
    presentation === "map-only" ? viewportPixelSize : LEGACY_WINDOW_WIDTH,
    presentation === "map-only" ? viewportPixelSize : LEGACY_WINDOW_HEIGHT,
  );
  drawLegacyText(context, "Loading tiles...", LEGACY_MARGIN, LEGACY_MARGIN, LEGACY_COLORS.text);
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
  inventoryKeyCountLabelsEnabled,
  viewportTileCount = LEGACY_MAP_TILES,
  specialModesSettings: specialModesSettingsProp,
  specialModesRuntimeRef,
  specialModesArtworkOrientation = "identity",
  visualEnhancementsEnabled = true,
  debugModeEnabled = false,
  buildCommitHash = "unknown",
}: LegacyCanvasScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scaledMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullSceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainSceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visibilitySceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lowerLayerCacheRef = useRef(createLayerCanvasCache());
  const perfTrackerRef = useRef(createLegacyCanvasPerfTrackerState());
  const debugReadoutKeyRef = useRef("");
  const tileset = useLegacyTileset(currentRuleset === "Lynx" || currentRuleset === "Hybrid" ? "Lynx" : "MS");
  const specialModesSettingsSeedRef = useRef(createDefaultBrowserSpecialModesSettings());
  const specialModesSettings = specialModesSettingsProp ?? specialModesSettingsSeedRef.current;
  const monsterMadnessTileset = useMemo(
    () => tileset ? createMonsterMadnessTileset(tileset, specialModesSettings.monsterMadness) : null,
    [
      specialModesSettings.monsterMadness.enabled,
      specialModesSettings.monsterMadness.includePlayer,
      specialModesSettings.monsterMadness.seed,
      tileset,
    ],
  );
  const renderTileset = useMemo(
    () => monsterMadnessTileset
      ? createDihedralArtworkTileset(monsterMadnessTileset, specialModesArtworkOrientation)
      : null,
    [monsterMadnessTileset, specialModesArtworkOrientation],
  );
  const specialSceneCacheRef = useRef<{
    key: string;
    session: InteractiveGameSession;
    tileset: object;
  } | null>(null);
  const [isDatDragActive, setIsDatDragActive] = useState(false);
  const [hoveredMapPosition, setHoveredMapPosition] = useState<number | null>(null);
  const [capturedDebugReadout, setCapturedDebugReadout] = useState<string[] | null>(null);
  const [debugReadout, setDebugReadout] = useState<string[]>([]);
  const [seriesScrollOffset, setSeriesScrollOffset] = useState(0);
  const effectiveViewportTileCount = presentation === "map-only" ? viewportTileCount : LEGACY_MAP_TILES;
  const sourceMapPixelSize = effectiveViewportTileCount * LEGACY_TILE_SIZE;
  const targetMapWidth = legacyMapPixelsForTileSize(renderTileSize, effectiveViewportTileCount);
  const targetMapHeight = legacyMapPixelsForTileSize(renderTileSize, effectiveViewportTileCount);
  const usesDefaultMapTileSize = isDefaultLegacyRenderTileSize(renderTileSize);
  const keyCountLabelsEnabled = resolveInventoryKeyCountLabelsEnabled(
    inventoryKeyCountLabelsEnabled,
    visualEnhancementsEnabled,
  );
  const selectedSeriesIndex = catalog.findIndex((series) => series.filebase === selectedSeriesFile);
  const hasSpecialModesRendering =
    specialModesSettings.visibility.mode !== "normal" ||
    specialModesSettings.monsterMadness.enabled ||
    specialModesSettings.monsterRipples.enabled ||
    specialModesSettings.transform.mode !== "off";
  const requiresSpecialModesComposite =
    specialModesSettings.visibility.mode !== "normal" ||
    specialModesSettings.monsterRipples.enabled ||
    specialModesSettings.transform.mode !== "off";
  const usesFogVisibility =
    specialModesSettings.visibility.mode === "flashlight-fog" ||
    specialModesSettings.visibility.mode === "lantern-fog" ||
    specialModesSettings.visibility.mode === "line-of-sight-fog";
  const usesFlashlightVisibility =
    specialModesSettings.visibility.mode === "flashlight" ||
    specialModesSettings.visibility.mode === "flashlight-fog";
  const usesMonsterRipples = specialModesSettings.monsterRipples.enabled;
  const needsMonsterlessScene = usesFogVisibility || usesMonsterRipples;

  useEffect(() => {
    setPerfDiagnosticsEnabled(debugModeEnabled);
    return () => {
      setPerfDiagnosticsEnabled(false);
    };
  }, [debugModeEnabled]);

  const mapPositionForCanvasPoint = useEffectEvent((
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): number | null => {
    const activeSession = liveSessionRef?.current ?? session;
    if (mode === "series-list" || !activeSession) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const x = (clientX - bounds.left) * scaleX;
    const y = (clientY - bounds.top) * scaleY;
    const mapScale = presentation === "map-only" ? LEGACY_TILE_SIZE / renderTileSize : 1;
    let sourceX = presentation === "map-only" ? x * mapScale : x - LEGACY_MAP_X;
    let sourceY = presentation === "map-only" ? y * mapScale : y - LEGACY_MAP_Y;
    const runtime = specialModesRuntimeRef?.current;
    if (presentation === "map-only" && hasSpecialModesRendering && runtime) {
      if (runtime.transition) {
        return null;
      }
      const mapped = inverseTransformCanvasPoint(
        sourceX - runtime.warningShakeOffsetPx,
        sourceY,
        sourceMapPixelSize,
        runtime.orientation,
      );
      sourceX = mapped.x;
      sourceY = mapped.y;
    }
    return mapPositionAtCanvasPoint(
      activeSession,
      currentRuleset,
      sourceX + LEGACY_MAP_X,
      sourceY + LEGACY_MAP_Y,
      effectiveViewportTileCount,
    );
  });

  const drawMapOnlyFrame = useEffectEvent((
    targetContext: CanvasRenderingContext2D,
    activeSession: InteractiveGameSession | null,
  ) => {
    if (!renderTileset || !requiresSpecialModesComposite || !activeSession) {
      if (!renderTileset) {
        drawLegacyTilesLoadingPlaceholder(targetContext, "map-only", effectiveViewportTileCount);
      } else {
        drawLegacyGameMapOnly(
          targetContext,
          renderTileset,
          activeSession,
          currentLevel,
          currentSeries,
          isLoading,
          currentRuleset,
          lowerLayerCacheRef.current,
          visualEnhancementsEnabled,
          effectiveViewportTileCount,
        );
      }
      return;
    }

    const fullSceneCanvas = fullSceneCanvasRef.current ?? createCanvas(sourceMapPixelSize, sourceMapPixelSize);
    fullSceneCanvasRef.current = fullSceneCanvas;
    ensureCanvasSize(fullSceneCanvas, sourceMapPixelSize, sourceMapPixelSize);
    const fullSceneContext = fullSceneCanvas.getContext("2d");
    if (!fullSceneContext) {
      return;
    }
    const specialSceneKey = [
      currentSeries?.filebase ?? "",
      currentLevel?.number ?? 0,
      currentRuleset ?? "None",
      effectiveViewportTileCount,
      isLoading ? 1 : 0,
      needsMonsterlessScene ? 1 : 0,
      visualEnhancementsEnabled ? 1 : 0,
      sourceMapPixelSize,
    ].join(":");
    const cachedScene = specialSceneCacheRef.current;
    const shouldRebuildScenes =
      cachedScene?.session !== activeSession ||
      cachedScene.tileset !== renderTileset ||
      cachedScene.key !== specialSceneKey;

    if (shouldRebuildScenes) {
      fullSceneContext.imageSmoothingEnabled = false;
      drawLegacyGameMapOnly(
        fullSceneContext,
        renderTileset,
        activeSession,
        currentLevel,
        currentSeries,
        isLoading,
        currentRuleset,
        lowerLayerCacheRef.current,
        visualEnhancementsEnabled,
        effectiveViewportTileCount,
      );
    }

    let terrainSceneCanvas: HTMLCanvasElement | null = null;
    if (needsMonsterlessScene) {
      terrainSceneCanvas = terrainSceneCanvasRef.current ?? createCanvas(sourceMapPixelSize, sourceMapPixelSize);
      terrainSceneCanvasRef.current = terrainSceneCanvas;
      ensureCanvasSize(terrainSceneCanvas, sourceMapPixelSize, sourceMapPixelSize);
      const terrainSceneContext = terrainSceneCanvas.getContext("2d");
      if (terrainSceneContext && shouldRebuildScenes) {
        terrainSceneContext.imageSmoothingEnabled = false;
        drawLegacyGameMapOnly(
          terrainSceneContext,
          renderTileset,
          sessionWithoutMonsterArtwork(activeSession),
          currentLevel,
          currentSeries,
          isLoading,
          currentRuleset,
          lowerLayerCacheRef.current,
          visualEnhancementsEnabled,
          effectiveViewportTileCount,
        );
      }
    }

    if (shouldRebuildScenes) {
      specialSceneCacheRef.current = {
        key: specialSceneKey,
        session: activeSession,
        tileset: renderTileset,
      };
    }

    const visibilitySceneCanvas = visibilitySceneCanvasRef.current
      ?? createCanvas(sourceMapPixelSize, sourceMapPixelSize);
    visibilitySceneCanvasRef.current = visibilitySceneCanvas;
    ensureCanvasSize(visibilitySceneCanvas, sourceMapPixelSize, sourceMapPixelSize);

    drawSpecialModesMap({
      context: targetContext,
      fullScene: fullSceneCanvas,
      terrainScene: terrainSceneCanvas,
      visibilityScene: visibilitySceneCanvas,
      session: activeSession,
      ruleset: currentRuleset,
      settings: specialModesSettings,
      runtime: specialModesRuntimeRef?.current ?? null,
      viewportTileCount: effectiveViewportTileCount,
      tileset: renderTileset,
    });
  });

  const drawFrame = useEffectEvent((
    targetContext: CanvasRenderingContext2D,
    activeSession: InteractiveGameSession | null,
  ) => {
    if (mode === "series-list") {
      drawLegacySeriesList(targetContext, catalog, selectedSeriesFile, message, seriesScrollOffset);
      return;
    }

    if (presentation === "map-only" && !usesDefaultMapTileSize) {
      const scaledMapCanvas = scaledMapCanvasRef.current ?? createCanvas(sourceMapPixelSize, sourceMapPixelSize);
      scaledMapCanvasRef.current = scaledMapCanvas;
      ensureCanvasSize(scaledMapCanvas, sourceMapPixelSize, sourceMapPixelSize);
      const scaledMapContext = scaledMapCanvas.getContext("2d");
      if (!scaledMapContext) {
        return;
      }

      scaledMapContext.imageSmoothingEnabled = false;
      drawMapOnlyFrame(scaledMapContext, activeSession);

      targetContext.clearRect(0, 0, targetMapWidth, targetMapHeight);
      targetContext.drawImage(scaledMapCanvas, 0, 0, targetMapWidth, targetMapHeight);
      return;
    }

    if (!renderTileset) {
      drawLegacyTilesLoadingPlaceholder(targetContext, presentation, effectiveViewportTileCount);
      return;
    }

    if (presentation === "map-only") {
      drawMapOnlyFrame(targetContext, activeSession);
      return;
    }

    drawLegacyGameScreen(
      targetContext,
      renderTileset,
      activeSession,
      currentLevel,
      currentSeries,
      message,
      isLoading,
      currentRuleset,
      lowerLayerCacheRef.current,
      visualEnhancementsEnabled,
      keyCountLabelsEnabled,
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
  }, [
    currentRuleset,
    currentSeries?.filebase,
    currentLevel?.number,
    effectiveViewportTileCount,
    tileset,
    renderTileset,
    specialModesSettings.monsterMadness.enabled,
    specialModesSettings.monsterMadness.includePlayer,
    specialModesSettings.monsterMadness.seed,
    visualEnhancementsEnabled,
  ]);

  useEffect(() => {
    if (mode !== "game" || !renderTileset || !session) {
      return;
    }

    const warmupTasks = collectVisibleLayerCacheWarmupTasks(session);
    if (warmupTasks.length === 0) {
      return;
    }

    let cancelled = false;
    let backgroundHandle: BackgroundCallbackHandle | null = null;
    let animationFrameId = 0;
    let nextTaskIndex = 0;
    let totalWarmupWorkMs = 0;

    const scheduleNextSlice = (): void => {
      if (cancelled || nextTaskIndex >= warmupTasks.length) {
        return;
      }
      backgroundHandle = requestBackgroundWarmupCallback(runWarmupSlice);
    };

    const runWarmupSlice = (deadline: IdleDeadline | null): void => {
      backgroundHandle = null;
      if (cancelled) {
        return;
      }

      const sliceStartedAtMs = performance.now();
      while (nextTaskIndex < warmupTasks.length) {
        prewarmVisibleLayerCacheTask(
          renderTileset,
          session,
          currentRuleset,
          lowerLayerCacheRef.current,
          warmupTasks[nextTaskIndex]!,
          visualEnhancementsEnabled,
          effectiveViewportTileCount,
        );
        nextTaskIndex += 1;

        const elapsedMs = performance.now() - sliceStartedAtMs;
        if (elapsedMs >= INITIAL_RENDER_WARMUP_SLICE_BUDGET_MS) {
          break;
        }
        if (deadline && !deadline.didTimeout && deadline.timeRemaining() <= 1) {
          break;
        }
      }
      totalWarmupWorkMs += performance.now() - sliceStartedAtMs;

      if (nextTaskIndex >= warmupTasks.length) {
        if (!cancelled) {
          recordPerfMeasurement("initialRenderWarmupMs", totalWarmupWorkMs);
        }
        return;
      }

      scheduleNextSlice();
    };

    animationFrameId = window.requestAnimationFrame(() => {
      scheduleNextSlice();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      cancelBackgroundWarmupCallback(backgroundHandle);
    };
  }, [
    currentLevel?.number,
    currentRuleset,
    currentSeries?.filebase,
    effectiveViewportTileCount,
    mode,
    sourceMapPixelSize,
    session?.handle,
    renderTileset,
    visualEnhancementsEnabled,
  ]);

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
    keyCountLabelsEnabled,
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
    let lastRenderContextKey = "";
    let lastRenderedSession: InteractiveGameSession | null = null;

    const drawLiveFrame = () => {
      const activeSession = liveSessionRef?.current ?? session;
      const renderContextKey = buildLegacyCanvasRenderContextKey({
        currentLevel,
        currentRuleset,
        currentSeries,
        hasTileset: renderTileset !== null,
        isLoading,
        message,
        presentation,
        inventoryKeyCountLabelsEnabled: keyCountLabelsEnabled,
        viewportTileCount: effectiveViewportTileCount,
        visualEnhancementsEnabled,
      });

      const specialModesRevision = specialModesRuntimeRef?.current.revision ?? 0;
      const flashlightFacingKey = usesFlashlightVisibility
        ? activeSession?.frame.render?.chip?.dir ?? activeSession?.frame.snapshot.chip?.dir ?? ""
        : "";
      const nextRenderContextKey = `${renderContextKey}:${JSON.stringify(specialModesSettings)}:${specialModesRevision}:${flashlightFacingKey}`;
      const renderInputsChanged =
        activeSession !== lastRenderedSession || nextRenderContextKey !== lastRenderContextKey;
      const flashlightTransitionActive =
        usesFlashlightVisibility &&
        isFlashlightDirectionTransitionActive(visibilitySceneCanvasRef.current);
      if (renderInputsChanged || flashlightTransitionActive || usesMonsterRipples) {
        measurePerfSync("renderMs", () => {
          drawFrame(context, activeSession);
        });
        if (renderInputsChanged) {
          if (activeSession) {
            recordSessionVisualLoadPaint({
              interactive: renderTileset !== null && !isLoading,
              levelKey: createSessionVisualLoadLevelKey(activeSession.request),
              sessionKey: createSessionVisualLoadSessionKey(activeSession.request),
            });
          } else {
            const levelKey = selectedLevelPerfKey({
              currentRuleset,
              selectedLevelNumber: currentLevel?.number ?? null,
              selectedSeriesFile,
            });
            if (levelKey) {
              recordSessionVisualLoadPaint({
                interactive: false,
                levelKey,
                sessionKey: null,
              });
            }
          }
        }
        lastRenderedSession = activeSession;
        lastRenderContextKey = nextRenderContextKey;
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
    effectiveViewportTileCount,
    isLoading,
    liveSessionRef,
    message,
    mode,
    presentation,
    renderTileSize,
    selectedSeriesFile,
    session,
    targetMapHeight,
    targetMapWidth,
    renderTileset,
    specialModesRuntimeRef,
    specialModesSettings,
    usesFlashlightVisibility,
    usesMonsterRipples,
    usesDefaultMapTileSize,
    visualEnhancementsEnabled,
  ]);

  useEffect(() => {
    if (!debugModeEnabled || mode !== "game") {
      perfTrackerRef.current = createLegacyCanvasPerfTrackerState();
      debugReadoutKeyRef.current = "";
      setCapturedDebugReadout(null);
      setDebugReadout([]);
      return;
    }

    const composeDebugReadout = (): string[] => {
      const activeSession = liveSessionRef?.current ?? session;
      const perfReadout = buildLegacyCanvasPerfReadout(
        activeSession,
        updateLegacyCanvasPerfTracker(
          perfTrackerRef.current,
          performance.now(),
          activeSession,
          buildCommitHash,
        ),
      );
      const hoverReadout = hoveredMapPosition === null
        ? []
        : buildLegacyCanvasDebugReadout(activeSession, hoveredMapPosition);
      return hoverReadout.length > 0
        ? [...perfReadout, "", ...hoverReadout]
        : perfReadout;
    };

    let animationFrameId = 0;
    const updateDebugReadout = () => {
      const nextReadout = composeDebugReadout();
      const nextKey = nextReadout.join("\n");
      if (nextKey !== debugReadoutKeyRef.current) {
        debugReadoutKeyRef.current = nextKey;
        setDebugReadout(nextReadout);
      }
      animationFrameId = window.requestAnimationFrame(updateDebugReadout);
    };

    updateDebugReadout();
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [buildCommitHash, debugModeEnabled, hoveredMapPosition, liveSessionRef, mode, session]);

  const captureDebugOverlay = useEffectEvent(() => {
    const capturedAt = formatPerfCaptureTimestamp(new Date());
    const activeSession = liveSessionRef?.current ?? session;
    const perfReadout = buildLegacyCanvasPerfReadout(
      activeSession,
      updateLegacyCanvasPerfTracker(
        perfTrackerRef.current,
        performance.now(),
        activeSession,
        buildCommitHash,
      ),
    );
    const hoverReadout = hoveredMapPosition === null
      ? []
      : buildLegacyCanvasDebugReadout(activeSession, hoveredMapPosition);
    const nextReadout = hoverReadout.length > 0
      ? [...perfReadout, "", ...hoverReadout]
      : perfReadout;
    setCapturedDebugReadout([`snapshot captured=${capturedAt}`, ...nextReadout]);
  });

  const resumeLiveDebugOverlay = useEffectEvent(() => {
    setCapturedDebugReadout(null);
  });

  const displayedDebugReadout = capturedDebugReadout ?? debugReadout;

  return (
    <div className="legacy-canvas-shell">
      <canvas
        className={`${className ?? "legacy-canvas"}${isDatDragActive ? " legacy-canvas--drop-active" : ""}`}
        height={presentation === "map-only" ? targetMapHeight : LEGACY_WINDOW_HEIGHT}
        onClick={(event) => {
          const canvas = event.currentTarget;
          const position = mapPositionForCanvasPoint(canvas, event.clientX, event.clientY);

          if (mode !== "series-list") {
            if (currentRuleset !== "MS" || !onMapClick || position === null) {
              return;
            }

            onMapClick(position);
            return;
          }

          const bounds = canvas.getBoundingClientRect();
          const scaleY = canvas.height / bounds.height;
          const y = (event.clientY - bounds.top) * scaleY;
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
        onMouseLeave={() => {
          if (hoveredMapPosition !== null) {
            setHoveredMapPosition(null);
          }
        }}
        onMouseMove={(event) => {
          if (!debugModeEnabled) {
            return;
          }

          const position = mapPositionForCanvasPoint(event.currentTarget, event.clientX, event.clientY);
          if (position !== hoveredMapPosition) {
            setHoveredMapPosition(position);
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
      {debugModeEnabled && displayedDebugReadout.length > 0 ? (
        <div className="legacy-debug-overlay">
          <div className="legacy-debug-overlay__toolbar">
            <button
              className="legacy-debug-overlay__button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                captureDebugOverlay();
              }}
              type="button"
            >
              {capturedDebugReadout ? "Recapture" : "Capture"}
            </button>
            <button
              className="legacy-debug-overlay__button"
              disabled={capturedDebugReadout === null}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                resumeLiveDebugOverlay();
              }}
              type="button"
            >
              Live
            </button>
            <span className="legacy-debug-overlay__status">
              {capturedDebugReadout ? "snapshot frozen" : "live 5s avg"}
            </span>
          </div>
          <pre className="legacy-debug-overlay__lines">{displayedDebugReadout.join("\n")}</pre>
        </div>
      ) : null}
    </div>
  );
}

export {
  applyLegacyTileOverrides,
  createLegacyArtworkSpriteFromFrame,
  inventoryStripPixelDimensions,
  inventoryStripPixelDimensionsForKind,
  inventoryTileCountLabel,
  resolveInventoryKeyCountLabelsEnabled,
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
