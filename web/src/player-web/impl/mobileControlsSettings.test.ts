import { describe, expect, it } from "vitest";
import {
  createDefaultBrowserMobileControlsSettings,
  parseStoredMobileControlsSettings,
} from "@player-web/impl/mobileControlsSettings";

describe("mobileControlsSettings", () => {
  it("defaults to the right-bottom profile", () => {
    expect(createDefaultBrowserMobileControlsSettings()).toEqual({
      profile: "right-bottom",
    });
  });

  it("parses a stored legacy screen-edge profile", () => {
    expect(parseStoredMobileControlsSettings({ profile: "screen-edges" })).toEqual({
      profile: "screen-edges",
    });
  });

  it("falls back to the default profile for invalid data", () => {
    expect(parseStoredMobileControlsSettings({ profile: "unknown" })).toEqual({
      profile: "right-bottom",
    });
    expect(parseStoredMobileControlsSettings(null)).toEqual({
      profile: "right-bottom",
    });
  });
});
