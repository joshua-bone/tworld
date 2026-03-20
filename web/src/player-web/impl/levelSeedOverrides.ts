import type {
  BrowserLevelSeedOverride,
  BrowserPreferredRuleset,
} from "@player-web/ports/BrowserProfileStore";

const UINT31_MASK = 0x7fffffffn;

export interface BrowserLevelSeedOverrideTarget {
  seriesFile: string;
  levelNumber: number;
  ruleset: BrowserPreferredRuleset;
}

export function normalizeLegacyRandomSeed(seed: number): number {
  return Number(BigInt(Math.trunc(seed)) & UINT31_MASK);
}

export function createRandomLegacyRandomSeed(): number {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return normalizeLegacyRandomSeed(values[0] ?? 0);
  }

  return normalizeLegacyRandomSeed(Math.floor(Math.random() * 0x80000000));
}

export function buildLevelSeedOverrideKey(target: BrowserLevelSeedOverrideTarget): string {
  return `${target.seriesFile}:${target.levelNumber}:${target.ruleset}`;
}

export function findLevelSeedOverride(
  overrides: readonly BrowserLevelSeedOverride[],
  target: BrowserLevelSeedOverrideTarget | null,
): BrowserLevelSeedOverride | null {
  if (!target) {
    return null;
  }

  const key = buildLevelSeedOverrideKey(target);
  return overrides.find((entry) => buildLevelSeedOverrideKey(entry) === key) ?? null;
}
