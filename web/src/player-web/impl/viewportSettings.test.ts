import { describe, expect, it } from "vitest";
import {
  createDefaultBrowserViewportSettings,
  parseStoredViewportSettings,
  viewportTileCountForRadius,
  viewportTileCountForSettings,
} from "@player-web/impl/viewportSettings";

describe("viewportSettings", () => {
  it("defaults to the unchanged 9x9 viewport", () => {
    const settings = createDefaultBrowserViewportSettings();

    expect(settings).toEqual({ enabled: false, radius: 4 });
    expect(viewportTileCountForSettings(settings)).toBe(9);
  });

  it("maps radii 1 through 15 to centered odd tile windows", () => {
    expect(viewportTileCountForRadius(1)).toBe(3);
    expect(viewportTileCountForRadius(4)).toBe(9);
    expect(viewportTileCountForRadius(15)).toBe(31);
  });

  it("maps radius 16 to the complete 32x32 board", () => {
    expect(viewportTileCountForRadius(16)).toBe(32);
    expect(viewportTileCountForSettings({ enabled: true, radius: 16 })).toBe(32);
  });

  it("normalizes stored settings while preserving valid custom values", () => {
    expect(parseStoredViewportSettings({ enabled: true, radius: 7 })).toEqual({
      enabled: true,
      radius: 7,
    });
    expect(parseStoredViewportSettings({ enabled: true, radius: 99 })).toEqual({
      enabled: true,
      radius: 16,
    });
    expect(parseStoredViewportSettings({ enabled: true, radius: 4.5 })).toEqual({
      enabled: true,
      radius: 4,
    });
  });
});
