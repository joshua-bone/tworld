const UINT31_MASK = 0x7fffffffn;
const LEGACY_RANDOM_MULTIPLIER = 1103515245n;
const LEGACY_RANDOM_INCREMENT = 12345n;

let sharedLegacyRandomSeed: number | null = null;

export function advanceLegacySharedRandomSeed(seed: number): number {
  return Number((BigInt(seed >>> 0) * LEGACY_RANDOM_MULTIPLIER + LEGACY_RANDOM_INCREMENT) & UINT31_MASK);
}

export function initializeLegacySharedRandomSeedFromUnixTime(unixTimeSeconds: number): number {
  let value = Number(BigInt(Math.max(0, Math.floor(unixTimeSeconds))) & UINT31_MASK);
  for (let index = 0; index < 4; index += 1) {
    value = advanceLegacySharedRandomSeed(value);
  }
  return value;
}

export function acquireLegacySharedRandomSeed(nowMs = Date.now()): number {
  if (sharedLegacyRandomSeed === null) {
    sharedLegacyRandomSeed = initializeLegacySharedRandomSeedFromUnixTime(Math.floor(nowMs / 1000));
  }

  return sharedLegacyRandomSeed;
}

export function resolveLegacySessionRandomSeed(replayRandomSeed: number | null | undefined, nowMs = Date.now()): number {
  return replayRandomSeed ?? acquireLegacySharedRandomSeed(nowMs);
}

export function observeLegacySharedRandomSeed(seed: number | string | null | undefined): void {
  if (seed === null || seed === undefined) {
    return;
  }

  const numericSeed =
    typeof seed === "string"
      ? Number.parseInt(seed, 10)
      : seed;
  if (!Number.isFinite(numericSeed)) {
    return;
  }

  sharedLegacyRandomSeed = Number(BigInt(Math.trunc(numericSeed)) & UINT31_MASK);
}

export function resetLegacySharedRandomSeedForTest(): void {
  sharedLegacyRandomSeed = null;
}
