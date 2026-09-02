import {
  type BrowserProfileSnapshot,
} from "@player-web/ports/BrowserProfileStore";
import {
  type BrowserUndoSettings,
  loadStoredUndoSettings,
  parseStoredUndoSettings,
  saveStoredUndoSettings,
} from "@player-web/impl/undoSettings";
import {
  type BrowserSoundSettings,
  loadStoredSoundSettings,
  parseStoredSoundSettings,
  saveStoredSoundSettings,
} from "@player-web/impl/soundSettings";
import {
  type BrowserVisualEnhancementsSettings,
  loadStoredVisualEnhancementsSettings,
  parseStoredVisualEnhancementsSettings,
  saveStoredVisualEnhancementsSettings,
} from "@player-web/impl/visualEnhancementsSettings";
import {
  type BrowserMobileControlsSettings,
  loadStoredMobileControlsSettings,
  parseStoredMobileControlsSettings,
  saveStoredMobileControlsSettings,
} from "@player-web/impl/mobileControlsSettings";
import {
  type BrowserPlayerKeyBindingsSettings,
  loadStoredPlayerKeyBindingsSettings,
  parseStoredPlayerKeyBindingsSettings,
  saveStoredPlayerKeyBindingsSettings,
} from "@player-web/impl/playerKeyBindingsSettings";
import {
  type BrowserViewportSettings,
  loadStoredViewportSettings,
  parseStoredViewportSettings,
  saveStoredViewportSettings,
} from "@player-web/impl/viewportSettings";
import {
  type BrowserSpecialModesPreset,
  type BrowserSpecialModesSettings,
  loadStoredSpecialModesPresets,
  loadStoredSpecialModesSettings,
  parseStoredSpecialModesPresets,
  parseStoredSpecialModesSettings,
  saveStoredSpecialModesPresets,
  saveStoredSpecialModesSettings,
} from "@player-web/impl/specialModesSettings";

const PROFILE_BACKUP_KIND = "tworld-browser-profile-backup";
const PROFILE_BACKUP_FORMAT_VERSION = 1;

export interface BrowserProfileLocalSettingsSnapshot {
  mobileControls?: BrowserMobileControlsSettings;
  playerKeyBindings?: BrowserPlayerKeyBindingsSettings;
  sound?: BrowserSoundSettings;
  undo?: BrowserUndoSettings;
  visualEnhancements?: BrowserVisualEnhancementsSettings;
  viewport?: BrowserViewportSettings;
  specialModes?: BrowserSpecialModesSettings;
  specialModePresets?: BrowserSpecialModesPreset[];
}

export interface BrowserProfileBackup {
  kind: typeof PROFILE_BACKUP_KIND;
  formatVersion: typeof PROFILE_BACKUP_FORMAT_VERSION;
  exportedAtMs: number;
  app: "Tile World Online";
  profile: BrowserProfileSnapshot;
  localSettings?: BrowserProfileLocalSettingsSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function exportBrowserLocalSettingsSnapshot(): BrowserProfileLocalSettingsSnapshot {
  return {
    mobileControls: loadStoredMobileControlsSettings(),
    playerKeyBindings: loadStoredPlayerKeyBindingsSettings(),
    sound: loadStoredSoundSettings(),
    undo: loadStoredUndoSettings(),
    visualEnhancements: loadStoredVisualEnhancementsSettings(),
    viewport: loadStoredViewportSettings(),
    specialModes: loadStoredSpecialModesSettings(),
    specialModePresets: loadStoredSpecialModesPresets(),
  };
}

export function applyBrowserLocalSettingsSnapshot(snapshot: BrowserProfileLocalSettingsSnapshot | null | undefined): void {
  if (!snapshot) {
    return;
  }

  if (snapshot.mobileControls !== undefined) {
    saveStoredMobileControlsSettings(parseStoredMobileControlsSettings(snapshot.mobileControls));
  }
  if (snapshot.playerKeyBindings !== undefined) {
    saveStoredPlayerKeyBindingsSettings(parseStoredPlayerKeyBindingsSettings(snapshot.playerKeyBindings));
  }
  if (snapshot.sound !== undefined) {
    saveStoredSoundSettings(parseStoredSoundSettings(snapshot.sound));
  }
  if (snapshot.undo !== undefined) {
    saveStoredUndoSettings(parseStoredUndoSettings(snapshot.undo));
  }
  if (snapshot.visualEnhancements !== undefined) {
    saveStoredVisualEnhancementsSettings(parseStoredVisualEnhancementsSettings(snapshot.visualEnhancements));
  }
  if (snapshot.viewport !== undefined) {
    saveStoredViewportSettings(parseStoredViewportSettings(snapshot.viewport));
  }
  if (snapshot.specialModes !== undefined) {
    saveStoredSpecialModesSettings(parseStoredSpecialModesSettings(snapshot.specialModes));
  }
  if (snapshot.specialModePresets !== undefined) {
    saveStoredSpecialModesPresets(parseStoredSpecialModesPresets(snapshot.specialModePresets));
  }
}

export function createBrowserProfileBackup(
  profile: BrowserProfileSnapshot,
  exportedAtMs = Date.now(),
): BrowserProfileBackup {
  return {
    kind: PROFILE_BACKUP_KIND,
    formatVersion: PROFILE_BACKUP_FORMAT_VERSION,
    exportedAtMs,
    app: "Tile World Online",
    profile,
    localSettings: exportBrowserLocalSettingsSnapshot(),
  };
}

export function serializeBrowserProfileBackup(backup: BrowserProfileBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parseBrowserProfileBackup(raw: string): BrowserProfileBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Profile file is not valid JSON.");
  }

  if (
    !isRecord(parsed) ||
    parsed.kind !== PROFILE_BACKUP_KIND ||
    parsed.formatVersion !== PROFILE_BACKUP_FORMAT_VERSION ||
    !Number.isFinite(parsed.exportedAtMs) ||
    !isRecord(parsed.profile) ||
    parsed.profile.version !== 1
  ) {
    throw new Error("Profile file is not a supported Tile World Online profile backup.");
  }

  const localSettings = isRecord(parsed.localSettings)
    ? {
        mobileControls: parsed.localSettings.mobileControls !== undefined
          ? parseStoredMobileControlsSettings(parsed.localSettings.mobileControls)
          : undefined,
        playerKeyBindings: parsed.localSettings.playerKeyBindings !== undefined
          ? parseStoredPlayerKeyBindingsSettings(parsed.localSettings.playerKeyBindings)
          : undefined,
        sound: parsed.localSettings.sound !== undefined
          ? parseStoredSoundSettings(parsed.localSettings.sound)
          : undefined,
        undo: parsed.localSettings.undo !== undefined
          ? parseStoredUndoSettings(parsed.localSettings.undo)
          : undefined,
        visualEnhancements: parsed.localSettings.visualEnhancements !== undefined
          ? parseStoredVisualEnhancementsSettings(parsed.localSettings.visualEnhancements)
          : undefined,
        viewport: parsed.localSettings.viewport !== undefined
          ? parseStoredViewportSettings(parsed.localSettings.viewport)
          : undefined,
        specialModes: parsed.localSettings.specialModes !== undefined
          ? parseStoredSpecialModesSettings(parsed.localSettings.specialModes)
          : undefined,
        specialModePresets: parsed.localSettings.specialModePresets !== undefined
          ? parseStoredSpecialModesPresets(parsed.localSettings.specialModePresets)
          : undefined,
      } satisfies BrowserProfileLocalSettingsSnapshot
    : undefined;

  return {
    kind: PROFILE_BACKUP_KIND,
    formatVersion: PROFILE_BACKUP_FORMAT_VERSION,
    exportedAtMs: Number(parsed.exportedAtMs),
    app: "Tile World Online",
    profile: parsed.profile as unknown as BrowserProfileSnapshot,
    localSettings,
  };
}

export function buildBrowserProfileBackupFilename(exportedAtMs: number): string {
  const stamp = new Date(exportedAtMs).toISOString().replaceAll(":", "-");
  return `tworld-profile-${stamp}.json`;
}
