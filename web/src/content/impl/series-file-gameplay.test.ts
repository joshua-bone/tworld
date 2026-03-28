import { describe, expect, it } from "vitest";
import { computeLegacyLevelGameplayHash } from "@content/api/series-file";
import {
  buildLegacyDatLevelData,
  encodeDatMetadataField,
} from "@content/impl/contentTestSupport";

describe("computeLegacyLevelGameplayHash", () => {
  it("ignores non-gameplay metadata such as number, timer, title, author, password, and hint", () => {
    const baseline = buildLegacyDatLevelData();
    const retitled = buildLegacyDatLevelData({
      author: "Different Author",
      hint: "Completely different hint.",
      name: "Different Name",
      number: 99,
      password: "WXYZ",
      timeLimitSeconds: 30,
    });

    expect(computeLegacyLevelGameplayHash(retitled)).toBe(computeLegacyLevelGameplayHash(baseline));
  });

  it("changes when chips required or map bytes change", () => {
    const baseline = buildLegacyDatLevelData();
    const changedChips = buildLegacyDatLevelData({
      chipsRequired: 5,
    });
    const changedUpperLayer = buildLegacyDatLevelData({
      upper: [0x11, 0x22, 0x33, 0x99],
    });

    expect(computeLegacyLevelGameplayHash(changedChips)).not.toBe(computeLegacyLevelGameplayHash(baseline));
    expect(computeLegacyLevelGameplayHash(changedUpperLayer)).not.toBe(computeLegacyLevelGameplayHash(baseline));
  });

  it("normalizes chips-required metadata overrides into the gameplay hash", () => {
    const headerOnly = buildLegacyDatLevelData({
      chipsRequired: 6,
    });
    const metadataOverride = buildLegacyDatLevelData({
      chipsRequired: 2,
      extraMetadata: encodeDatMetadataField(2, [6, 0]),
    });

    expect(computeLegacyLevelGameplayHash(metadataOverride)).toBe(computeLegacyLevelGameplayHash(headerOnly));
  });
});
