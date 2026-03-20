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

const PROFILE_BACKUP_KIND = "tworld-browser-profile-backup";
const PROFILE_BACKUP_FORMAT_VERSION = 1;

export interface BrowserProfileLocalSettingsSnapshot {
  sound?: BrowserSoundSettings;
  undo?: BrowserUndoSettings;
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
    sound: loadStoredSoundSettings(),
    undo: loadStoredUndoSettings(),
  };
}

export function applyBrowserLocalSettingsSnapshot(snapshot: BrowserProfileLocalSettingsSnapshot | null | undefined): void {
  if (!snapshot) {
    return;
  }

  if (snapshot.sound !== undefined) {
    saveStoredSoundSettings(parseStoredSoundSettings(snapshot.sound));
  }
  if (snapshot.undo !== undefined) {
    saveStoredUndoSettings(parseStoredUndoSettings(snapshot.undo));
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
        sound: parsed.localSettings.sound !== undefined
          ? parseStoredSoundSettings(parsed.localSettings.sound)
          : undefined,
        undo: parsed.localSettings.undo !== undefined
          ? parseStoredUndoSettings(parsed.localSettings.undo)
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
