const INPUT_SAMPLES_PER_LOGIC_STEP = 4;
const LOGIC_STEPS_PER_SECOND = 10;

/**
 * Wall-clock cadence for Hybrid input sampling. Fast-forward changes only the
 * host schedule; the deterministic engine still receives one input per logic
 * boundary and never observes Shift itself.
 */
export function hybridCcInputSampleIntervalMs(isFastForwarding: boolean): number {
  const logicStepsPerWallClockSecond = isFastForwarding
    ? LOGIC_STEPS_PER_SECOND * 2
    : LOGIC_STEPS_PER_SECOND;
  return 1_000 / (logicStepsPerWallClockSecond * INPUT_SAMPLES_PER_LOGIC_STEP);
}
