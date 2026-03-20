import { afterEach, describe, expect, it } from "vitest";
import {
  acquireLegacySharedRandomSeed,
  advanceLegacySharedRandomSeed,
  initializeLegacySharedRandomSeedFromUnixTime,
  observeLegacySharedRandomSeed,
  resetLegacySharedRandomSeedForTest,
  resolveLegacySessionRandomSeed,
} from "@player-web/impl/legacySharedRandomSeed";

describe("legacySharedRandomSeed", () => {
  afterEach(() => {
    resetLegacySharedRandomSeedForTest();
  });

  it("matches legacy random.c initial shared-seed derivation from time(NULL)", () => {
    // Matches legacy_c/random.c resetprng():
    // nextvalue(nextvalue(nextvalue(nextvalue(time(NULL)))))
    expect(initializeLegacySharedRandomSeedFromUnixTime(0)).toBe(1449466924);
    expect(initializeLegacySharedRandomSeedFromUnixTime(42)).toBe(1668674806);
    expect(initializeLegacySharedRandomSeedFromUnixTime(1710781200)).toBe(1868148796);
  });

  it("advances with the legacy linear congruential generator", () => {
    expect(advanceLegacySharedRandomSeed(1868148796)).toBe(1196065221);
  });

  it("reuses the shared seed until gameplay observes a newer shared state", () => {
    const initial = acquireLegacySharedRandomSeed(1710781200000);
    expect(initial).toBe(1868148796);
    expect(acquireLegacySharedRandomSeed(1710781201999)).toBe(initial);

    observeLegacySharedRandomSeed(720335461);
    expect(acquireLegacySharedRandomSeed(1710789999000)).toBe(720335461);
  });

  it("normalizes observed seeds to the native 31-bit range", () => {
    observeLegacySharedRandomSeed(0xffffffff);
    expect(acquireLegacySharedRandomSeed(0)).toBe(0x7fffffff);
  });

  it("prefers the replay seed when playback supplies one", () => {
    expect(resolveLegacySessionRandomSeed(777, 1710781200000)).toBe(777);
    expect(resolveLegacySessionRandomSeed(null, 1710781200000)).toBe(1868148796);
  });

  it("uses a manual override seed for live starts when no replay seed is present", () => {
    expect(resolveLegacySessionRandomSeed(null, 1710781200000, 555)).toBe(555);
    expect(resolveLegacySessionRandomSeed(777, 1710781200000, 555)).toBe(777);
  });
});
