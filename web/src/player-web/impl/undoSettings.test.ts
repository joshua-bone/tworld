import { describe, expect, it } from "vitest";
import {
  createDefaultBrowserUndoSettings,
  parseStoredUndoSettings,
  toUndoSessionStartOptions,
} from "@player-web/impl/undoSettings";

describe("undoSettings", () => {
  it("falls back to defaults for invalid stored values", () => {
    expect(parseStoredUndoSettings(null)).toEqual(createDefaultBrowserUndoSettings());
    expect(
      parseStoredUndoSettings({
        enabled: false,
        checkpointDensity: "impossible",
        checkpointRetentionMode: "invalid",
        maximumRetainedHistoryMinutes: 999,
      }),
    ).toEqual({
      ...createDefaultBrowserUndoSettings(),
      enabled: false,
    });
  });

  it("maps browser undo settings to runtime undo settings", () => {
    expect(
      toUndoSessionStartOptions({
        enabled: true,
        enableRewindAndResume: true,
        allowTakeoverDuringHistoricalReplay: false,
        retainUnlimitedHistory: false,
        checkpointDensity: "dense",
        checkpointRetentionMode: "dense-recent",
        maximumRetainedHistoryMinutes: 30,
      }),
    ).toEqual({
      undoSettings: {
        enabled: true,
        checkpointIntervalTicks: 4,
        retainUnlimitedHistory: false,
        checkpointRetentionMode: "dense-recent",
        recentCheckpointWindowTicks: 40,
        checkpointExponentialBase: 2,
        maximumRetainedHistoryTicks: 36000,
      },
    });
  });
});
