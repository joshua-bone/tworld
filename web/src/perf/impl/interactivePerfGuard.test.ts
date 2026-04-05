import { describe, expect, it } from "vitest";
import { evaluateInteractivePerfGuard } from "./interactivePerfGuard";
import type { InteractivePerfScenarioBenchmark } from "./interactivePerfHarness";
import type { InteractivePerfBaseline } from "./interactivePerfBaseline";

function createBenchmark(overrides: Partial<InteractivePerfScenarioBenchmark> = {}): InteractivePerfScenarioBenchmark {
  return {
    cloneMs: { avg: 1, count: 10, max: 1, median: 1, min: 1, p95: 1, total: 10 },
    endedEarly: false,
    family: "typical",
    interactiveTickMs: { avg: 2, count: 10, max: 2, median: 2, min: 2, p95: 2, total: 20 },
    label: "Typical MS",
    measuredTicks: 10,
    notes: "",
    payloadBytes: { avg: 100, count: 10, max: 100, median: 100, min: 100, p95: 100, total: 1000 },
    rawTickMs: { avg: 0.5, count: 10, max: 0.5, median: 0.5, min: 0.5, p95: 0.5, total: 5 },
    request: {
      levelNumber: 1,
      ruleset: "MS",
      seriesFile: "CCLP1-MS.dac",
    },
    scenarioId: "typical-ms",
    start: {
      currentZ: 1,
      historyCheckpointCount: 1,
      historyEnabled: true,
      tileOverlayCount: 0,
      visibleLayerCount: 1,
    },
    steadyStateHz: 200,
    workerUpdateMs: { avg: 0.5, count: 10, max: 0.5, median: 0.5, min: 0.5, p95: 0.5, total: 5 },
    ...overrides,
  };
}

describe("interactivePerfGuard", () => {
  it("passes when results stay within the configured slack", () => {
    const baseline: InteractivePerfBaseline = {
      scenarios: {
        "typical-ms": {
          cloneMedianMs: 1,
          interactiveTickMedianMs: 2,
          payloadBytesMedian: 100,
          rawTickMedianMs: 0.5,
          workerUpdateMedianMs: 0.5,
        },
      },
      version: 1,
    };

    expect(evaluateInteractivePerfGuard([createBenchmark()], baseline)).toEqual([]);
  });

  it("reports a violation when a timing metric regresses materially", () => {
    const baseline: InteractivePerfBaseline = {
      scenarios: {
        "typical-ms": {
          cloneMedianMs: 1,
          interactiveTickMedianMs: 2,
          payloadBytesMedian: 100,
          rawTickMedianMs: 0.5,
          workerUpdateMedianMs: 0.5,
        },
      },
      version: 1,
    };

    const violations = evaluateInteractivePerfGuard(
      [
        createBenchmark({
          interactiveTickMs: { avg: 4, count: 10, max: 4, median: 4, min: 4, p95: 4, total: 40 },
        }),
      ],
      baseline,
    );

    expect(violations).toEqual([
      expect.objectContaining({
        label: "interactive tick median ms",
        scenarioId: "typical-ms",
      }),
    ]);
  });

  it("reports a missing baseline distinctly", () => {
    const baseline: InteractivePerfBaseline = {
      scenarios: {},
      version: 1,
    };

    expect(evaluateInteractivePerfGuard([createBenchmark()], baseline)).toEqual([
      expect.objectContaining({
        label: "missing baseline",
        scenarioId: "typical-ms",
      }),
    ]);
  });
});
