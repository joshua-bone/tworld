import type { InteractivePerfBaseline, InteractivePerfScenarioBaseline } from "./interactivePerfBaseline";
import type { InteractivePerfScenarioBenchmark } from "./interactivePerfHarness";

interface PerfBudgetConfig {
  absoluteSlack: number;
  label: string;
  multiplier: number;
}

export interface InteractivePerfBudgetViolation {
  actual: number;
  allowed: number;
  baseline: number;
  label: string;
  scenarioId: string;
}

const PERF_BUDGETS = {
  cloneMedianMs: {
    absoluteSlack: 0.25,
    label: "clone median ms",
    multiplier: 1.75,
  },
  interactiveTickMedianMs: {
    absoluteSlack: 0.5,
    label: "interactive tick median ms",
    multiplier: 1.5,
  },
  payloadBytesMedian: {
    absoluteSlack: 64,
    label: "payload median bytes",
    multiplier: 1.1,
  },
  rawTickMedianMs: {
    absoluteSlack: 0.25,
    label: "raw tick median ms",
    multiplier: 1.6,
  },
  workerUpdateMedianMs: {
    absoluteSlack: 0.25,
    label: "worker update median ms",
    multiplier: 1.75,
  },
} as const satisfies Record<keyof InteractivePerfScenarioBaseline, PerfBudgetConfig>;

function allowedMaximum(baseline: number, budget: PerfBudgetConfig): number {
  return baseline * budget.multiplier + budget.absoluteSlack;
}

export function evaluateInteractivePerfGuard(
  results: readonly InteractivePerfScenarioBenchmark[],
  baseline: InteractivePerfBaseline,
): InteractivePerfBudgetViolation[] {
  const violations: InteractivePerfBudgetViolation[] = [];

  for (const result of results) {
    const scenarioBaseline = baseline.scenarios[result.scenarioId];
    if (!scenarioBaseline) {
      violations.push({
        actual: 0,
        allowed: 0,
        baseline: 0,
        label: "missing baseline",
        scenarioId: result.scenarioId,
      });
      continue;
    }

    const comparisons = {
      cloneMedianMs: result.cloneMs.median,
      interactiveTickMedianMs: result.interactiveTickMs.median,
      payloadBytesMedian: result.payloadBytes.median,
      rawTickMedianMs: result.rawTickMs.median,
      workerUpdateMedianMs: result.workerUpdateMs.median,
    } as const satisfies Record<keyof InteractivePerfScenarioBaseline, number>;

    for (const [metricName, actual] of Object.entries(comparisons) as Array<
      [keyof InteractivePerfScenarioBaseline, number]
    >) {
      const metricBaseline = scenarioBaseline[metricName];
      const budget = PERF_BUDGETS[metricName];
      const allowed = allowedMaximum(metricBaseline, budget);
      if (actual <= allowed) {
        continue;
      }

      violations.push({
        actual,
        allowed,
        baseline: metricBaseline,
        label: budget.label,
        scenarioId: result.scenarioId,
      });
    }
  }

  return violations;
}
