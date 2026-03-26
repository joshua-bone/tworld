export const PLAYER_KEY_BINDINGS_SETTINGS_STORAGE_KEY = "tworld.player-key-bindings-settings";

export const PLAYER_BINDABLE_KEYS = [
  "B",
  "C",
  "E",
  "F",
  "G",
  "I",
  "J",
  "K",
  "L",
  "M",
  "O",
  "Q",
  "T",
  "U",
  "V",
  "X",
  "Y",
  "Z",
] as const;

export type PlayerBindableKey = (typeof PLAYER_BINDABLE_KEYS)[number];

export interface BrowserPlayerKeyBindingsSettings {
  action1Key: PlayerBindableKey;
  undoKey: PlayerBindableKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBindableKey(value: unknown): PlayerBindableKey | null {
  return typeof value === "string" && PLAYER_BINDABLE_KEYS.includes(value.toUpperCase() as PlayerBindableKey)
    ? (value.toUpperCase() as PlayerBindableKey)
    : null;
}

export function createDefaultBrowserPlayerKeyBindingsSettings(): BrowserPlayerKeyBindingsSettings {
  return {
    action1Key: "C",
    undoKey: "Z",
  };
}

export function parseStoredPlayerKeyBindingsSettings(value: unknown): BrowserPlayerKeyBindingsSettings {
  const defaults = createDefaultBrowserPlayerKeyBindingsSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  const action1Key = normalizeBindableKey(value.action1Key) ?? defaults.action1Key;
  const undoKey = normalizeBindableKey(value.undoKey) ?? defaults.undoKey;
  if (action1Key === undoKey) {
    return defaults;
  }

  return {
    action1Key,
    undoKey,
  };
}

export function loadStoredPlayerKeyBindingsSettings(): BrowserPlayerKeyBindingsSettings {
  try {
    const stored = window.localStorage.getItem(PLAYER_KEY_BINDINGS_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return createDefaultBrowserPlayerKeyBindingsSettings();
    }

    return parseStoredPlayerKeyBindingsSettings(JSON.parse(stored));
  } catch {
    return createDefaultBrowserPlayerKeyBindingsSettings();
  }
}

export function saveStoredPlayerKeyBindingsSettings(settings: BrowserPlayerKeyBindingsSettings): void {
  try {
    window.localStorage.setItem(
      PLAYER_KEY_BINDINGS_SETTINGS_STORAGE_KEY,
      JSON.stringify(parseStoredPlayerKeyBindingsSettings(settings)),
    );
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}
