import { describe, expect, it } from "vitest";
import {
  createDefaultBrowserSpecialModesSettings,
  isSpecialModesConfigurationActive,
  parseStoredSpecialModesSettings,
  specialModesConfigurationFingerprint,
  transformTransitionDurationSeconds,
} from "@player-web/impl/specialModesSettings";
import { createDefaultBrowserViewportSettings } from "@player-web/impl/viewportSettings";

describe("specialModesSettings", () => {
  it("normalizes settings and retains one random transform", () => {
    const defaults = createDefaultBrowserSpecialModesSettings(() => 17);
    expect(parseStoredSpecialModesSettings({
      visibility: { mode: "lantern-fog", lanternRadius: 99 },
      monsterMadness: { enabled: true, includePlayer: true, seed: 33 },
      transform: {
        enabled: true,
        intervalSeconds: 1,
        transitionSpeed: "slow",
        strategy: "random",
        allowedRandomTransforms: [],
        seed: 44,
      },
    }, defaults)).toEqual({
      visibility: { mode: "lantern-fog", lanternRadius: 16 },
      monsterMadness: { enabled: true, includePlayer: true, seed: 33 },
      transform: {
        enabled: true,
        intervalSeconds: 5,
        transitionSpeed: "slow",
        strategy: "random",
        allowedRandomTransforms: defaults.transform.allowedRandomTransforms,
        seed: 44,
      },
    });
  });

  it("treats custom viewport size as a special mode and fingerprints the full configuration", () => {
    const specialModes = createDefaultBrowserSpecialModesSettings(() => 7);
    const viewport = createDefaultBrowserViewportSettings();
    expect(isSpecialModesConfigurationActive({ viewport, specialModes })).toBe(false);
    const enabled = { ...viewport, enabled: true };
    expect(isSpecialModesConfigurationActive({ viewport: enabled, specialModes })).toBe(true);
    expect(specialModesConfigurationFingerprint({ viewport: enabled, specialModes })).toMatch(/^special-[0-9a-f]{8}$/u);
    expect(specialModesConfigurationFingerprint({
      viewport: enabled,
      specialModes: {
        ...specialModes,
        monsterMadness: { ...specialModes.monsterMadness, seed: 8 },
      },
    })).not.toBe(specialModesConfigurationFingerprint({ viewport: enabled, specialModes }));
  });

  it("maps the three speed choices to the full transition duration", () => {
    expect(transformTransitionDurationSeconds("fast")).toBe(1);
    expect(transformTransitionDurationSeconds("medium")).toBe(2);
    expect(transformTransitionDurationSeconds("slow")).toBe(3);
  });
});
