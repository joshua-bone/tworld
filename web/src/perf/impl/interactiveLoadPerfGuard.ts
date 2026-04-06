import type { InteractiveLoadPerfBaseline, InteractiveLoadPerfScenarioBaseline } from "./interactiveLoadPerfBaseline";
import type { InteractiveLoadPerfScenarioBenchmark } from "./interactiveLoadPerfHarness";

interface PerfBudgetConfig {
  absoluteSlack: number;
  label: string;
  multiplier: number;
}

export interface InteractiveLoadPerfBudgetViolation {
  actual: number;
  allowed: number;
  baseline: number;
  label: string;
  scenarioId: string;
}

const PERF_BUDGETS = {
  coldInitialProjectionMedianMs: {
    absoluteSlack: 50,
    label: "cold initial projection median ms",
    multiplier: 2,
  },
  coldLevelLoadMedianMs: {
    absoluteSlack: 8,
    label: "cold level load median ms",
    multiplier: 2,
  },
  coldPrepareLevelMedianMs: {
    absoluteSlack: 2,
    label: "cold prepare level median ms",
    multiplier: 2,
  },
  coldStartMedianMs: {
    absoluteSlack: 25,
    label: "cold start median ms",
    multiplier: 2,
  },
  warmInitialProjectionMedianMs: {
    absoluteSlack: 25,
    label: "warm initial projection median ms",
    multiplier: 1.75,
  },
  warmLevelLoadMedianMs: {
    absoluteSlack: 0.5,
    label: "warm level load median ms",
    multiplier: 2,
  },
  warmPrepareLevelMedianMs: {
    absoluteSlack: 2,
    label: "warm prepare level median ms",
    multiplier: 2,
  },
  warmStartMedianMs: {
    absoluteSlack: 20,
    label: "warm start median ms",
    multiplier: 1.75,
  },
} as const satisfies Record<keyof InteractiveLoadPerfScenarioBaseline, PerfBudgetConfig>;

function allowedMaximum(baseline: number, budget: PerfBudgetConfig): number {
  return baseline * budget.multiplier + budget.absoluteSlack;
}

export function evaluateInteractiveLoadPerfGuard(
  results: readonly InteractiveLoadPerfScenarioBenchmark[],
  baseline: InteractiveLoadPerfBaseline,
): InteractiveLoadPerfBudgetViolation[] {
  const violations: InteractiveLoadPerfBudgetViolation[] = [];

  for (const result of results) {
    const scenarioBaseline = baseline.scenarios[result.scenarioId];
    if (!scenarioBaseline) {
      violations.push({
        actual: 0,
        allowed: 0,
        baseline: 0,
        label: "missing load baseline",
        scenarioId: result.scenarioId,
      });
      continue;
    }

    const comparisons = {
      coldInitialProjectionMedianMs: result.coldInitialProjectionMs.median,
      coldLevelLoadMedianMs: result.coldLevelLoadMs.median,
      coldPrepareLevelMedianMs: result.coldPrepareLevelMs.median,
      coldStartMedianMs: result.coldStartMs.median,
      warmInitialProjectionMedianMs: result.warmInitialProjectionMs.median,
      warmLevelLoadMedianMs: result.warmLevelLoadMs.median,
      warmPrepareLevelMedianMs: result.warmPrepareLevelMs.median,
      warmStartMedianMs: result.warmStartMs.median,
    } as const satisfies Record<keyof InteractiveLoadPerfScenarioBaseline, number>;

    for (const [metricName, actual] of Object.entries(comparisons) as Array<
      [keyof InteractiveLoadPerfScenarioBaseline, number]
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
