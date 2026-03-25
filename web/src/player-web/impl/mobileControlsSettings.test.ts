import { describe, expect, it } from "vitest";
import {
  createDefaultBrowserMobileControlsSettings,
  parseStoredMobileControlsSettings,
} from "@player-web/impl/mobileControlsSettings";

describe("mobileControlsSettings", () => {
  it("defaults to the wasd-cluster profile", () => {
    expect(createDefaultBrowserMobileControlsSettings()).toEqual({
      profile: "wasd-cluster",
    });
  });

  it("parses the alternate stored profiles", () => {
    expect(parseStoredMobileControlsSettings({ profile: "wasd-cluster" })).toEqual({
      profile: "wasd-cluster",
    });
    expect(parseStoredMobileControlsSettings({ profile: "right-bottom" })).toEqual({
      profile: "right-bottom",
    });
    expect(parseStoredMobileControlsSettings({ profile: "screen-edges" })).toEqual({
      profile: "screen-edges",
    });
  });

  it("falls back to the default profile for invalid data", () => {
    expect(parseStoredMobileControlsSettings({ profile: "unknown" })).toEqual({
      profile: "wasd-cluster",
    });
    expect(parseStoredMobileControlsSettings(null)).toEqual({
      profile: "wasd-cluster",
    });
  });
});
