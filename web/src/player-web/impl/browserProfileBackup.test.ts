import { describe, expect, it, vi } from "vitest";
import {
  buildBrowserProfileBackupFilename,
  createBrowserProfileBackup,
  parseBrowserProfileBackup,
  serializeBrowserProfileBackup,
} from "@player-web/impl/browserProfileBackup";
import type { BrowserProfileSnapshot } from "@player-web/ports/BrowserProfileStore";

describe("browserProfileBackup", () => {
  it("serializes and parses a profile backup", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const snapshot: BrowserProfileSnapshot = {
      version: 1,
      selection: { seriesFile: "CCLP1-Lynx.dac", levelNumber: 7 },
      preferences: {
        uiMode: "modern",
        defaultRuleset: "Lynx",
        autoSaveWinningHighScoreReplays: true,
        autoDownloadReplaysOnSave: false,
      },
      recentSelections: [],
      levelProgressSummaries: [],
      replayEntries: [],
      importedDatFiles: [],
    };

    const backup = createBrowserProfileBackup(snapshot, Date.now());
    const parsed = parseBrowserProfileBackup(serializeBrowserProfileBackup(backup));

    expect(parsed.kind).toBe("tworld-browser-profile-backup");
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.exportedAtMs).toBe(1_700_000_000_000);
    expect(parsed.profile).toEqual(snapshot);
    expect(parsed.localSettings).toMatchObject({
      mobileControls: {
        profile: "wasd-cluster",
      },
      playerKeyBindings: {
        action1Key: "C",
        undoKey: "Z",
      },
      sound: {
        muted: false,
        volume: 0.7,
      },
      undo: {
        enabled: true,
        checkpointDensity: "standard",
      },
      visualEnhancements: {
        enabled: true,
      },
    });
  });

  it("rejects unsupported profile payloads", () => {
    expect(() => parseBrowserProfileBackup(JSON.stringify({ kind: "wrong" }))).toThrow(
      "Profile file is not a supported Tile World Online profile backup.",
    );
  });

  it("builds a timestamped profile filename", () => {
    expect(buildBrowserProfileBackupFilename(Date.UTC(2026, 2, 20, 12, 34, 56))).toBe(
      "tworld-profile-2026-03-20T12-34-56.000Z.json",
    );
  });
});
