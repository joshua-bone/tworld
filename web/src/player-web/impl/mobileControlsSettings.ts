export const MOBILE_CONTROLS_SETTINGS_STORAGE_KEY = "tworld.mobile-controls-settings";

export type BrowserMobileControlProfile = "right-bottom" | "screen-edges";

export interface BrowserMobileControlsSettings {
  profile: BrowserMobileControlProfile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createDefaultBrowserMobileControlsSettings(): BrowserMobileControlsSettings {
  return {
    profile: "right-bottom",
  };
}

export function parseStoredMobileControlsSettings(value: unknown): BrowserMobileControlsSettings {
  const defaults = createDefaultBrowserMobileControlsSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    profile: value.profile === "screen-edges" ? "screen-edges" : defaults.profile,
  };
}

export function loadStoredMobileControlsSettings(): BrowserMobileControlsSettings {
  try {
    const stored = window.localStorage.getItem(MOBILE_CONTROLS_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return createDefaultBrowserMobileControlsSettings();
    }

    return parseStoredMobileControlsSettings(JSON.parse(stored));
  } catch {
    return createDefaultBrowserMobileControlsSettings();
  }
}

export function saveStoredMobileControlsSettings(settings: BrowserMobileControlsSettings): void {
  try {
    window.localStorage.setItem(
      MOBILE_CONTROLS_SETTINGS_STORAGE_KEY,
      JSON.stringify(parseStoredMobileControlsSettings(settings)),
    );
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}
