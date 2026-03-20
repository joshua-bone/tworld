import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveLegacySessionRandomSeed,
} from "@player-web/impl/legacySharedRandomSeed";

describe("legacySharedRandomSeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the replay seed when playback supplies one", () => {
    expect(resolveLegacySessionRandomSeed(777, 1710781200000)).toBe(777);
  });

  it("uses a manual override seed for live starts when no replay seed is present", () => {
    expect(resolveLegacySessionRandomSeed(null, 1710781200000, 555)).toBe(555);
    expect(resolveLegacySessionRandomSeed(777, 1710781200000, 555)).toBe(777);
  });

  it("creates a fresh random seed for each unlocked live start", () => {
    const seeds = [101, 202];
    vi.stubGlobal("crypto", {
      getRandomValues(values: Uint32Array) {
        values[0] = seeds.shift() ?? 0;
        return values;
      },
    });

    expect(resolveLegacySessionRandomSeed(null, 1710781200000)).toBe(101);
    expect(resolveLegacySessionRandomSeed(null, 1710781200000)).toBe(202);
  });
});
