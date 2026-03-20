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
