import { describe, expect, it } from "vitest";
import { computeLegacyLevelGameplayHash } from "@content/api/series-file";

function encodeUint16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function encodePassword(password: string): number[] {
  return Array.from(password, (char) => char.charCodeAt(0) ^ 0x99).concat(0);
}

function encodeLatin1(value: string): number[] {
  return Array.from(value, (char) => char.charCodeAt(0)).concat(0);
}

function encodeField(id: number, payload: readonly number[]): number[] {
  return [id, payload.length, ...payload];
}

function buildLevelData(options: {
  author?: string;
  chipsRequired?: number;
  extraMetadata?: readonly number[];
  hint?: string;
  lower?: readonly number[];
  name?: string;
  number?: number;
  password?: string;
  timeLimitSeconds?: number;
  upper?: readonly number[];
} = {}): Uint8Array {
  const upper = [...(options.upper ?? [0x11, 0x22, 0x33, 0x44])];
  const lower = [...(options.lower ?? [0x55, 0x66, 0x77, 0x88])];
  const metadata = [
    encodeField(3, encodeLatin1(options.name ?? "Gameplay Hash")),
    encodeField(6, encodePassword(options.password ?? "ABCD")),
    encodeField(9, encodeLatin1(options.author ?? "Tester")),
    encodeField(7, encodeLatin1(options.hint ?? "This hint should not matter.")),
    ...(options.extraMetadata ? [options.extraMetadata] : []),
  ].flat();

  return Uint8Array.from([
    ...encodeUint16(options.number ?? 1),
    ...encodeUint16(options.timeLimitSeconds ?? 250),
    ...encodeUint16(options.chipsRequired ?? 4),
    0,
    0,
    ...encodeUint16(upper.length),
    ...upper,
    ...encodeUint16(lower.length),
    ...lower,
    ...encodeUint16(metadata.length),
    ...metadata,
  ]);
}

describe("computeLegacyLevelGameplayHash", () => {
  it("ignores non-gameplay metadata such as number, timer, title, author, password, and hint", () => {
    const baseline = buildLevelData();
    const retitled = buildLevelData({
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
    const baseline = buildLevelData();
    const changedChips = buildLevelData({
      chipsRequired: 5,
    });
    const changedUpperLayer = buildLevelData({
      upper: [0x11, 0x22, 0x33, 0x99],
    });

    expect(computeLegacyLevelGameplayHash(changedChips)).not.toBe(computeLegacyLevelGameplayHash(baseline));
    expect(computeLegacyLevelGameplayHash(changedUpperLayer)).not.toBe(computeLegacyLevelGameplayHash(baseline));
  });

  it("normalizes chips-required metadata overrides into the gameplay hash", () => {
    const headerOnly = buildLevelData({
      chipsRequired: 6,
    });
    const metadataOverride = buildLevelData({
      chipsRequired: 2,
      extraMetadata: encodeField(2, encodeUint16(6)),
    });

    expect(computeLegacyLevelGameplayHash(metadataOverride)).toBe(computeLegacyLevelGameplayHash(headerOnly));
  });
});
