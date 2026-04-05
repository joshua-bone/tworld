import { resolveGameInputCode } from "@game-core/api/command";
import type { GameRequest } from "@game-core/api/types";
import { estimateSerializablePayloadBytes } from "@game-runtime/impl/estimateSerializablePayloadBytes";
import { toWorkerInteractiveGameSessionUpdate } from "@game-runtime/impl/interactiveGame.worker.protocol";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import type { InteractiveGameEnginePort, InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  type LynxInteractiveSessionState,
} from "@ruleset-lynx/impl/engine";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  type MsInteractiveSessionState,
} from "@ruleset-ms/impl/engine";
import type { LevelRepository } from "@level-catalog/ports/LevelRepository";
import { withPreparedInteractiveLevel } from "@game-runtime/impl/interactiveAdapterSkeleton";
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

export interface InteractivePerfScenarioBenchmark {
  cloneMs: NumberSummary;
  endedEarly: boolean;
  family: InteractivePerfScenario["family"];
  interactiveTickMs: NumberSummary;
  label: string;
  measuredTicks: number;
  notes: string;
  payloadBytes: NumberSummary;
  rawTickMs: NumberSummary;
  request: GameRequest;
  scenarioId: string;
  start: {
    currentZ: number;
    historyEnabled: boolean;
    historyCheckpointCount: number;
    tileOverlayCount: number;
    visibleLayerCount: number;
  };
  steadyStateHz: number;
  workerUpdateMs: NumberSummary;
}

type RawPerfSession =
  | {
      ruleset: "MS";
      token: MsInteractiveSessionState;
    }
  | {
      ruleset: "Lynx";
      token: LynxInteractiveSessionState;
    };

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

async function createRawPerfSession(levels: LevelRepository, request: GameRequest): Promise<RawPerfSession> {
  if (request.ruleset === "MS") {
    return withPreparedInteractiveLevel(
      levels,
      request,
      "MS",
      "MS raw perf harness",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (_loaded, level) => ({
        ruleset: "MS" as const,
        token: createMsInteractiveSession(request, level),
      }),
    );
  }

  return withPreparedInteractiveLevel(
    levels,
    request,
    "Lynx",
    "Lynx raw perf harness",
    lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
    (_loaded, level) => ({
      ruleset: "Lynx" as const,
      token: createLynxInteractiveSession(request, level),
    }),
  );
}

function advanceRawPerfSession(session: RawPerfSession, inputCode: number): RawPerfSession {
  if (session.ruleset === "MS") {
    return {
      ruleset: "MS",
      token: advanceMsInteractiveSession(session.token, inputCode),
    };
  }

  return {
    ruleset: "Lynx",
    token: advanceLynxInteractiveSession(session.token, inputCode),
  };
}

function createInteractiveEngine(levels: LevelRepository, request: GameRequest): InteractiveGameEnginePort {
  return request.ruleset === "MS" ? new MsGameEngineAdapter(levels) : new LynxGameEngineAdapter(levels);
}

async function advanceInteractiveMany(
  session: InteractiveGameSession,
  engine: InteractiveGameEnginePort,
  inputs: readonly number[],
): Promise<InteractiveGameSession> {
  let current = session;
  for (const input of inputs) {
    current = await engine.advanceSession(current, input);
    if (current.run.result) {
      break;
    }
  }
  return current;
}

export async function benchmarkInteractivePerfScenario(
  scenario: InteractivePerfScenario,
  options: { levels?: LevelRepository; undoEnabled?: boolean } = {},
): Promise<InteractivePerfScenarioBenchmark> {
  const levels = options.levels ?? new NodeLevelRepository();
  const engine = createInteractiveEngine(levels, scenario.request);
  const disableUndo = options.undoEnabled === false;
  const startOptions = disableUndo
    ? {
        undoSettings: {
          enabled: false,
        },
      }
    : undefined;

  let rawSession = await createRawPerfSession(levels, scenario.request);
  let interactiveSession = await engine.startSession(scenario.request, startOptions);
  const startedSession = interactiveSession;
  const warmupInputs = Array.from({ length: scenario.warmupTickCount }, (_, index) =>
    resolveGameInputCode(scenario.inputPattern[index % scenario.inputPattern.length] ?? "none"),
  );
  rawSession = warmupInputs.reduce((current, inputCode) => advanceRawPerfSession(current, inputCode), rawSession);
  interactiveSession = await advanceInteractiveMany(interactiveSession, engine, warmupInputs);

  const rawTickSamples: number[] = [];
  const interactiveTickSamples: number[] = [];
  const workerUpdateSamples: number[] = [];
  const cloneSamples: number[] = [];
  const payloadSamples: number[] = [];

  let endedEarly = false;
  for (let index = 0; index < scenario.measuredTickCount; index += 1) {
    const inputCode = resolveGameInputCode(scenario.inputPattern[index % scenario.inputPattern.length] ?? "none");

    const rawStartAt = performance.now();
    rawSession = advanceRawPerfSession(rawSession, inputCode);
    rawTickSamples.push(performance.now() - rawStartAt);

    const interactiveStartAt = performance.now();
    const nextInteractiveSession = await engine.advanceSession(interactiveSession, inputCode);
    interactiveTickSamples.push(performance.now() - interactiveStartAt);

    const workerUpdateStartAt = performance.now();
    const sessionUpdate = toWorkerInteractiveGameSessionUpdate(interactiveSession, nextInteractiveSession);
    workerUpdateSamples.push(performance.now() - workerUpdateStartAt);

    const cloneStartAt = performance.now();
    structuredClone(sessionUpdate);
    cloneSamples.push(performance.now() - cloneStartAt);
    payloadSamples.push(estimateSerializablePayloadBytes(sessionUpdate));

    interactiveSession = nextInteractiveSession;
    if (interactiveSession.run.result) {
      endedEarly = true;
      break;
    }
  }

  const rawTickMs = summarize(rawTickSamples);
  const interactiveTickMs = summarize(interactiveTickSamples);
  const cloneMs = summarize(cloneSamples);
  const workerUpdateMs = summarize(workerUpdateSamples);
  const payloadBytes = summarize(payloadSamples);
  const measuredTicks = interactiveTickMs.count;
  const steadyStateHz =
    interactiveTickMs.total + cloneMs.total > 0 ? (measuredTicks * 1000) / (interactiveTickMs.total + cloneMs.total) : 0;

  return {
    cloneMs,
    endedEarly,
    family: scenario.family,
    interactiveTickMs,
    label: scenario.label,
    measuredTicks,
    notes: scenario.notes,
    payloadBytes,
    rawTickMs,
    request: scenario.request,
    scenarioId: scenario.id,
    start: {
      currentZ: startedSession.frame.currentZ,
      historyCheckpointCount:
        startedSession.history.checkpointCount ?? startedSession.history.checkpointTicks?.length ?? 0,
      historyEnabled: startedSession.history.enabled,
      tileOverlayCount: startedSession.frame.tileOverlays.length,
      visibleLayerCount: startedSession.frame.visibleLayers.length,
    },
    steadyStateHz,
    workerUpdateMs,
  };
}

export async function benchmarkInteractivePerfScenarios(
  scenarios: readonly InteractivePerfScenario[],
  options: { levels?: LevelRepository; undoEnabled?: boolean } = {},
): Promise<InteractivePerfScenarioBenchmark[]> {
  const levels = options.levels ?? new NodeLevelRepository();
  const results: InteractivePerfScenarioBenchmark[] = [];
  for (const scenario of scenarios) {
    results.push(
      await benchmarkInteractivePerfScenario(scenario, {
        levels,
        undoEnabled: options.undoEnabled,
      }),
    );
  }
  return results;
}
