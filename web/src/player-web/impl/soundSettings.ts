export const SOUND_MUTED_STORAGE_KEY = "tworld.sound-muted";
export const SOUND_VOLUME_STORAGE_KEY = "tworld.sound-volume";
export const SOUND_SETTINGS_VERSION_STORAGE_KEY = "tworld.sound-settings-version";
export const SOUND_SETTINGS_VERSION = "2";

export interface BrowserSoundSettings {
  muted: boolean;
  volume: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createDefaultBrowserSoundSettings(): BrowserSoundSettings {
  return {
    muted: false,
    volume: 0.7,
  };
}

export function parseStoredSoundSettings(value: unknown): BrowserSoundSettings {
  const defaults = createDefaultBrowserSoundSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  const storedVolume = typeof value.volume === "number" && Number.isFinite(value.volume)
    ? value.volume
    : defaults.volume;

  return {
    muted: typeof value.muted === "boolean" ? value.muted : defaults.muted,
    volume: Math.max(0, Math.min(1, storedVolume)),
  };
}

export function loadStoredSoundSettings(): BrowserSoundSettings {
  const defaults = createDefaultBrowserSoundSettings();

  try {
    if (window.localStorage.getItem(SOUND_SETTINGS_VERSION_STORAGE_KEY) !== SOUND_SETTINGS_VERSION) {
      return defaults;
    }

    return parseStoredSoundSettings({
      muted: window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "1",
      volume: Number(window.localStorage.getItem(SOUND_VOLUME_STORAGE_KEY)),
    });
  } catch {
    return defaults;
  }
}

export function saveStoredSoundSettings(settings: BrowserSoundSettings): void {
  const normalized = parseStoredSoundSettings(settings);

  try {
    window.localStorage.setItem(SOUND_SETTINGS_VERSION_STORAGE_KEY, SOUND_SETTINGS_VERSION);
    window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, normalized.muted ? "1" : "0");
    window.localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(normalized.volume));
  } catch {
    // Ignore storage failures and keep in-memory state.
  }
}
