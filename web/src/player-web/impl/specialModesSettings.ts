import type { BrowserViewportSettings } from "@player-web/impl/viewportSettings";
import { parseStoredViewportSettings } from "@player-web/impl/viewportSettings";

export const SPECIAL_MODES_SETTINGS_STORAGE_KEY = "tworld.special-modes-settings";
export const SPECIAL_MODES_PRESETS_STORAGE_KEY = "tworld.special-modes-presets";
export const MIN_LANTERN_RADIUS = 1;
export const MAX_LANTERN_RADIUS = 16;
export const DEFAULT_LANTERN_RADIUS = 4;
export const MIN_TRANSFORM_INTERVAL_SECONDS = 5;
export const MAX_TRANSFORM_INTERVAL_SECONDS = 60;
export const DEFAULT_TRANSFORM_INTERVAL_SECONDS = 10;
export const SPECIAL_MODE_SEED_MAX = 0x7fff_ffff;

export const SPECIAL_VISIBILITY_MODES = [
  "normal",
  "flashlight",
  "flashlight-fog",
  "lantern",
  "lantern-fog",
  "line-of-sight",
  "line-of-sight-fog",
] as const;

export type SpecialVisibilityMode = (typeof SPECIAL_VISIBILITY_MODES)[number];

export const DIHEDRAL_TRANSFORMS = [
  "rotate-90",
  "rotate-180",
  "rotate-270",
  "flip-horizontal",
  "flip-vertical",
  "flip-rising-diagonal",
  "flip-falling-diagonal",
] as const;

export type DihedralTransform = (typeof DIHEDRAL_TRANSFORMS)[number];
export type DihedralOrientation = "identity" | DihedralTransform;
export type TransformTransitionSpeed = "slow" | "medium" | "fast";

export interface BrowserSpecialModesSettings {
  visibility: {
    mode: SpecialVisibilityMode;
    lanternRadius: number;
  };
  monsterMadness: {
    enabled: boolean;
    includePlayer: boolean;
    seed: number;
  };
  transform: {
    enabled: boolean;
    intervalSeconds: number;
    transitionSpeed: TransformTransitionSpeed;
    strategy: "random" | DihedralTransform;
    allowedRandomTransforms: DihedralTransform[];
    seed: number;
  };
}

export interface BrowserSpecialModesConfiguration {
  viewport: BrowserViewportSettings;
  specialModes: BrowserSpecialModesSettings;
}

export interface BrowserSpecialModesPreset {
  id: string;
  name: string;
  savedAtMs: number;
  configuration: BrowserSpecialModesConfiguration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && choices.includes(value as T) ? value as T : fallback;
}

function normalizedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

export function createRandomSpecialModeSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint32Array(1))[0]! & SPECIAL_MODE_SEED_MAX;
  }
  return Math.floor(Math.random() * (SPECIAL_MODE_SEED_MAX + 1));
}

export function createDefaultBrowserSpecialModesSettings(
  seedSource: () => number = createRandomSpecialModeSeed,
): BrowserSpecialModesSettings {
  return {
    visibility: {
      mode: "normal",
      lanternRadius: DEFAULT_LANTERN_RADIUS,
    },
    monsterMadness: {
      enabled: false,
      includePlayer: false,
      seed: normalizedInteger(seedSource(), 0, 0, SPECIAL_MODE_SEED_MAX),
    },
    transform: {
      enabled: false,
      intervalSeconds: DEFAULT_TRANSFORM_INTERVAL_SECONDS,
      transitionSpeed: "fast",
      strategy: "random",
      allowedRandomTransforms: [...DIHEDRAL_TRANSFORMS],
      seed: normalizedInteger(seedSource(), 0, 0, SPECIAL_MODE_SEED_MAX),
    },
  };
}

export function parseStoredSpecialModesSettings(
  value: unknown,
  defaults = createDefaultBrowserSpecialModesSettings(),
): BrowserSpecialModesSettings {
  if (!isRecord(value)) {
    return defaults;
  }

  const visibility = isRecord(value.visibility) ? value.visibility : {};
  const monsterMadness = isRecord(value.monsterMadness) ? value.monsterMadness : {};
  const transform = isRecord(value.transform) ? value.transform : {};
  const storedAllowedRandomTransforms = Array.isArray(transform.allowedRandomTransforms)
    ? transform.allowedRandomTransforms
    : null;
  const allowedRandomTransforms = storedAllowedRandomTransforms
    ? DIHEDRAL_TRANSFORMS.filter((candidate) => storedAllowedRandomTransforms.includes(candidate))
    : defaults.transform.allowedRandomTransforms;

  return {
    visibility: {
      mode: oneOf(visibility.mode, SPECIAL_VISIBILITY_MODES, defaults.visibility.mode),
      lanternRadius: normalizedInteger(
        visibility.lanternRadius,
        defaults.visibility.lanternRadius,
        MIN_LANTERN_RADIUS,
        MAX_LANTERN_RADIUS,
      ),
    },
    monsterMadness: {
      enabled: typeof monsterMadness.enabled === "boolean"
        ? monsterMadness.enabled
        : defaults.monsterMadness.enabled,
      includePlayer: typeof monsterMadness.includePlayer === "boolean"
        ? monsterMadness.includePlayer
        : defaults.monsterMadness.includePlayer,
      seed: normalizedInteger(
        monsterMadness.seed,
        defaults.monsterMadness.seed,
        0,
        SPECIAL_MODE_SEED_MAX,
      ),
    },
    transform: {
      enabled: typeof transform.enabled === "boolean" ? transform.enabled : defaults.transform.enabled,
      intervalSeconds: normalizedInteger(
        transform.intervalSeconds,
        defaults.transform.intervalSeconds,
        MIN_TRANSFORM_INTERVAL_SECONDS,
        MAX_TRANSFORM_INTERVAL_SECONDS,
      ),
      transitionSpeed: oneOf(
        transform.transitionSpeed,
        ["slow", "medium", "fast"] as const,
        defaults.transform.transitionSpeed,
      ),
      strategy: oneOf(
        transform.strategy,
        ["random", ...DIHEDRAL_TRANSFORMS] as const,
        defaults.transform.strategy,
      ),
      allowedRandomTransforms: allowedRandomTransforms.length > 0
        ? allowedRandomTransforms
        : [...defaults.transform.allowedRandomTransforms],
      seed: normalizedInteger(transform.seed, defaults.transform.seed, 0, SPECIAL_MODE_SEED_MAX),
    },
  };
}

export function loadStoredSpecialModesSettings(): BrowserSpecialModesSettings {
  const defaults = createDefaultBrowserSpecialModesSettings();
  try {
    const stored = window.localStorage.getItem(SPECIAL_MODES_SETTINGS_STORAGE_KEY);
    return stored ? parseStoredSpecialModesSettings(JSON.parse(stored), defaults) : defaults;
  } catch {
    return defaults;
  }
}

export function saveStoredSpecialModesSettings(settings: BrowserSpecialModesSettings): void {
  try {
    window.localStorage.setItem(
      SPECIAL_MODES_SETTINGS_STORAGE_KEY,
      JSON.stringify(parseStoredSpecialModesSettings(settings, settings)),
    );
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}

export function isSpecialModesConfigurationActive(
  configuration: BrowserSpecialModesConfiguration,
): boolean {
  return (
    configuration.viewport.enabled ||
    configuration.specialModes.visibility.mode !== "normal" ||
    configuration.specialModes.monsterMadness.enabled ||
    configuration.specialModes.transform.enabled
  );
}

function fnv1a(value: string): string {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function specialModesConfigurationFingerprint(
  configuration: BrowserSpecialModesConfiguration,
): string | null {
  if (!isSpecialModesConfigurationActive(configuration)) {
    return null;
  }

  const normalized = {
    viewport: parseStoredViewportSettings(configuration.viewport),
    specialModes: parseStoredSpecialModesSettings(
      configuration.specialModes,
      configuration.specialModes,
    ),
  };
  return `special-${fnv1a(JSON.stringify(normalized))}`;
}

export function parseStoredSpecialModesPresets(value: unknown): BrowserSpecialModesPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const presets: BrowserSpecialModesPreset[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isRecord(entry.configuration)) {
      continue;
    }
    const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 60) : "";
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!id || !name) {
      continue;
    }
    presets.push({
      id,
      name,
      savedAtMs: normalizedInteger(entry.savedAtMs, 0, 0, Number.MAX_SAFE_INTEGER),
      configuration: {
        viewport: parseStoredViewportSettings(entry.configuration.viewport),
        specialModes: parseStoredSpecialModesSettings(entry.configuration.specialModes),
      },
    });
  }
  return presets.sort((left, right) => right.savedAtMs - left.savedAtMs);
}

export function loadStoredSpecialModesPresets(): BrowserSpecialModesPreset[] {
  try {
    const stored = window.localStorage.getItem(SPECIAL_MODES_PRESETS_STORAGE_KEY);
    return stored ? parseStoredSpecialModesPresets(JSON.parse(stored)) : [];
  } catch {
    return [];
  }
}

export function saveStoredSpecialModesPresets(presets: readonly BrowserSpecialModesPreset[]): void {
  try {
    window.localStorage.setItem(
      SPECIAL_MODES_PRESETS_STORAGE_KEY,
      JSON.stringify(parseStoredSpecialModesPresets(presets)),
    );
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}

export function createSpecialModesPreset(
  name: string,
  configuration: BrowserSpecialModesConfiguration,
  nowMs = Date.now(),
): BrowserSpecialModesPreset {
  const normalizedName = name.trim().slice(0, 60);
  if (!normalizedName) {
    throw new Error("Enter a name for this Special Modes configuration.");
  }

  return {
    id: `${nowMs.toString(36)}-${createRandomSpecialModeSeed().toString(36)}`,
    name: normalizedName,
    savedAtMs: nowMs,
    configuration: {
      viewport: parseStoredViewportSettings(configuration.viewport),
      specialModes: parseStoredSpecialModesSettings(configuration.specialModes, configuration.specialModes),
    },
  };
}

export function transformTransitionDurationSeconds(speed: TransformTransitionSpeed): number {
  switch (speed) {
    case "slow":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}
