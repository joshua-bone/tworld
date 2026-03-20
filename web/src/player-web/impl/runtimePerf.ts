type PerfMetricName =
  | "catalogBootstrapMs"
  | "catalogHydrationBatchMs"
  | "catalogImportedMs"
  | "initialRenderWarmupMs"
  | "loopDriftMs"
  | "renderMs"
  | "sessionLoadMs"
  | "tickMs";

interface PerfMetricConfig {
  budgetMs: number;
  label: string;
  warnMultiplier: number;
}

interface PerfMetricState {
  emaMs: number;
  lastMs: number;
  maxMs: number;
  samples: number;
  totalMs: number;
  warnCount: number;
  lastWarnAtMs: number;
}

export interface PerfMetricSnapshot {
  avgMs: number;
  budgetMs: number;
  emaMs: number;
  label: string;
  lastMs: number;
  maxMs: number;
  samples: number;
  warnCount: number;
}

interface PerfRuntimeGlobal {
  reset: () => void;
  snapshot: () => Record<PerfMetricName, PerfMetricSnapshot>;
}

const PERF_WARN_THROTTLE_MS = 5000;
const PERF_EMA_WEIGHT = 0.15;
const PERF_METRIC_CONFIG: Record<PerfMetricName, PerfMetricConfig> = {
  catalogBootstrapMs: {
    budgetMs: 60,
    label: "catalog bootstrap",
    warnMultiplier: 2,
  },
  catalogHydrationBatchMs: {
    budgetMs: 24,
    label: "catalog hydration batch",
    warnMultiplier: 2,
  },
  catalogImportedMs: {
    budgetMs: 30,
    label: "catalog imported batch",
    warnMultiplier: 2,
  },
  initialRenderWarmupMs: {
    budgetMs: 40,
    label: "initial render warmup",
    warnMultiplier: 2,
  },
  loopDriftMs: {
    budgetMs: 20,
    label: "game loop drift",
    warnMultiplier: 2,
  },
  renderMs: {
    budgetMs: 12,
    label: "canvas render",
    warnMultiplier: 2,
  },
  sessionLoadMs: {
    budgetMs: 120,
    label: "session load",
    warnMultiplier: 2,
  },
  tickMs: {
    budgetMs: 12,
    label: "game tick",
    warnMultiplier: 2,
  },
};

const PERF_GLOBAL_KEY = "__TWORLD_PERF__";
const perfMetricStates = new Map<PerfMetricName, PerfMetricState>();

function createPerfMetricState(): PerfMetricState {
  return {
    emaMs: 0,
    lastMs: 0,
    maxMs: 0,
    samples: 0,
    totalMs: 0,
    warnCount: 0,
    lastWarnAtMs: Number.NEGATIVE_INFINITY,
  };
}

function getPerfMetricState(name: PerfMetricName): PerfMetricState {
  const existing = perfMetricStates.get(name);
  if (existing) {
    return existing;
  }

  const state = createPerfMetricState();
  perfMetricStates.set(name, state);
  return state;
}

function snapshotMetric(name: PerfMetricName, state: PerfMetricState): PerfMetricSnapshot {
  const config = PERF_METRIC_CONFIG[name];
  return {
    avgMs: state.samples > 0 ? state.totalMs / state.samples : 0,
    budgetMs: config.budgetMs,
    emaMs: state.emaMs,
    label: config.label,
    lastMs: state.lastMs,
    maxMs: state.maxMs,
    samples: state.samples,
    warnCount: state.warnCount,
  };
}

export function snapshotPerfMetrics(): Record<PerfMetricName, PerfMetricSnapshot> {
  return {
    catalogBootstrapMs: snapshotMetric("catalogBootstrapMs", getPerfMetricState("catalogBootstrapMs")),
    catalogHydrationBatchMs: snapshotMetric("catalogHydrationBatchMs", getPerfMetricState("catalogHydrationBatchMs")),
    catalogImportedMs: snapshotMetric("catalogImportedMs", getPerfMetricState("catalogImportedMs")),
    initialRenderWarmupMs: snapshotMetric("initialRenderWarmupMs", getPerfMetricState("initialRenderWarmupMs")),
    loopDriftMs: snapshotMetric("loopDriftMs", getPerfMetricState("loopDriftMs")),
    renderMs: snapshotMetric("renderMs", getPerfMetricState("renderMs")),
    sessionLoadMs: snapshotMetric("sessionLoadMs", getPerfMetricState("sessionLoadMs")),
    tickMs: snapshotMetric("tickMs", getPerfMetricState("tickMs")),
  };
}

export function resetPerfMetrics(): void {
  perfMetricStates.clear();
}

function warnIfNeeded(name: PerfMetricName, durationMs: number, state: PerfMetricState): void {
  const config = PERF_METRIC_CONFIG[name];
  if (durationMs < config.budgetMs * config.warnMultiplier) {
    return;
  }

  const now = performance.now();
  if (now - state.lastWarnAtMs < PERF_WARN_THROTTLE_MS) {
    return;
  }

  state.lastWarnAtMs = now;
  state.warnCount += 1;
  console.warn("[tworld:perf]", {
    avgMs: state.samples > 0 ? state.totalMs / state.samples : durationMs,
    budgetMs: config.budgetMs,
    emaMs: state.emaMs,
    label: config.label,
    lastMs: durationMs,
    maxMs: state.maxMs,
    samples: state.samples,
  });
}

export function recordPerfMeasurement(name: PerfMetricName, durationMs: number): void {
  const state = getPerfMetricState(name);
  state.samples += 1;
  state.lastMs = durationMs;
  state.maxMs = Math.max(state.maxMs, durationMs);
  state.totalMs += durationMs;
  state.emaMs = state.samples === 1 ? durationMs : state.emaMs + (durationMs - state.emaMs) * PERF_EMA_WEIGHT;
  warnIfNeeded(name, durationMs, state);
}

export async function measurePerfAsync<T>(name: PerfMetricName, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    recordPerfMeasurement(name, performance.now() - start);
  }
}

export function measurePerfSync<T>(name: PerfMetricName, work: () => T): T {
  const start = performance.now();
  try {
    return work();
  } finally {
    recordPerfMeasurement(name, performance.now() - start);
  }
}

function ensurePerfGlobal(): void {
  const target = globalThis as typeof globalThis & {
    [PERF_GLOBAL_KEY]?: PerfRuntimeGlobal;
  };

  if (target[PERF_GLOBAL_KEY]) {
    return;
  }

  target[PERF_GLOBAL_KEY] = {
    reset: resetPerfMetrics,
    snapshot: snapshotPerfMetrics,
  };
}

ensurePerfGlobal();
