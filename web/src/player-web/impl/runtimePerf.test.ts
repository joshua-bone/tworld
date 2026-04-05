import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  measurePerfAsync,
  measurePerfSync,
  recordPerfMeasurement,
  recordSchedulerCatchUp,
  resetPerfMetrics,
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
