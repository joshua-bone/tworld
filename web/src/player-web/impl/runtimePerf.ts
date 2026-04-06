type PerfMetricName =
  | "audioBootstrapMs"
  | "catalogBootstrapMs"
  | "catalogHydrationBatchMs"
  | "catalogImportedMs"
  | "initialRenderWarmupMs"
  | "initialProjectionMs"
  | "levelLoadMs"
  | "loopDriftMs"
  | "prepareLevelMs"
  | "renderMs"
  | "sessionLoadMs"
  | "tickMs"
  | "tilesetLoadMs"
  | "workerSessionStartMs"
  | "workerAdvanceRoundTripMs";

interface PerfMetricConfig {
  budgetMs: number;
  label: string;
  warnMultiplier: number;
}

interface PerfMetricState {
  emaMs: number;
  lastMs: number;
  maxMs: number;
  recentSamples: TimedSample[];
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
  recentAvgMs: number;
  recentLastMs: number;
  recentMaxMs: number;
  recentSamples: number;
  samples: number;
  warnCount: number;
  windowMs: number;
}

export interface ValueMetricSnapshot {
  avgValue: number;
  emaValue: number;
  lastValue: number;
  maxValue: number;
  recentAvgValue: number;
  recentLastValue: number;
  recentMaxValue: number;
  recentSamples: number;
  samples: number;
  windowMs: number;
}

export interface SchedulerCatchUpSnapshot {
  batchCount: number;
  cappedBatchCount: number;
  droppedTickCount: number;
  lastBatchTicks: number;
  maxBatchTicks: number;
}

export interface WorkerRuntimePerfSnapshot {
  advancePayloadBytes: ValueMetricSnapshot;
  advanceRoundTripMs: PerfMetricSnapshot;
}

export interface RuntimePerfSnapshot {
  metrics: Record<PerfMetricName, PerfMetricSnapshot>;
  scheduler: SchedulerCatchUpSnapshot;
  worker: WorkerRuntimePerfSnapshot;
}

interface PerfRuntimeGlobal {
  isDiagnosticsEnabled: () => boolean;
  recordSessionLoadPhases: (metrics: SessionLoadPhaseMetrics) => void;
  recordWorkerAdvancePayloadBytes: (value: number) => void;
  recordWorkerAdvanceRoundTrip: (durationMs: number) => void;
  reset: () => void;
  setDiagnosticsEnabled: (enabled: boolean) => void;
  snapshot: () => Record<PerfMetricName, PerfMetricSnapshot>;
}

interface ValueMetricState {
  emaValue: number;
  lastValue: number;
  maxValue: number;
  recentSamples: TimedSample[];
  samples: number;
  totalValue: number;
}

const PERF_WARN_THROTTLE_MS = 5000;
const PERF_EMA_WEIGHT = 0.15;
const PERF_ROLLING_WINDOW_MS = 5000;
const PERF_METRIC_CONFIG: Record<PerfMetricName, PerfMetricConfig> = {
  audioBootstrapMs: {
    budgetMs: 40,
    label: "sound bootstrap",
    warnMultiplier: 2,
  },
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
  initialProjectionMs: {
    budgetMs: 30,
    label: "initial session projection",
    warnMultiplier: 2,
  },
  levelLoadMs: {
    budgetMs: 90,
    label: "level load",
    warnMultiplier: 2,
  },
  loopDriftMs: {
    budgetMs: 20,
    label: "game loop drift",
    warnMultiplier: 2,
  },
  prepareLevelMs: {
    budgetMs: 40,
    label: "prepare loaded level",
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
  tilesetLoadMs: {
    budgetMs: 80,
    label: "legacy tileset load",
    warnMultiplier: 2,
  },
  workerSessionStartMs: {
    budgetMs: 120,
    label: "worker start session",
    warnMultiplier: 2,
  },
  workerAdvanceRoundTripMs: {
    budgetMs: 20,
    label: "worker advance round trip",
    warnMultiplier: 2,
  },
};

const PERF_GLOBAL_KEY = "__TWORLD_PERF__";
const perfMetricStates = new Map<PerfMetricName, PerfMetricState>();
let perfDiagnosticsEnabled = false;
const workerPayloadBytesState: ValueMetricState = {
  emaValue: 0,
  lastValue: 0,
  maxValue: 0,
  recentSamples: [],
  samples: 0,
  totalValue: 0,
};

interface SchedulerCatchUpState {
  batchCount: number;
  cappedBatchCount: number;
  droppedTickCount: number;
  lastBatchTicks: number;
  maxBatchTicks: number;
}

const schedulerCatchUpState: SchedulerCatchUpState = {
  batchCount: 0,
  cappedBatchCount: 0,
  droppedTickCount: 0,
  lastBatchTicks: 0,
  maxBatchTicks: 0,
};

interface TimedSample {
  atMs: number;
  value: number;
}

export interface SessionLoadPhaseMetrics {
  initialProjectionMs?: number;
  levelLoadMs?: number;
  prepareLevelMs?: number;
  workerSessionStartMs?: number;
}

function createPerfMetricState(): PerfMetricState {
  return {
    emaMs: 0,
    lastMs: 0,
    maxMs: 0,
    recentSamples: [],
    samples: 0,
    totalMs: 0,
    warnCount: 0,
    lastWarnAtMs: Number.NEGATIVE_INFINITY,
  };
}

function createValueMetricState(): ValueMetricState {
  return {
    emaValue: 0,
    lastValue: 0,
    maxValue: 0,
    recentSamples: [],
    samples: 0,
    totalValue: 0,
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
  const recent = snapshotRecentSamples(state.recentSamples);
  return {
    avgMs: state.samples > 0 ? state.totalMs / state.samples : 0,
    budgetMs: config.budgetMs,
    emaMs: state.emaMs,
    label: config.label,
    lastMs: state.lastMs,
    maxMs: state.maxMs,
    recentAvgMs: recent.avgValue,
    recentLastMs: recent.lastValue,
    recentMaxMs: recent.maxValue,
    recentSamples: recent.samples,
    samples: state.samples,
    warnCount: state.warnCount,
    windowMs: PERF_ROLLING_WINDOW_MS,
  };
}

function snapshotValueMetric(state: ValueMetricState): ValueMetricSnapshot {
  const recent = snapshotRecentSamples(state.recentSamples);
  return {
    avgValue: state.samples > 0 ? state.totalValue / state.samples : 0,
    emaValue: state.emaValue,
    lastValue: state.lastValue,
    maxValue: state.maxValue,
    recentAvgValue: recent.avgValue,
    recentLastValue: recent.lastValue,
    recentMaxValue: recent.maxValue,
    recentSamples: recent.samples,
    samples: state.samples,
    windowMs: PERF_ROLLING_WINDOW_MS,
  };
}

function pruneRecentSamples(samples: TimedSample[], now = performance.now()): void {
  while (samples.length > 0 && now - samples[0]!.atMs > PERF_ROLLING_WINDOW_MS) {
    samples.shift();
  }
}

function snapshotRecentSamples(
  samples: TimedSample[],
  now = performance.now(),
): {
  avgValue: number;
  lastValue: number;
  maxValue: number;
  samples: number;
} {
  pruneRecentSamples(samples, now);
  if (samples.length === 0) {
    return {
      avgValue: 0,
      lastValue: 0,
      maxValue: 0,
      samples: 0,
    };
  }

  let totalValue = 0;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    totalValue += sample.value;
    maxValue = Math.max(maxValue, sample.value);
  }

  return {
    avgValue: totalValue / samples.length,
    lastValue: samples[samples.length - 1]!.value,
    maxValue,
    samples: samples.length,
  };
}

export function snapshotPerfMetrics(): Record<PerfMetricName, PerfMetricSnapshot> {
  return {
    audioBootstrapMs: snapshotMetric("audioBootstrapMs", getPerfMetricState("audioBootstrapMs")),
    catalogBootstrapMs: snapshotMetric("catalogBootstrapMs", getPerfMetricState("catalogBootstrapMs")),
    catalogHydrationBatchMs: snapshotMetric("catalogHydrationBatchMs", getPerfMetricState("catalogHydrationBatchMs")),
    catalogImportedMs: snapshotMetric("catalogImportedMs", getPerfMetricState("catalogImportedMs")),
    initialRenderWarmupMs: snapshotMetric("initialRenderWarmupMs", getPerfMetricState("initialRenderWarmupMs")),
    initialProjectionMs: snapshotMetric("initialProjectionMs", getPerfMetricState("initialProjectionMs")),
    levelLoadMs: snapshotMetric("levelLoadMs", getPerfMetricState("levelLoadMs")),
    loopDriftMs: snapshotMetric("loopDriftMs", getPerfMetricState("loopDriftMs")),
    prepareLevelMs: snapshotMetric("prepareLevelMs", getPerfMetricState("prepareLevelMs")),
    renderMs: snapshotMetric("renderMs", getPerfMetricState("renderMs")),
    sessionLoadMs: snapshotMetric("sessionLoadMs", getPerfMetricState("sessionLoadMs")),
    tickMs: snapshotMetric("tickMs", getPerfMetricState("tickMs")),
    tilesetLoadMs: snapshotMetric("tilesetLoadMs", getPerfMetricState("tilesetLoadMs")),
    workerSessionStartMs: snapshotMetric("workerSessionStartMs", getPerfMetricState("workerSessionStartMs")),
    workerAdvanceRoundTripMs: snapshotMetric(
      "workerAdvanceRoundTripMs",
      getPerfMetricState("workerAdvanceRoundTripMs"),
    ),
  };
}

export function resetPerfMetrics(): void {
  perfMetricStates.clear();
  const nextWorkerPayloadState = createValueMetricState();
  schedulerCatchUpState.batchCount = 0;
  schedulerCatchUpState.cappedBatchCount = 0;
  schedulerCatchUpState.droppedTickCount = 0;
  schedulerCatchUpState.lastBatchTicks = 0;
  schedulerCatchUpState.maxBatchTicks = 0;
  workerPayloadBytesState.emaValue = nextWorkerPayloadState.emaValue;
  workerPayloadBytesState.lastValue = nextWorkerPayloadState.lastValue;
  workerPayloadBytesState.maxValue = nextWorkerPayloadState.maxValue;
  workerPayloadBytesState.recentSamples = nextWorkerPayloadState.recentSamples;
  workerPayloadBytesState.samples = nextWorkerPayloadState.samples;
  workerPayloadBytesState.totalValue = nextWorkerPayloadState.totalValue;
  perfDiagnosticsEnabled = false;
}

export function recordSchedulerCatchUp(
  batchTicks: number,
  options: { capped?: boolean; droppedTicks?: number } = {},
): void {
  if (batchTicks > 0) {
    schedulerCatchUpState.batchCount += 1;
    schedulerCatchUpState.lastBatchTicks = batchTicks;
    schedulerCatchUpState.maxBatchTicks = Math.max(schedulerCatchUpState.maxBatchTicks, batchTicks);
  } else {
    schedulerCatchUpState.lastBatchTicks = 0;
  }

  if (options.capped) {
    schedulerCatchUpState.cappedBatchCount += 1;
  }

  if ((options.droppedTicks ?? 0) > 0) {
    schedulerCatchUpState.droppedTickCount += options.droppedTicks ?? 0;
  }
}

export function snapshotRuntimePerf(): RuntimePerfSnapshot {
  return {
    metrics: snapshotPerfMetrics(),
    scheduler: {
      batchCount: schedulerCatchUpState.batchCount,
      cappedBatchCount: schedulerCatchUpState.cappedBatchCount,
      droppedTickCount: schedulerCatchUpState.droppedTickCount,
      lastBatchTicks: schedulerCatchUpState.lastBatchTicks,
      maxBatchTicks: schedulerCatchUpState.maxBatchTicks,
    },
    worker: {
      advancePayloadBytes: snapshotValueMetric(workerPayloadBytesState),
      advanceRoundTripMs: snapshotMetric(
        "workerAdvanceRoundTripMs",
        getPerfMetricState("workerAdvanceRoundTripMs"),
      ),
    },
  };
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
  const now = performance.now();
  state.samples += 1;
  state.lastMs = durationMs;
  state.maxMs = Math.max(state.maxMs, durationMs);
  state.recentSamples.push({ atMs: now, value: durationMs });
  pruneRecentSamples(state.recentSamples, now);
  state.totalMs += durationMs;
  state.emaMs = state.samples === 1 ? durationMs : state.emaMs + (durationMs - state.emaMs) * PERF_EMA_WEIGHT;
  warnIfNeeded(name, durationMs, state);
}

export function recordSessionLoadPhases(metrics: SessionLoadPhaseMetrics): void {
  if (metrics.workerSessionStartMs !== undefined) {
    recordPerfMeasurement("workerSessionStartMs", metrics.workerSessionStartMs);
  }
  if (metrics.levelLoadMs !== undefined) {
    recordPerfMeasurement("levelLoadMs", metrics.levelLoadMs);
  }
  if (metrics.prepareLevelMs !== undefined) {
    recordPerfMeasurement("prepareLevelMs", metrics.prepareLevelMs);
  }
  if (metrics.initialProjectionMs !== undefined) {
    recordPerfMeasurement("initialProjectionMs", metrics.initialProjectionMs);
  }
}

function recordValueMeasurement(state: ValueMetricState, value: number): void {
  const now = performance.now();
  state.samples += 1;
  state.lastValue = value;
  state.maxValue = Math.max(state.maxValue, value);
  state.recentSamples.push({ atMs: now, value });
  pruneRecentSamples(state.recentSamples, now);
  state.totalValue += value;
  state.emaValue = state.samples === 1 ? value : state.emaValue + (value - state.emaValue) * PERF_EMA_WEIGHT;
}

export function setPerfDiagnosticsEnabled(enabled: boolean): void {
  perfDiagnosticsEnabled = enabled;
}

export function isPerfDiagnosticsEnabled(): boolean {
  return perfDiagnosticsEnabled;
}

export function recordWorkerAdvanceRoundTrip(durationMs: number): void {
  recordPerfMeasurement("workerAdvanceRoundTripMs", durationMs);
}

export function recordWorkerAdvancePayloadBytes(value: number): void {
  recordValueMeasurement(workerPayloadBytesState, value);
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
    isDiagnosticsEnabled: isPerfDiagnosticsEnabled,
    recordSessionLoadPhases,
    recordWorkerAdvancePayloadBytes,
    recordWorkerAdvanceRoundTrip,
    reset: resetPerfMetrics,
    setDiagnosticsEnabled: setPerfDiagnosticsEnabled,
    snapshot: snapshotPerfMetrics,
  };
}

ensurePerfGlobal();
