import { describe, expect, it } from "vitest";
import {
  buildLevelSeedOverrideKey,
  createRandomLegacyRandomSeed,
  findLevelSeedOverride,
  normalizeLegacyRandomSeed,
} from "@player-web/impl/levelSeedOverrides";

describe("levelSeedOverrides", () => {
  it("normalizes seeds to the legacy 31-bit range", () => {
    expect(normalizeLegacyRandomSeed(0xffffffff)).toBe(2147483647);
    expect(normalizeLegacyRandomSeed(-1)).toBe(2147483647);
    expect(normalizeLegacyRandomSeed(123456789)).toBe(123456789);
  });

  it("matches overrides by series, level, and ruleset", () => {
    const overrides = [
      { seriesFile: "CCLP1-Lynx.dac", levelNumber: 5, ruleset: "Lynx" as const, randomSeed: 123 },
      { seriesFile: "CCLP1-MS.dac", levelNumber: 5, ruleset: "MS" as const, randomSeed: 456 },
    ];

    expect(
      findLevelSeedOverride(overrides, {
        seriesFile: "CCLP1-Lynx.dac",
        levelNumber: 5,
        ruleset: "Lynx",
      }),
    ).toEqual(overrides[0]);
    expect(buildLevelSeedOverrideKey(overrides[1])).toBe("CCLP1-MS.dac:5:MS");
  });

  it("creates a random seed in the native 31-bit range", () => {
    const seed = createRandomLegacyRandomSeed();

    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(2147483647);
  });
});
