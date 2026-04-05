import { GAME_INPUT_CODES, resolveGameInputCode, type InteractiveInput } from "@game-core/api/command";
import type { InteractiveGameFrame } from "@game-core/api/interactive";
import type { GameRequest } from "@game-core/api/types";
import {
  createHistoricalReplayRestoreState,
  createLiveRestoreState,
  createPausedRestoreState,
  toInteractiveHandle,
  type InteractiveSessionRuntimeState,
} from "@game-runtime/impl/interactiveHandle";
import { projectInteractiveGameSession } from "@game-runtime/impl/projectInteractiveGameSession";
import {
  advanceInteractiveSessionHistorySummary,
  checkpointTicksForInteractiveSessionHistory,
  projectInteractiveSessionHistory,
  summarizeInteractiveSessionHistory,
  type InteractiveSessionHistorySummary,
} from "@game-runtime/impl/projectInteractiveSessionHistory";
import type {
  InteractiveGameSession,
  InteractiveGameSessionRunState,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { LoadedLevelData, LevelRepository } from "@level-catalog/ports/LevelRepository";
import type { UndoHistory, UndoSettingsSnapshot, UndoTickEvent } from "@undo-runtime/api/history";
import { nextUndoTickEvent } from "@undo-runtime/impl/history";

export interface InteractiveAdapterRuntime<TToken, TLevel, THistory extends UndoHistory<TToken>>
  extends InteractiveSessionRuntimeState<TToken, THistory> {
  token: TToken;
  level: TLevel;
  undoUsedCount: number;
  historySummary: InteractiveSessionHistorySummary;
}

export interface InteractiveAdapterHistoryConfig<TToken, TLevel, THistory extends UndoHistory<TToken>> {
  advanceToken: (token: TToken, inputCode: number) => TToken;
  forkUndoHistory: (history: THistory, token: TToken) => THistory;
  getCurrentTick: (token: TToken) => number;
  projectSession: (
    session: Pick<InteractiveGameSession, "request" | "mode">,
    runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>,
    phase: "initial" | "tick",
  ) => InteractiveGameSession;
  recordUndoTick: (
    history: THistory,
    token: TToken,
    inputCode: number,
    source: UndoTickEvent["source"],
  ) => THistory;
  restoreUndoHistoryToTick: (history: THistory, targetTick: number) => { session: TToken };
}

export interface InteractiveAdapterProjectionConfig<TToken, TLevel, THistory extends UndoHistory<TToken>> {
  getCurrentTick: (token: TToken) => number;
  projectFrame: (token: TToken, phase: "initial" | "tick") => InteractiveGameFrame;
  projectHintText: (runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>) => string | null;
  projectRunState: (
    request: InteractiveGameSession["request"],
    runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>,
    frame: InteractiveGameFrame,
  ) => InteractiveGameSessionRunState;
}

export interface InteractiveAdapterProjectionOptions {
  includeHistoryDetails?: boolean;
}

export function assertAdapterRuleset(
  request: Pick<GameRequest, "ruleset">,
  expectedRuleset: GameRequest["ruleset"],
  label: string,
): void {
  if (request.ruleset !== expectedRuleset) {
    throw new Error(`${label} does not support ruleset ${request.ruleset}`);
  }
}

export async function withPreparedInteractiveLevel<TLevel, TResult>(
  levels: LevelRepository,
  request: GameRequest,
  expectedRuleset: GameRequest["ruleset"],
  label: string,
  prepareLevel: (loaded: LoadedLevelData) => TLevel,
  run: (loaded: LoadedLevelData, level: TLevel) => TResult | Promise<TResult>,
): Promise<TResult> {
  assertAdapterRuleset(request, expectedRuleset, label);
  const loaded = await levels.loadLevel(request);
  const level = prepareLevel(loaded);
  return run(loaded, level);
}

export function createInteractiveAdapterRuntime<TToken, TLevel, THistory extends UndoHistory<TToken>>(
  token: TToken,
  level: TLevel,
  createUndoHistory: (
    token: TToken,
    settings: number | Partial<UndoSettingsSnapshot>,
  ) => THistory,
  undoSettings?: Partial<UndoSettingsSnapshot>,
): InteractiveAdapterRuntime<TToken, TLevel, THistory> {
  const history = createUndoHistory(token, undoSettings ?? 8);
  return {
    token,
    level,
    undoUsedCount: 0,
    history,
    historySummary: summarizeInteractiveSessionHistory(history, history.initialCheckpoint.tick),
    restoreState: createLiveRestoreState(),
  };
}

export function projectInteractiveAdapterSession<TToken, TLevel, THistory extends UndoHistory<TToken>>(
  session: Pick<InteractiveGameSession, "request" | "mode">,
  runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>,
  phase: "initial" | "tick",
  config: InteractiveAdapterProjectionConfig<TToken, TLevel, THistory>,
  options: InteractiveAdapterProjectionOptions = {},
): InteractiveGameSession {
  const frame = config.projectFrame(runtime.token, phase);
  const includeHistoryDetails = options.includeHistoryDetails ?? phase === "initial";
  return projectInteractiveGameSession({
    request: session.request,
    mode: session.mode,
    hintText: config.projectHintText(runtime),
    frame,
    history: projectInteractiveSessionHistory(
      runtime.historySummary,
      runtime.restoreState,
      includeHistoryDetails ? checkpointTicksForInteractiveSessionHistory(runtime.history) : undefined,
    ),
    run: config.projectRunState(session.request, runtime, frame),
    recordedMoves: (runtime.token as { recordedMoves?: InteractiveGameSession["recordedMoves"] }).recordedMoves ?? [],
    handle: toInteractiveHandle(runtime),
  });
}

function advanceInteractiveLiveRuntime<TToken, TLevel, THistory extends UndoHistory<TToken>>(
  runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>,
  inputCode: number,
  source: UndoTickEvent["source"],
  config: Pick<
    InteractiveAdapterHistoryConfig<TToken, TLevel, THistory>,
    "advanceToken" | "getCurrentTick" | "recordUndoTick"
  >,
): InteractiveAdapterRuntime<TToken, TLevel, THistory> {
  const token = config.advanceToken(runtime.token, inputCode);
  const history = config.recordUndoTick(runtime.history, token, inputCode, source);
  const currentTick = config.getCurrentTick(token);
  return {
    token,
    level: runtime.level,
    undoUsedCount: runtime.undoUsedCount,
    history,
    historySummary: advanceInteractiveSessionHistorySummary(runtime.historySummary, history, currentTick),
    restoreState: createLiveRestoreState(),
  };
}

export function advanceInteractiveSessionWithHistory<TToken, TLevel, THistory extends UndoHistory<TToken>>(
  session: InteractiveGameSession,
  runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>,
  input: InteractiveInput,
  config: InteractiveAdapterHistoryConfig<TToken, TLevel, THistory>,
): InteractiveGameSession {
  const inputCode = resolveGameInputCode(input);
  const currentTick = config.getCurrentTick(runtime.token);

  if (runtime.restoreState.mode === "restored-paused") {
    if (inputCode === GAME_INPUT_CODES.none) {
      return config.projectSession(session, runtime, "tick");
    }

    const futureTick = nextUndoTickEvent(runtime.history, currentTick);
    const branchedHistory = futureTick ? config.forkUndoHistory(runtime.history, runtime.token) : null;
    const branchedRuntime = branchedHistory
      ? {
          ...runtime,
          history: branchedHistory,
          historySummary: summarizeInteractiveSessionHistory(branchedHistory, currentTick),
        }
      : runtime;
    return config.projectSession(
      session,
      advanceInteractiveLiveRuntime(branchedRuntime, inputCode, "manual", config),
      "tick",
    );
  }

  if (runtime.restoreState.mode === "replaying-history") {
    if (inputCode !== GAME_INPUT_CODES.none) {
      const branchedHistory = config.forkUndoHistory(runtime.history, runtime.token);
      const branchedRuntime = {
        ...runtime,
        history: branchedHistory,
        historySummary: summarizeInteractiveSessionHistory(branchedHistory, currentTick),
      };
      return config.projectSession(
        session,
        advanceInteractiveLiveRuntime(branchedRuntime, inputCode, "manual", config),
        "tick",
      );
    }

    const historicalEvent = nextUndoTickEvent(runtime.history, currentTick);
    if (!historicalEvent) {
      return config.projectSession(
        session,
        {
          ...runtime,
          restoreState: createLiveRestoreState(),
        },
        "tick",
      );
    }

    const token = config.advanceToken(runtime.token, historicalEvent.inputCode);
    const nextTick = config.getCurrentTick(token);
    const replayTargetTick = runtime.restoreState.replayTargetTick ?? runtime.historySummary.latestTick;
    const hasMoreHistoricalTicks = nextUndoTickEvent(runtime.history, nextTick) !== null;
    return config.projectSession(
      session,
      {
        token,
        level: runtime.level,
        undoUsedCount: runtime.undoUsedCount,
        history: runtime.history,
        historySummary: advanceInteractiveSessionHistorySummary(runtime.historySummary, runtime.history, nextTick, {
          latestTick: runtime.historySummary.latestTick,
        }),
        restoreState: hasMoreHistoricalTicks
          ? createHistoricalReplayRestoreState(runtime.restoreState.restoredFromTick ?? currentTick, replayTargetTick)
          : createLiveRestoreState(),
      },
      "tick",
    );
  }

  return config.projectSession(
    session,
    advanceInteractiveLiveRuntime(runtime, inputCode, session.mode === "replay" ? "replay" : "manual", config),
    "tick",
  );
}

export function restoreInteractiveSessionToTick<TToken, TLevel, THistory extends UndoHistory<TToken>>(
  session: InteractiveGameSession,
  runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>,
  targetTick: number,
  config: Pick<
    InteractiveAdapterHistoryConfig<TToken, TLevel, THistory>,
    "getCurrentTick" | "projectSession" | "restoreUndoHistoryToTick"
  >,
): InteractiveGameSession {
  const restored = config.restoreUndoHistoryToTick(runtime.history, targetTick);
  const currentTick = config.getCurrentTick(runtime.token);
  const undoUsedCount =
    targetTick <= session.history.initialTick
      ? 0
      : targetTick < currentTick
        ? runtime.undoUsedCount + 1
        : runtime.undoUsedCount;

  return config.projectSession(
    session,
    {
      token: restored.session,
      level: runtime.level,
      undoUsedCount,
      history: runtime.history,
      historySummary: summarizeInteractiveSessionHistory(runtime.history, targetTick),
      restoreState: createPausedRestoreState(targetTick),
    },
    "tick",
  );
}

export function resumeInteractiveSessionFromHistory<TToken, TLevel, THistory extends UndoHistory<TToken>>(
  session: InteractiveGameSession,
  runtime: InteractiveAdapterRuntime<TToken, TLevel, THistory>,
  config: Pick<
    InteractiveAdapterHistoryConfig<TToken, TLevel, THistory>,
    "getCurrentTick" | "projectSession"
  >,
): InteractiveGameSession {
  const replayTargetTick = runtime.historySummary.latestTick;
  if (replayTargetTick <= config.getCurrentTick(runtime.token)) {
    return config.projectSession(
      session,
      {
        ...runtime,
        restoreState: createLiveRestoreState(),
      },
      "tick",
    );
  }

  return config.projectSession(
    session,
    {
      ...runtime,
      restoreState: createHistoricalReplayRestoreState(
        config.getCurrentTick(runtime.token),
        replayTargetTick,
      ),
    },
    "tick",
  );
}
