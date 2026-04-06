import type { GameRequest } from "@game-core/api/types";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import type { LevelRepository } from "@level-catalog/ports/LevelRepository";
import type { InteractivePerfScenario } from "./interactivePerfScenarios";

interface NumberSummary {
  avg: number;
  count: number;
  max: number;
  median: number;
  min: number;
  p95: number;
  total: number;
}

export interface InteractiveLoadPerfScenarioBenchmark {
  coldInitialProjectionMs: NumberSummary;
  coldLevelLoadMs: NumberSummary;
  coldStartMs: NumberSummary;
  coldPrepareLevelMs: NumberSummary;
  family: InteractivePerfScenario["family"];
  label: string;
  notes: string;
  request: GameRequest;
  scenarioId: string;
  warmInitialProjectionMs: NumberSummary;
  warmLevelLoadMs: NumberSummary;
  warmStartMs: NumberSummary;
  warmPrepareLevelMs: NumberSummary;
}

function summarize(values: number[]): NumberSummary {
  if (values.length === 0) {
    return {
      avg: 0,
      count: 0,
      max: 0,
      median: 0,
      min: 0,
      p95: 0,
      total: 0,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  const medianIndex = Math.floor((sorted.length - 1) / 2);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avg: total / values.length,
    count: values.length,
    max: sorted[sorted.length - 1] ?? 0,
    median: sorted[medianIndex] ?? 0,
    min: sorted[0] ?? 0,
    p95: sorted[p95Index] ?? 0,
    total,
  };
}

function createInteractiveEngine(levels: LevelRepository, request: GameRequest): InteractiveGameEnginePort {
  return request.ruleset === "MS" ? new MsGameEngineAdapter(levels) : new LynxGameEngineAdapter(levels);
}

async function measureStartSession(
  engine: InteractiveGameEnginePort,
  request: GameRequest,
): Promise<{
  initialProjectionMs: number;
  levelLoadMs: number;
  prepareLevelMs: number;
  startMs: number;
}> {
  const startedAt = performance.now();
  const session = await engine.startSession(request);
  return {
    initialProjectionMs: session.loadPerf?.initialProjectionMs ?? 0,
    levelLoadMs: session.loadPerf?.levelLoadMs ?? 0,
    prepareLevelMs: session.loadPerf?.prepareLevelMs ?? 0,
    startMs: performance.now() - startedAt,
  };
}

export async function benchmarkInteractiveLoadPerfScenario(
  scenario: InteractivePerfScenario,
  options: {
    coldSampleCount?: number;
    createLevels?: () => LevelRepository;
    warmSampleCount?: number;
  } = {},
): Promise<InteractiveLoadPerfScenarioBenchmark> {
  const createLevels = options.createLevels ?? (() => new NodeLevelRepository());
  const coldSampleCount = options.coldSampleCount ?? 4;
  const warmSampleCount = options.warmSampleCount ?? 6;

  const coldStartSamples: number[] = [];
  const coldLevelLoadSamples: number[] = [];
  const coldPrepareLevelSamples: number[] = [];
  const coldInitialProjectionSamples: number[] = [];

  for (let index = 0; index < coldSampleCount; index += 1) {
    const levels = createLevels();
    const engine = createInteractiveEngine(levels, scenario.request);
    const measurement = await measureStartSession(engine, scenario.request);
    coldStartSamples.push(measurement.startMs);
    coldLevelLoadSamples.push(measurement.levelLoadMs);
    coldPrepareLevelSamples.push(measurement.prepareLevelMs);
    coldInitialProjectionSamples.push(measurement.initialProjectionMs);
  }

  const warmLevels = createLevels();
  const warmEngine = createInteractiveEngine(warmLevels, scenario.request);
  await measureStartSession(warmEngine, scenario.request);

  const warmStartSamples: number[] = [];
  const warmLevelLoadSamples: number[] = [];
  const warmPrepareLevelSamples: number[] = [];
  const warmInitialProjectionSamples: number[] = [];

  for (let index = 0; index < warmSampleCount; index += 1) {
    const measurement = await measureStartSession(warmEngine, scenario.request);
    warmStartSamples.push(measurement.startMs);
    warmLevelLoadSamples.push(measurement.levelLoadMs);
    warmPrepareLevelSamples.push(measurement.prepareLevelMs);
    warmInitialProjectionSamples.push(measurement.initialProjectionMs);
  }

  return {
    coldInitialProjectionMs: summarize(coldInitialProjectionSamples),
    coldLevelLoadMs: summarize(coldLevelLoadSamples),
    coldPrepareLevelMs: summarize(coldPrepareLevelSamples),
    coldStartMs: summarize(coldStartSamples),
    family: scenario.family,
    label: scenario.label,
    notes: scenario.notes,
    request: scenario.request,
    scenarioId: scenario.id,
    warmInitialProjectionMs: summarize(warmInitialProjectionSamples),
    warmLevelLoadMs: summarize(warmLevelLoadSamples),
    warmPrepareLevelMs: summarize(warmPrepareLevelSamples),
    warmStartMs: summarize(warmStartSamples),
  };
}

export async function benchmarkInteractiveLoadPerfScenarios(
  scenarios: readonly InteractivePerfScenario[],
  options: {
    coldSampleCount?: number;
    createLevels?: () => LevelRepository;
    warmSampleCount?: number;
  } = {},
): Promise<InteractiveLoadPerfScenarioBenchmark[]> {
  const results: InteractiveLoadPerfScenarioBenchmark[] = [];
  for (const scenario of scenarios) {
    results.push(await benchmarkInteractiveLoadPerfScenario(scenario, options));
  }
  return results;
}
