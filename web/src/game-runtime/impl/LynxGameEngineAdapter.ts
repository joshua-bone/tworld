import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { DebugGameEnginePort } from "@game-runtime/ports/DebugGameEngine";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
  InteractiveGameSessionEndCause,
  InteractiveGameSessionRunState,
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
import {
  boardPositionToGridPosition,
  buildCompletedRunState,
  buildFailedRunState,
  buildInteractiveFailureCause,
  buildLiveRunState,
  describeMsActorName,
  formatInteractiveTickSeconds,
} from "@game-runtime/impl/interactiveSessionRun";
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
import { MS_TILE } from "@ruleset-ms/api/tiles";

type LynxInteractiveRuntime = InteractiveSessionRuntimeState<LynxInteractiveSessionState, LynxUndoHistory> & {
  level: ReturnType<typeof prepareLynxLevel>;
  undoUsedCount: number;
};

function findLynxCollisionCause(runtime: LynxInteractiveRuntime): InteractiveGameSessionEndCause {
  const chipPos = boardPositionToGridPosition(runtime.token.chipPos, runtime.token.chipZ ?? 1);
  const chipZ = runtime.token.chipZ ?? 1;
  const actor = runtime.token.actors.find(
    (entry) => !entry.hidden && entry.pos === runtime.token.chipPos && (entry.z ?? 1) === chipZ,
  );

  if (actor) {
    const actorName = describeMsActorName(actor.id) ?? "monster";
    return buildInteractiveFailureCause({
      actorId: actor.id,
      actorName,
      kind: actor.id === MS_TILE.Block ? "other" : "monster",
      message:
        actor.id === MS_TILE.Block
          ? `Crushed by block at (${chipPos.x}, ${chipPos.y})`
          : `Killed by ${actorName} at (${chipPos.x}, ${chipPos.y})`,
      position: chipPos,
    });
  }

  return buildInteractiveFailureCause({
    kind: "monster",
    message: `Killed by monster at (${chipPos.x}, ${chipPos.y})`,
    position: chipPos,
  });
}

function projectLynxRunState(
  request: InteractiveGameSession["request"],
  runtime: LynxInteractiveRuntime,
  frame: ReturnType<typeof projectLynxInteractiveFrame>,
): InteractiveGameSessionRunState {
  const replayAvailable = runtime.token.recordedMoves.length > 0;
  const endPosition = boardPositionToGridPosition(runtime.token.chipPos, runtime.token.chipZ ?? 1);
  const floorId = runtime.token.state.map.cells[runtime.token.chipPos]?.top.id ?? MS_TILE.Empty;

  switch (frame.snapshot.status) {
    case "completed":
      return buildCompletedRunState(
        request.levelNumber,
        frame.snapshot.timelimit,
        frame.snapshot.currentTime,
        runtime.undoUsedCount,
        endPosition,
        replayAvailable,
      );
    case "failed":
      if (runtime.token.state.timer.timeLimit > 0 && runtime.token.state.timer.currentTime >= runtime.token.state.timer.timeLimit) {
        return buildFailedRunState(
          runtime.undoUsedCount,
          buildInteractiveFailureCause({
              kind: "timeout",
              message: `Ran out of time at ${formatInteractiveTickSeconds(frame.snapshot.tick)}s`,
              position: endPosition,
            }),
          endPosition,
          replayAvailable,
        );
      }
      if (runtime.token.endGameAnimationTileId === 0x74 || floorId === MS_TILE.Water) {
        return buildFailedRunState(
          runtime.undoUsedCount,
          buildInteractiveFailureCause({
            kind: "water",
            message: `Drowned at (${endPosition.x}, ${endPosition.y})`,
            position: endPosition,
            tileId: MS_TILE.Water,
          }),
          endPosition,
          replayAvailable,
        );
      }
      if (runtime.token.endGameAnimationTileId === 0x75) {
        return buildFailedRunState(
          runtime.undoUsedCount,
          buildInteractiveFailureCause({
            kind: "bomb",
            message: `Hit a bomb at (${endPosition.x}, ${endPosition.y})`,
            position: endPosition,
            tileId: MS_TILE.Bomb,
          }),
          endPosition,
          replayAvailable,
        );
      }
      if (floorId === MS_TILE.Fire) {
        return buildFailedRunState(
          runtime.undoUsedCount,
          buildInteractiveFailureCause({
            kind: "fire",
            message: `Stepped in fire at (${endPosition.x}, ${endPosition.y})`,
            position: endPosition,
            tileId: MS_TILE.Fire,
          }),
          endPosition,
          replayAvailable,
        );
      }

      return buildFailedRunState(runtime.undoUsedCount, findLynxCollisionCause(runtime), endPosition, replayAvailable);
    default:
      return buildLiveRunState(runtime.undoUsedCount, replayAvailable);
  }
}

function projectLynxSession(
  session: Pick<InteractiveGameSession, "request" | "mode">,
  runtime: LynxInteractiveRuntime,
  phase: "initial" | "tick",
): InteractiveGameSession {
  const frame = projectLynxInteractiveFrame(runtime.token, phase);
  return projectInteractiveGameSession({
    request: session.request,
    mode: session.mode,
    hintText: levelHintTextAtZ(runtime.level, runtime.token.chipZ) || null,
    frame,
    history: projectInteractiveSessionHistory(
      runtime.history,
      runtime.token.state.timer.currentTime,
      runtime.restoreState,
    ),
    run: projectLynxRunState(session.request, runtime, frame),
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
    undoUsedCount: runtime.undoUsedCount,
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
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
    const token = createLynxInteractiveSession(request, level);
    const runtime: LynxInteractiveRuntime = {
      token,
      level,
      undoUsedCount: 0,
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
    const level = prepareLynxLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
    const token = createLynxReplaySession(request, level, replay);
    const runtime: LynxInteractiveRuntime = {
      token,
      level,
      undoUsedCount: 0,
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
          undoUsedCount: runtime.undoUsedCount,
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
    const currentTick = runtime.token.state.timer.currentTime;

    return projectLynxSession(
      session,
      {
        token: restored.session,
        level: runtime.level,
        undoUsedCount: targetTick < currentTick ? runtime.undoUsedCount + 1 : runtime.undoUsedCount,
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
