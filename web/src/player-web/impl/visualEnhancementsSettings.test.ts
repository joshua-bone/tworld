import { describe, expect, it } from "vitest";
import {
  createDefaultBrowserVisualEnhancementsSettings,
  parseStoredVisualEnhancementsSettings,
} from "@player-web/impl/visualEnhancementsSettings";

describe("visualEnhancementsSettings", () => {
  it("defaults to visual enhancements enabled", () => {
    expect(createDefaultBrowserVisualEnhancementsSettings()).toEqual({
      enabled: true,
    });
  });

  it("parses stored values and falls back for invalid payloads", () => {
    expect(parseStoredVisualEnhancementsSettings({ enabled: false })).toEqual({
      enabled: false,
    });
    expect(parseStoredVisualEnhancementsSettings({ enabled: "nope" })).toEqual({
      enabled: true,
    });
    expect(parseStoredVisualEnhancementsSettings(null)).toEqual({
      enabled: true,
    });
  });
});
