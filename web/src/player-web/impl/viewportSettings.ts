import { LEGACY_MAP_TILES } from "@player-web/impl/legacySprites";

export const VIEWPORT_SETTINGS_STORAGE_KEY = "tworld.viewport-settings";
export const DEFAULT_VIEWPORT_RADIUS = 4;
export const MIN_VIEWPORT_RADIUS = 1;
export const MAX_VIEWPORT_RADIUS = 16;
export const FULL_BOARD_VIEWPORT_TILES = 32;

export interface BrowserViewportSettings {
  enabled: boolean;
  radius: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeViewportRadius(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_VIEWPORT_RADIUS;
  }

  return Math.max(MIN_VIEWPORT_RADIUS, Math.min(MAX_VIEWPORT_RADIUS, value));
}

export function viewportTileCountForRadius(radius: number): number {
  const normalizedRadius = normalizeViewportRadius(radius);
  return normalizedRadius === MAX_VIEWPORT_RADIUS
    ? FULL_BOARD_VIEWPORT_TILES
    : normalizedRadius * 2 + 1;
}

export function viewportTileCountForSettings(settings: BrowserViewportSettings): number {
  return settings.enabled ? viewportTileCountForRadius(settings.radius) : LEGACY_MAP_TILES;
}

export function createDefaultBrowserViewportSettings(): BrowserViewportSettings {
  return {
    enabled: false,
    radius: DEFAULT_VIEWPORT_RADIUS,
  };
}

export function parseStoredViewportSettings(value: unknown): BrowserViewportSettings {
  const defaults = createDefaultBrowserViewportSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
    radius: normalizeViewportRadius(value.radius),
  };
}

export function loadStoredViewportSettings(): BrowserViewportSettings {
  try {
    const stored = window.localStorage.getItem(VIEWPORT_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return createDefaultBrowserViewportSettings();
    }

    return parseStoredViewportSettings(JSON.parse(stored));
  } catch {
    return createDefaultBrowserViewportSettings();
  }
}

export function saveStoredViewportSettings(settings: BrowserViewportSettings): void {
  try {
    window.localStorage.setItem(
      VIEWPORT_SETTINGS_STORAGE_KEY,
      JSON.stringify(parseStoredViewportSettings(settings)),
    );
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}
