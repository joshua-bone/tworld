export interface LegacyLayerCanvasCacheEntry {
  key: string;
  canvas: HTMLCanvasElement;
}

export interface LegacyLayerCanvasCache {
  entries: Map<string, LegacyLayerCanvasCacheEntry>;
  maxEntries: number;
}

const DEFAULT_MAX_LAYER_CANVAS_CACHE_ENTRIES = 16;

export function createLayerCanvasCache(maxEntries = DEFAULT_MAX_LAYER_CANVAS_CACHE_ENTRIES): LegacyLayerCanvasCache {
  return {
    entries: new Map(),
    maxEntries,
  };
}

export function clearLayerCanvasCache(cache: LegacyLayerCanvasCache): void {
  cache.entries.clear();
}

export function getCachedLayerCanvas(cache: LegacyLayerCanvasCache, key: string): HTMLCanvasElement | null {
  const cached = cache.entries.get(key);
  if (!cached) {
    return null;
  }

  cache.entries.delete(key);
  cache.entries.set(key, cached);
  return cached.canvas;
}

export function peekCachedLayerCanvas(cache: LegacyLayerCanvasCache, key: string): HTMLCanvasElement | null {
  return cache.entries.get(key)?.canvas ?? null;
}

export function storeCachedLayerCanvas(
  cache: LegacyLayerCanvasCache,
  key: string,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement {
  cache.entries.set(key, { key, canvas });
  while (cache.entries.size > cache.maxEntries) {
    const oldestKey = cache.entries.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    cache.entries.delete(oldestKey);
  }
  return canvas;
}
