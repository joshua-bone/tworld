import { describe, expect, it } from "vitest";
import { evaluateInteractiveLoadPerfGuard } from "./interactiveLoadPerfGuard";
import type { InteractiveLoadPerfBaseline } from "./interactiveLoadPerfBaseline";
import type { InteractiveLoadPerfScenarioBenchmark } from "./interactiveLoadPerfHarness";

function createBenchmark(
  overrides: Partial<InteractiveLoadPerfScenarioBenchmark> = {},
): InteractiveLoadPerfScenarioBenchmark {
  return {
    coldInitialProjectionMs: { avg: 2, count: 4, max: 2, median: 2, min: 2, p95: 2, total: 8 },
    coldLevelLoadMs: { avg: 12, count: 4, max: 12, median: 12, min: 12, p95: 12, total: 48 },
    coldPrepareLevelMs: { avg: 6, count: 4, max: 6, median: 6, min: 6, p95: 6, total: 24 },
    coldStartMs: { avg: 20, count: 4, max: 20, median: 20, min: 20, p95: 20, total: 80 },
    family: "typical",
    label: "Typical MS",
    notes: "",
    request: {
      levelNumber: 1,
      ruleset: "MS",
      seriesFile: "CCLP1-MS.dac",
    },
    scenarioId: "typical-ms",
    warmInitialProjectionMs: { avg: 2, count: 6, max: 2, median: 2, min: 2, p95: 2, total: 12 },
    warmLevelLoadMs: { avg: 1, count: 6, max: 1, median: 1, min: 1, p95: 1, total: 6 },
    warmPrepareLevelMs: { avg: 6, count: 6, max: 6, median: 6, min: 6, p95: 6, total: 36 },
    warmStartMs: { avg: 9, count: 6, max: 9, median: 9, min: 9, p95: 9, total: 54 },
    ...overrides,
  };
}

describe("interactiveLoadPerfGuard", () => {
  it("passes when load results stay within the configured slack", () => {
    const baseline: InteractiveLoadPerfBaseline = {
      scenarios: {
        "typical-ms": {
          coldInitialProjectionMedianMs: 2,
          coldLevelLoadMedianMs: 12,
          coldPrepareLevelMedianMs: 6,
          coldStartMedianMs: 20,
          warmInitialProjectionMedianMs: 2,
          warmLevelLoadMedianMs: 1,
          warmPrepareLevelMedianMs: 6,
          warmStartMedianMs: 9,
        },
      },
      version: 1,
    };

    expect(evaluateInteractiveLoadPerfGuard([createBenchmark()], baseline)).toEqual([]);
  });

  it("reports a violation when a load metric regresses materially", () => {
    const baseline: InteractiveLoadPerfBaseline = {
      scenarios: {
        "typical-ms": {
          coldInitialProjectionMedianMs: 2,
          coldLevelLoadMedianMs: 12,
          coldPrepareLevelMedianMs: 6,
          coldStartMedianMs: 20,
          warmInitialProjectionMedianMs: 2,
          warmLevelLoadMedianMs: 1,
          warmPrepareLevelMedianMs: 6,
          warmStartMedianMs: 9,
        },
      },
      version: 1,
    };

    const violations = evaluateInteractiveLoadPerfGuard(
      [
        createBenchmark({
          coldStartMs: { avg: 80, count: 4, max: 80, median: 80, min: 80, p95: 80, total: 320 },
        }),
      ],
      baseline,
    );

    expect(violations).toEqual([
      expect.objectContaining({
        label: "cold start median ms",
        scenarioId: "typical-ms",
      }),
    ]);
  });

  it("reports a missing baseline distinctly", () => {
    const baseline: InteractiveLoadPerfBaseline = {
      scenarios: {},
      version: 1,
    };

    expect(evaluateInteractiveLoadPerfGuard([createBenchmark()], baseline)).toEqual([
      expect.objectContaining({
        label: "missing load baseline",
        scenarioId: "typical-ms",
      }),
    ]);
  });
});
