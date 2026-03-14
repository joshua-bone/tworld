import { describe, expect, it } from "vitest";
import {
  getIntSetting,
  getStringSetting,
  parseSettingsFile,
  serializeSettingsFile,
  setIntSetting,
  setStringSetting,
} from "@content/impl/settings";

describe("settings", () => {
  it("parses and serializes settings deterministically", () => {
    const settings = parseSettingsFile("volume=8\nname=chip\nbroken\n");
    const updated = setStringSetting(setIntSetting(settings, "volume", 10), "mode", "lynx");

    expect(getIntSetting(updated, "volume")).toBe(10);
    expect(getStringSetting(updated, "name")).toBe("chip");
    expect(serializeSettingsFile(updated)).toBe("mode=lynx\nname=chip\nvolume=10\n");
  });

  it("returns legacy defaults for missing and invalid integers", () => {
    const settings = parseSettingsFile("volume=loud\n");

    expect(getIntSetting(settings, "volume")).toBe(-1);
    expect(getIntSetting(settings, "missing")).toBe(-1);
  });
});
