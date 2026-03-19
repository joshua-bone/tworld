import type { GameDebugPhaseSnapshot, GameDebugTrace, GameDebugTraceStep } from "@game-core/api/debug";
import type { GameCommand, GameRequest, GameSnapshot, GameTrace } from "@game-core/api/types";

interface TraceResultSeed {
  status?: string;
  finalTick?: number;
}

interface GameTraceConfig {
  request: GameRequest;
  scheduledInputs: readonly GameCommand[];
  initialState: GameSnapshot;
  steps: readonly GameSnapshot[];
  result?: TraceResultSeed;
}

interface GameDebugTraceConfig {
  request: GameRequest;
  debugSchemaVersion: number;
  scheduledInputs: readonly GameCommand[];
  initialState: GameSnapshot;
  initialDebugState: GameDebugPhaseSnapshot;
  steps: readonly GameDebugTraceStep[];
  result?: TraceResultSeed;
}

function cloneScheduledInputs(commands: readonly GameCommand[]): GameCommand[] {
  return commands.map((command) => ({ ...command }));
}

function buildTraceResult(
  initialState: GameSnapshot,
  steps: readonly Pick<GameSnapshot, "status" | "currentTime">[],
  result?: TraceResultSeed,
): GameTrace["result"] {
  const lastStep = steps[steps.length - 1];
  return {
    status: result?.status ?? lastStep?.status ?? initialState.status,
    finalTick: result?.finalTick ?? lastStep?.currentTime ?? initialState.currentTime,
    stepCount: steps.length,
  };
}

export function createGameTrace(config: GameTraceConfig): GameTrace {
  return {
    request: { ...config.request },
    scheduledInputs: cloneScheduledInputs(config.scheduledInputs),
    initialState: config.initialState,
    steps: [...config.steps],
    result: buildTraceResult(config.initialState, config.steps, config.result),
  };
}

export function createGameDebugTrace(config: GameDebugTraceConfig): GameDebugTrace {
  return {
    request: { ...config.request },
    debugSchemaVersion: config.debugSchemaVersion,
    scheduledInputs: cloneScheduledInputs(config.scheduledInputs),
    initialState: config.initialState,
    initialDebugState: config.initialDebugState,
    steps: [...config.steps],
    result: buildTraceResult(config.initialState, config.steps, config.result),
  };
}
