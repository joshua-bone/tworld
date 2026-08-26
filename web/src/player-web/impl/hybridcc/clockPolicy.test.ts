import { describe, expect, it } from "vitest";
import { hybridCcInputSampleIntervalMs } from "./clockPolicy";

describe("Hybrid clock policy", () => {
  it("samples four times per 10 Hz logic step at normal speed", () => {
    const intervalMs = hybridCcInputSampleIntervalMs(false);

    expect(intervalMs).toBe(25);
    expect(1_000 / intervalMs).toBe(40);
    expect(1_000 / intervalMs / 4).toBe(10);
  });

  it("uses Shift to double wall-clock speed without changing samples per logic step", () => {
    const intervalMs = hybridCcInputSampleIntervalMs(true);

    expect(intervalMs).toBe(12.5);
    expect(1_000 / intervalMs).toBe(80);
    expect(1_000 / intervalMs / 4).toBe(20);
  });
});
