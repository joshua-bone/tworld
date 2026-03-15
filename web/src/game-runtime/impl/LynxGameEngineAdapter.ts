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
import { prepareLynxLevel } from "@ruleset-lynx/api/level";
import { decodeMsLevelGroupData, levelHintTextAtZ } from "@ruleset-ms/api/level";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  createLynxReplaySession,
  runLynxInputTrace,
  runLynxInputTraceDebug,
  runLynxReplayTrace,
  runLynxReplayTraceDebug,
  runLynxReplayTraceDebugWindow,
  type LynxInteractiveSessionState,
} from "@ruleset-lynx/impl/engine";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import {
  createLynxUndoHistory,
  forkLynxUndoHistory,
  recordLynxUndoTick,
  restoreLynxUndoHistoryToTick,
} from "@undo-runtime/impl/lynxHistory";
import type { LynxUndoHistory } from "@undo-runtime/impl/lynxHistory";
import { latestUndoTick, nextUndoTickEvent } from "@undo-runtime/impl/history";

type LynxInteractiveRuntime = InteractiveSessionRuntimeState<LynxInteractiveSessionState, LynxUndoHistory> & {
  level: ReturnType<typeof prepareLynxLevel>;
};

function projectLynxSession(
  session: Pick<InteractiveGameSession, "request" | "mode">,
  runtime: LynxInteractiveRuntime,
  phase: "initial" | "tick",
): InteractiveGameSession {
  return projectInteractiveGameSession({
    request: session.request,
    mode: session.mode,
    hintText: levelHintTextAtZ(runtime.level, runtime.token.chipZ) || null,
    frame: projectLynxInteractiveFrame(runtime.token, phase),
    history: projectInteractiveSessionHistory(
      runtime.history,
      runtime.token.state.timer.currentTime,
      runtime.restoreState,
    ),
    recordedMoves: runtime.token.recordedMoves,
    handle: toInteractiveHandle(runtime),
  });
}

function advanceLiveLynxRuntime(
  runtime: LynxInteractiveRuntime,
  inputCode: number,
  source: "manual" | "replay",
): LynxInteractiveRuntime {
  const token = advanceLynxInteractiveSession(runtime.token, inputCode);
  return {
    token,
    level: runtime.level,
    history: recordLynxUndoTick(runtime.history, token, token.lastInput.inputCode, source),
    restoreState: createLiveRestoreState(),
  };
}

export class LynxGameEngineAdapter implements GameEnginePort, DebugGameEnginePort, InteractiveGameEnginePort {
  constructor(private readonly levels: LevelRepository) {}

  supportsRuleset(ruleset: Parameters<NonNullable<GameEnginePort["supportsRuleset"]>>[0]): boolean {
    return ruleset === "Lynx";
  }

  async runInputTrace(
    request: Parameters<GameEnginePort["runInputTrace"]>[0],
    commands: Parameters<GameEnginePort["runInputTrace"]>[1],
    maxTicks: number,
  ) {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData));
    return runLynxInputTrace(loaded.request, level, commands, maxTicks);
  }

  async runReplayTrace(
    request: Parameters<GameEnginePort["runReplayTrace"]>[0],
    replay: Parameters<GameEnginePort["runReplayTrace"]>[1],
    maxTicks: number,
  ) {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData));
    return runLynxReplayTrace(loaded.request, level, replay, maxTicks);
  }

  async runInputTraceDebug(
    request: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[0],
    commands: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[1],
    maxTicks: number,
  ) {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData));
    return runLynxInputTraceDebug(loaded.request, level, commands, maxTicks);
  }

  async runReplayTraceDebug(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
  ) {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData));
    return runLynxReplayTraceDebug(loaded.request, level, replay, maxTicks);
  }

  async runReplayTraceDebugWindow(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
    windowStart: number,
    windowEndExclusive: number,
  ) {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData));
    return runLynxReplayTraceDebugWindow(loaded.request, level, replay, maxTicks, windowStart, windowEndExclusive);
  }

  async startSession(
    request: Parameters<InteractiveGameEnginePort["startSession"]>[0],
    options?: Parameters<InteractiveGameEnginePort["startSession"]>[1],
  ): Promise<InteractiveGameSession> {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData));
    const token = createLynxInteractiveSession(request, level);
    const runtime: LynxInteractiveRuntime = {
      token,
      level,
      history: createLynxUndoHistory(token, options?.undoSettings ?? 8),
      restoreState: createLiveRestoreState(),
    };

    return projectLynxSession(
      {
        request,
        mode: "manual",
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
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData));
    const token = createLynxReplaySession(request, level, replay);
    const runtime: LynxInteractiveRuntime = {
      token,
      level,
      history: createLynxUndoHistory(token, options?.undoSettings ?? 8),
      restoreState: createLiveRestoreState(),
    };

    return projectLynxSession(
      {
        request,
        mode: "replay",
      },
      runtime,
      "initial",
    );
  }

  async advanceSession(session: InteractiveGameSession, input: InteractiveInput): Promise<InteractiveGameSession> {
    const request = session.request;
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const runtime = fromInteractiveHandle<LynxInteractiveSessionState, LynxUndoHistory>(session.handle) as LynxInteractiveRuntime;
    const inputCode = resolveGameInputCode(input);
    const currentTick = runtime.token.state.timer.currentTime;

    if (runtime.restoreState.mode === "restored-paused") {
      if (inputCode === GAME_INPUT_CODES.none) {
        return projectLynxSession(session, runtime, "tick");
      }

      const futureTick = nextUndoTickEvent(runtime.history, currentTick);
      const branchedRuntime = futureTick ? {
        ...runtime,
        history: forkLynxUndoHistory(runtime.history, runtime.token),
      } : runtime;
      return projectLynxSession(session, advanceLiveLynxRuntime(branchedRuntime, inputCode, "manual"), "tick");
    }

    if (runtime.restoreState.mode === "replaying-history") {
      if (inputCode !== GAME_INPUT_CODES.none) {
        const branchedRuntime = {
          ...runtime,
          history: forkLynxUndoHistory(runtime.history, runtime.token),
        };
        return projectLynxSession(session, advanceLiveLynxRuntime(branchedRuntime, inputCode, "manual"), "tick");
      }

      const historicalEvent = nextUndoTickEvent(runtime.history, currentTick);
      if (!historicalEvent) {
        return projectLynxSession(
          session,
          {
            ...runtime,
            restoreState: createLiveRestoreState(),
          },
          "tick",
        );
      }

      const token = advanceLynxInteractiveSession(runtime.token, historicalEvent.inputCode);
      const replayTargetTick = runtime.restoreState.replayTargetTick ?? latestUndoTick(runtime.history);
      const hasMoreHistoricalTicks = nextUndoTickEvent(runtime.history, token.state.timer.currentTime) !== null;
      return projectLynxSession(
        session,
        {
          token,
          level: runtime.level,
          history: runtime.history,
          restoreState: hasMoreHistoricalTicks
            ? createHistoricalReplayRestoreState(runtime.restoreState.restoredFromTick ?? currentTick, replayTargetTick)
            : createLiveRestoreState(),
        },
        "tick",
      );
    }

    return projectLynxSession(
      session,
      advanceLiveLynxRuntime(runtime, inputCode, session.mode === "replay" ? "replay" : "manual"),
      "tick",
    );
  }

  async restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<LynxInteractiveSessionState, LynxUndoHistory>(session.handle) as LynxInteractiveRuntime;
    const restored = restoreLynxUndoHistoryToTick(runtime.history, targetTick);

    return projectLynxSession(
      session,
      {
        token: restored.session,
        level: runtime.level,
        history: runtime.history,
        restoreState: createPausedRestoreState(targetTick),
      },
      "tick",
    );
  }

  async resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<LynxInteractiveSessionState, LynxUndoHistory>(session.handle) as LynxInteractiveRuntime;
    const replayTargetTick = latestUndoTick(runtime.history);
    if (replayTargetTick <= runtime.token.state.timer.currentTime) {
      return projectLynxSession(
        session,
        {
          ...runtime,
          restoreState: createLiveRestoreState(),
        },
        "tick",
      );
    }

    return projectLynxSession(
      session,
      {
        ...runtime,
        restoreState: createHistoricalReplayRestoreState(
          runtime.token.state.timer.currentTime,
          replayTargetTick,
        ),
      },
      "tick",
    );
  }
}
