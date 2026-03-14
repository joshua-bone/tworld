import type { InteractiveGameSessionStartOptions } from "@game-runtime/ports/InteractiveGameEngine";
import type { UndoSettingsSnapshot } from "@undo-runtime/api/history";

export const UNDO_SETTINGS_STORAGE_KEY = "tworld.undo-settings";
const GAME_TICKS_PER_SECOND = 20;

const CHECKPOINT_DENSITY_VALUES = ["dense", "standard", "sparse"] as const;
const MAXIMUM_HISTORY_MINUTES_VALUES = [5, 15, 30, 60] as const;

export type BrowserUndoCheckpointDensity = (typeof CHECKPOINT_DENSITY_VALUES)[number];
export type BrowserUndoMaximumHistoryMinutes = (typeof MAXIMUM_HISTORY_MINUTES_VALUES)[number];

export interface BrowserUndoSettings {
  enabled: boolean;
  enableRewindAndResume: boolean;
  allowTakeoverDuringHistoricalReplay: boolean;
  retainUnlimitedHistory: boolean;
  checkpointDensity: BrowserUndoCheckpointDensity;
  checkpointRetentionMode: UndoSettingsSnapshot["checkpointRetentionMode"];
  maximumRetainedHistoryMinutes: BrowserUndoMaximumHistoryMinutes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCheckpointDensity(value: unknown): value is BrowserUndoCheckpointDensity {
  return typeof value === "string" && CHECKPOINT_DENSITY_VALUES.includes(value as BrowserUndoCheckpointDensity);
}

function isMaximumHistoryMinutes(value: unknown): value is BrowserUndoMaximumHistoryMinutes {
  return typeof value === "number" && MAXIMUM_HISTORY_MINUTES_VALUES.includes(value as BrowserUndoMaximumHistoryMinutes);
}

function checkpointIntervalTicksForDensity(density: BrowserUndoCheckpointDensity): number {
  switch (density) {
    case "dense":
      return 4;
    case "sparse":
      return 16;
    case "standard":
    default:
      return 8;
  }
}

export function createDefaultBrowserUndoSettings(): BrowserUndoSettings {
  return {
    enabled: true,
    enableRewindAndResume: true,
    allowTakeoverDuringHistoricalReplay: true,
    retainUnlimitedHistory: true,
    checkpointDensity: "standard",
    checkpointRetentionMode: "dense-recent-exponential",
    maximumRetainedHistoryMinutes: 15,
  };
}

export function parseStoredUndoSettings(value: unknown): BrowserUndoSettings {
  const defaults = createDefaultBrowserUndoSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
    enableRewindAndResume:
      typeof value.enableRewindAndResume === "boolean"
        ? value.enableRewindAndResume
        : defaults.enableRewindAndResume,
    allowTakeoverDuringHistoricalReplay:
      typeof value.allowTakeoverDuringHistoricalReplay === "boolean"
        ? value.allowTakeoverDuringHistoricalReplay
        : defaults.allowTakeoverDuringHistoricalReplay,
    retainUnlimitedHistory:
      typeof value.retainUnlimitedHistory === "boolean"
        ? value.retainUnlimitedHistory
        : defaults.retainUnlimitedHistory,
    checkpointDensity: isCheckpointDensity(value.checkpointDensity)
      ? value.checkpointDensity
      : defaults.checkpointDensity,
    checkpointRetentionMode:
      value.checkpointRetentionMode === "dense-recent" || value.checkpointRetentionMode === "dense-recent-exponential"
        ? value.checkpointRetentionMode
        : defaults.checkpointRetentionMode,
    maximumRetainedHistoryMinutes: isMaximumHistoryMinutes(value.maximumRetainedHistoryMinutes)
      ? value.maximumRetainedHistoryMinutes
      : defaults.maximumRetainedHistoryMinutes,
  };
}

export function loadStoredUndoSettings(): BrowserUndoSettings {
  try {
    const stored = window.localStorage.getItem(UNDO_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return createDefaultBrowserUndoSettings();
    }
    return parseStoredUndoSettings(JSON.parse(stored));
  } catch {
    return createDefaultBrowserUndoSettings();
  }
}

export function saveStoredUndoSettings(settings: BrowserUndoSettings): void {
  try {
    window.localStorage.setItem(UNDO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}

export function toUndoSessionStartOptions(settings: BrowserUndoSettings): InteractiveGameSessionStartOptions {
  const checkpointIntervalTicks = checkpointIntervalTicksForDensity(settings.checkpointDensity);
  return {
    undoSettings: {
      enabled: settings.enabled,
      checkpointIntervalTicks,
      retainUnlimitedHistory: settings.retainUnlimitedHistory,
      checkpointRetentionMode: settings.checkpointRetentionMode,
      recentCheckpointWindowTicks: checkpointIntervalTicks * 10,
      checkpointExponentialBase: 2,
      maximumRetainedHistoryTicks: settings.retainUnlimitedHistory
        ? null
        : settings.maximumRetainedHistoryMinutes * 60 * GAME_TICKS_PER_SECOND,
    },
  };
}
