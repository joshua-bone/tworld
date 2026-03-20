import { createRandomLegacyRandomSeed } from "@player-web/impl/levelSeedOverrides";

export function resolveLegacySessionRandomSeed(
  replayRandomSeed: number | null | undefined,
  nowMs = Date.now(),
  manualOverrideSeed: number | null | undefined = null,
): number {
  void nowMs;
  return replayRandomSeed ?? manualOverrideSeed ?? createRandomLegacyRandomSeed();
}
