import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { DebugGameEnginePort } from "@game-runtime/ports/DebugGameEngine";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { LevelRepository } from "@level-catalog/ports/LevelRepository";
import {
  createHistoricalReplayRestoreState,
  createLiveRestoreState,
  createPausedRestoreState,
  fromInteractiveHandle,
  toInteractiveHandle,
  type InteractiveSessionRuntimeState,
} from "@game-runtime/impl/interactiveHandle";
import { projectInteractiveGameSession } from "@game-runtime/impl/projectInteractiveGameSession";
import { projectInteractiveSessionHistory } from "@game-runtime/impl/projectInteractiveSessionHistory";
import { GAME_INPUT_CODES, resolveGameInputCode, type InteractiveInput } from "@game-core/api/command";
import { decodeMsLevelData, prepareMsLevel } from "@ruleset-ms/api/level";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  createMsReplaySession,
  runMsInputTrace,
  runMsInputTraceDebug,
  runMsReplayTrace,
  runMsReplayTraceDebug,
  runMsReplayTraceDebugWindow,
  type MsInteractiveSessionState,
} from "@ruleset-ms/impl/engine";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import {
  createMsUndoHistory,
  forkMsUndoHistory,
  recordMsUndoTick,
  restoreMsUndoHistoryToTick,
} from "@undo-runtime/impl/msHistory";
import type { MsUndoHistory } from "@undo-runtime/impl/msHistory";
import { latestUndoTick, nextUndoTickEvent } from "@undo-runtime/impl/history";

type MsInteractiveRuntime = InteractiveSessionRuntimeState<MsInteractiveSessionState, MsUndoHistory>;

function projectMsSession(
  session: Pick<InteractiveGameSession, "request" | "mode" | "hintText">,
  runtime: MsInteractiveRuntime,
  phase: "initial" | "tick",
): InteractiveGameSession {
  return projectInteractiveGameSession({
    request: session.request,
    mode: session.mode,
    hintText: session.hintText,
    frame: projectMsInteractiveFrame(runtime.token, phase),
    history: projectInteractiveSessionHistory(
      runtime.history,
      runtime.token.state.engine.timer.currentTime,
      runtime.restoreState,
    ),
    recordedMoves: runtime.token.recordedMoves,
    handle: toInteractiveHandle(runtime),
  });
}

function advanceLiveMsRuntime(
  runtime: MsInteractiveRuntime,
  inputCode: number,
  source: "manual" | "replay",
): MsInteractiveRuntime {
  const token = advanceMsInteractiveSession(runtime.token, inputCode);
  return {
    token,
    history: recordMsUndoTick(runtime.history, token, token.lastInput.inputCode, source),
    restoreState: createLiveRestoreState(),
  };
}

export class MsGameEngineAdapter implements GameEnginePort, DebugGameEnginePort, InteractiveGameEnginePort {
  constructor(private readonly levels: LevelRepository) {}

  supportsRuleset(ruleset: Parameters<NonNullable<GameEnginePort["supportsRuleset"]>>[0]): boolean {
    return ruleset === "MS";
  }

  async runInputTrace(
    request: Parameters<GameEnginePort["runInputTrace"]>[0],
    commands: Parameters<GameEnginePort["runInputTrace"]>[1],
    maxTicks: number,
  ) {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    return runMsInputTrace(loaded.request, level, commands, maxTicks);
  }

  async runReplayTrace(
    request: Parameters<GameEnginePort["runReplayTrace"]>[0],
    replay: Parameters<GameEnginePort["runReplayTrace"]>[1],
    maxTicks: number,
  ): ReturnType<GameEnginePort["runReplayTrace"]> {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    return runMsReplayTrace(loaded.request, level, replay, maxTicks);
  }

  async runInputTraceDebug(
    request: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[0],
    commands: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[1],
    maxTicks: number,
  ) {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    return runMsInputTraceDebug(loaded.request, level, commands, maxTicks);
  }

  async runReplayTraceDebug(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
  ) {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    return runMsReplayTraceDebug(loaded.request, level, replay, maxTicks);
  }

  async runReplayTraceDebugWindow(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
    windowStart: number,
    windowEndExclusive: number,
  ) {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    return runMsReplayTraceDebugWindow(loaded.request, level, replay, maxTicks, windowStart, windowEndExclusive);
  }

  async startSession(
    request: Parameters<InteractiveGameEnginePort["startSession"]>[0],
    options?: Parameters<InteractiveGameEnginePort["startSession"]>[1],
  ): Promise<InteractiveGameSession> {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    const token = createMsInteractiveSession(request, level);
    const runtime: MsInteractiveRuntime = {
      token,
      history: createMsUndoHistory(token, options?.undoSettings ?? 8),
      restoreState: createLiveRestoreState(),
    };

    return projectMsSession(
      {
        request,
        mode: "manual",
        hintText: level.hintText || null,
      },
      runtime,
      "initial",
    );
  }

  async startReplaySession(
    request: Parameters<InteractiveGameEnginePort["startReplaySession"]>[0],
    replay: ReplaySolutionPayload,
    options?: Parameters<InteractiveGameEnginePort["startReplaySession"]>[2],
  ): Promise<InteractiveGameSession> {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    const token = createMsReplaySession(request, level, replay);
    const runtime: MsInteractiveRuntime = {
      token,
      history: createMsUndoHistory(token, options?.undoSettings ?? 8),
      restoreState: createLiveRestoreState(),
    };

    return projectMsSession(
      {
        request,
        mode: "replay",
        hintText: level.hintText || null,
      },
      runtime,
      "initial",
    );
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: InteractiveInput,
  ): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle);
    const inputCode = resolveGameInputCode(input);
    const currentTick = runtime.token.state.engine.timer.currentTime;

    if (runtime.restoreState.mode === "restored-paused") {
      if (inputCode === GAME_INPUT_CODES.none) {
        return projectMsSession(session, runtime, "tick");
      }

      const futureTick = nextUndoTickEvent(runtime.history, currentTick);
      const branchedRuntime = futureTick ? {
        ...runtime,
        history: forkMsUndoHistory(runtime.history, runtime.token),
      } : runtime;
      return projectMsSession(session, advanceLiveMsRuntime(branchedRuntime, inputCode, "manual"), "tick");
    }

    if (runtime.restoreState.mode === "replaying-history") {
      if (inputCode !== GAME_INPUT_CODES.none) {
        const branchedRuntime = {
          ...runtime,
          history: forkMsUndoHistory(runtime.history, runtime.token),
        };
        return projectMsSession(session, advanceLiveMsRuntime(branchedRuntime, inputCode, "manual"), "tick");
      }

      const historicalEvent = nextUndoTickEvent(runtime.history, currentTick);
      if (!historicalEvent) {
        return projectMsSession(
          session,
          {
            ...runtime,
            restoreState: createLiveRestoreState(),
          },
          "tick",
        );
      }

      const token = advanceMsInteractiveSession(runtime.token, historicalEvent.inputCode);
      const replayTargetTick = runtime.restoreState.replayTargetTick ?? latestUndoTick(runtime.history);
      const hasMoreHistoricalTicks = nextUndoTickEvent(runtime.history, token.state.engine.timer.currentTime) !== null;
      return projectMsSession(
        session,
        {
          token,
          history: runtime.history,
          restoreState: hasMoreHistoricalTicks
            ? createHistoricalReplayRestoreState(runtime.restoreState.restoredFromTick ?? currentTick, replayTargetTick)
            : createLiveRestoreState(),
        },
        "tick",
      );
    }

    return projectMsSession(
      session,
      advanceLiveMsRuntime(runtime, inputCode, session.mode === "replay" ? "replay" : "manual"),
      "tick",
    );
  }

  async restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle);
    const restored = restoreMsUndoHistoryToTick(runtime.history, targetTick);

    return projectMsSession(
      session,
      {
        token: restored.session,
        history: runtime.history,
        restoreState: createPausedRestoreState(targetTick),
      },
      "tick",
    );
  }

  async resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle);
    const replayTargetTick = latestUndoTick(runtime.history);
    if (replayTargetTick <= runtime.token.state.engine.timer.currentTime) {
      return projectMsSession(
        session,
        {
          ...runtime,
          restoreState: createLiveRestoreState(),
        },
        "tick",
      );
    }

    return projectMsSession(
      session,
      {
        ...runtime,
        restoreState: createHistoricalReplayRestoreState(
          runtime.token.state.engine.timer.currentTime,
          replayTargetTick,
        ),
      },
      "tick",
    );
  }
}
