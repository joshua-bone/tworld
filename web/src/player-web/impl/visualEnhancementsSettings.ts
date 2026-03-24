export const VISUAL_ENHANCEMENTS_SETTINGS_STORAGE_KEY = "tworld.visual-enhancements-settings";

export interface BrowserVisualEnhancementsSettings {
  enabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createDefaultBrowserVisualEnhancementsSettings(): BrowserVisualEnhancementsSettings {
  return {
    enabled: true,
  };
}

export function parseStoredVisualEnhancementsSettings(value: unknown): BrowserVisualEnhancementsSettings {
  const defaults = createDefaultBrowserVisualEnhancementsSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
  };
}

export function loadStoredVisualEnhancementsSettings(): BrowserVisualEnhancementsSettings {
  try {
    const stored = window.localStorage.getItem(VISUAL_ENHANCEMENTS_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return createDefaultBrowserVisualEnhancementsSettings();
    }

    return parseStoredVisualEnhancementsSettings(JSON.parse(stored));
  } catch {
    return createDefaultBrowserVisualEnhancementsSettings();
  }
}

export function saveStoredVisualEnhancementsSettings(settings: BrowserVisualEnhancementsSettings): void {
  try {
    window.localStorage.setItem(
      VISUAL_ENHANCEMENTS_SETTINGS_STORAGE_KEY,
      JSON.stringify(parseStoredVisualEnhancementsSettings(settings)),
    );
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}
