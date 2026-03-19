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
import { decodeMsLevelGroupData, levelHintTextAtZ, prepareMsLevel } from "@ruleset-ms/api/level";
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
import { MS_TILE } from "@ruleset-ms/api/tiles";

type MsInteractiveRuntime = InteractiveSessionRuntimeState<MsInteractiveSessionState, MsUndoHistory> & {
  level: ReturnType<typeof prepareMsLevel>;
  undoUsedCount: number;
};

function findMsCollisionCause(state: MsInteractiveSessionState["state"]): InteractiveGameSessionEndCause {
  const chipPos = boardPositionToGridPosition(state.internal.chipPos, state.internal.chipZ ?? 1);
  const chipZ = state.internal.chipZ ?? 1;
  const creature = state.internal.creatures.find(
    (entry) => !entry.hidden && entry.pos === state.internal.chipPos && (entry.z ?? 1) === chipZ,
  );
  if (creature) {
    const actorName = describeMsActorName(creature.id) ?? "monster";
    return buildInteractiveFailureCause({
      actorId: creature.id,
      actorName,
      kind: "monster",
      message: `Killed by ${actorName} at (${chipPos.x}, ${chipPos.y})`,
      position: chipPos,
    });
  }

  const block = state.internal.blocks.find(
    (entry) => !entry.hidden && entry.pos === state.internal.chipPos && (entry.z ?? 1) === chipZ,
  );
  if (block) {
    return buildInteractiveFailureCause({
      actorId: MS_TILE.Block,
      actorName: "block",
      kind: "other",
      message: `Crushed by block at (${chipPos.x}, ${chipPos.y})`,
      position: chipPos,
    });
  }

  return buildInteractiveFailureCause({
    kind: "monster",
    message: `Killed by monster at (${chipPos.x}, ${chipPos.y})`,
    position: chipPos,
  });
}

function projectMsRunState(
  request: InteractiveGameSession["request"],
  runtime: MsInteractiveRuntime,
  frame: ReturnType<typeof projectMsInteractiveFrame>,
): InteractiveGameSessionRunState {
  const replayAvailable = runtime.token.recordedMoves.length > 0;
  const endPosition = boardPositionToGridPosition(
    runtime.token.state.internal.chipPos,
    runtime.token.state.internal.chipZ ?? 1,
  );

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
      switch (runtime.token.state.internal.chipStatus) {
        case "drowned":
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
        case "burned":
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
        case "bombed":
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
        case "outoftime":
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
        case "collided":
          return buildFailedRunState(
            runtime.undoUsedCount,
            findMsCollisionCause(runtime.token.state),
            endPosition,
            replayAvailable,
          );
        default:
          return buildFailedRunState(runtime.undoUsedCount, null, endPosition, replayAvailable);
      }
    default:
      return buildLiveRunState(runtime.undoUsedCount, replayAvailable);
  }
}

function projectMsSession(
  session: Pick<InteractiveGameSession, "request" | "mode">,
  runtime: MsInteractiveRuntime,
  phase: "initial" | "tick",
): InteractiveGameSession {
  const frame = projectMsInteractiveFrame(runtime.token, phase);
  return projectInteractiveGameSession({
    request: session.request,
    mode: session.mode,
    hintText: levelHintTextAtZ(runtime.level, runtime.token.state.internal.chipZ) || null,
    frame,
    history: projectInteractiveSessionHistory(
      runtime.history,
      runtime.token.state.engine.timer.currentTime,
      runtime.restoreState,
    ),
    run: projectMsRunState(session.request, runtime, frame),
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
    level: runtime.level,
    undoUsedCount: runtime.undoUsedCount,
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
    const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
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
    const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
    const token = createMsInteractiveSession(request, level);
    const runtime: MsInteractiveRuntime = {
      token,
      level,
      undoUsedCount: 0,
      history: createMsUndoHistory(token, options?.undoSettings ?? 8),
      restoreState: createLiveRestoreState(),
    };

    return projectMsSession(
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
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData, loaded.levelData));
    const token = createMsReplaySession(request, level, replay);
    const runtime: MsInteractiveRuntime = {
      token,
      level,
      undoUsedCount: 0,
      history: createMsUndoHistory(token, options?.undoSettings ?? 8),
      restoreState: createLiveRestoreState(),
    };

    return projectMsSession(
      {
        request,
        mode: "replay",
      },
      runtime,
      "initial",
    );
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: InteractiveInput,
  ): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle) as MsInteractiveRuntime;
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

    return projectMsSession(
      session,
      advanceLiveMsRuntime(runtime, inputCode, session.mode === "replay" ? "replay" : "manual"),
      "tick",
    );
  }

  async restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle) as MsInteractiveRuntime;
    const restored = restoreMsUndoHistoryToTick(runtime.history, targetTick);
    const currentTick = runtime.token.state.engine.timer.currentTime;
    const undoUsedCount =
      targetTick <= session.history.initialTick
        ? 0
        : targetTick < currentTick
          ? runtime.undoUsedCount + 1
          : runtime.undoUsedCount;

    return projectMsSession(
      session,
      {
        token: restored.session,
        level: runtime.level,
        undoUsedCount,
        history: runtime.history,
        restoreState: createPausedRestoreState(targetTick),
      },
      "tick",
    );
  }

  async resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle) as MsInteractiveRuntime;
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
