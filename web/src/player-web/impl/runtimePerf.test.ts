import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPerfDiagnosticsEnabled,
  measurePerfAsync,
  measurePerfSync,
  recordPerfMeasurement,
  recordSchedulerCatchUp,
  recordWorkerAdvancePayloadBytes,
  recordWorkerAdvanceRoundTrip,
  resetPerfMetrics,
  setPerfDiagnosticsEnabled,
  snapshotRuntimePerf,
  snapshotPerfMetrics,
} from "@player-web/impl/runtimePerf";

describe("runtimePerf", () => {
  beforeEach(() => {
    resetPerfMetrics();
  });

  it("records explicit measurements into the public snapshot", () => {
    recordPerfMeasurement("tickMs", 4);
    recordPerfMeasurement("tickMs", 8);

    expect(snapshotPerfMetrics().tickMs).toMatchObject({
      avgMs: 6,
      lastMs: 8,
      maxMs: 8,
      samples: 2,
    });
  });

  it("measures synchronous work", () => {
    const result = measurePerfSync("renderMs", () => 42);

    expect(result).toBe(42);
    expect(snapshotPerfMetrics().renderMs.samples).toBe(1);
  });

  it("measures async work", async () => {
    const result = await measurePerfAsync("sessionLoadMs", async () => "ok");

    expect(result).toBe("ok");
    expect(snapshotPerfMetrics().sessionLoadMs.samples).toBe(1);
  });

  it("tracks catch-up scheduler batches and dropped ticks", () => {
    recordSchedulerCatchUp(2);
    recordSchedulerCatchUp(0, { capped: true, droppedTicks: 3 });
    recordSchedulerCatchUp(4, { capped: true, droppedTicks: 1 });

    expect(snapshotRuntimePerf().scheduler).toMatchObject({
      batchCount: 2,
      cappedBatchCount: 2,
      droppedTickCount: 4,
      lastBatchTicks: 4,
      maxBatchTicks: 4,
    });
  });

  it("resets scheduler catch-up counters with the perf registry", () => {
    recordSchedulerCatchUp(3, { capped: true, droppedTicks: 2 });
    resetPerfMetrics();

    expect(snapshotRuntimePerf().scheduler).toMatchObject({
      batchCount: 0,
      cappedBatchCount: 0,
      droppedTickCount: 0,
      lastBatchTicks: 0,
      maxBatchTicks: 0,
    });
  });

  it("tracks worker advance round-trip and payload diagnostics", () => {
    setPerfDiagnosticsEnabled(true);
    recordWorkerAdvanceRoundTrip(12);
    recordWorkerAdvanceRoundTrip(18);
    recordWorkerAdvancePayloadBytes(2048);
    recordWorkerAdvancePayloadBytes(4096);

    expect(snapshotRuntimePerf().worker).toMatchObject({
      advancePayloadBytes: {
        avgValue: 3072,
        lastValue: 4096,
        maxValue: 4096,
        samples: 2,
      },
      advanceRoundTripMs: {
        avgMs: 15,
        lastMs: 18,
        maxMs: 18,
        samples: 2,
      },
    });
    expect(isPerfDiagnosticsEnabled()).toBe(true);
  });

  it("resets worker diagnostics and disables debug sampling", () => {
    setPerfDiagnosticsEnabled(true);
    recordWorkerAdvanceRoundTrip(10);
    recordWorkerAdvancePayloadBytes(1024);
    resetPerfMetrics();

    expect(snapshotRuntimePerf().worker).toMatchObject({
      advancePayloadBytes: {
        avgValue: 0,
        lastValue: 0,
        maxValue: 0,
        samples: 0,
      },
      advanceRoundTripMs: {
        avgMs: 0,
        lastMs: 0,
        maxMs: 0,
        samples: 0,
      },
    });
    expect(isPerfDiagnosticsEnabled()).toBe(false);
  });

  it("throttles perf warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      recordPerfMeasurement("tickMs", 40);
      recordPerfMeasurement("tickMs", 45);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
