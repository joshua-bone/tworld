import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { DebugGameEnginePort } from "@game-runtime/ports/DebugGameEngine";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
  InteractiveGameSessionEndCause,
  InteractiveGameSessionHydrationOptions,
  InteractiveGameSessionRunState,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { LevelRepository } from "@level-catalog/ports/LevelRepository";
import {
  fromInteractiveHandle,
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
import type { InteractiveInput } from "@game-core/api/command";
import { levelHintTextAtZ, type MsLevel } from "@ruleset-ms/api/level";
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
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import {
  createMsUndoHistory,
  forkMsUndoHistory,
  recordMsUndoTick,
  restoreMsUndoHistoryToTick,
} from "@undo-runtime/impl/msHistory";
import type { MsUndoHistory } from "@undo-runtime/impl/msHistory";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  advanceInteractiveSessionWithHistory,
  assertAdapterRuleset,
  createInteractiveAdapterRuntime,
  projectInitialInteractiveAdapterSessionProfiled,
  projectInteractiveAdapterSession,
  restoreInteractiveSessionToTick,
  resumeInteractiveSessionFromHistory,
  withPreparedInteractiveLevel,
  withPreparedInteractiveLevelProfiled,
  type InteractiveAdapterHistoryConfig,
  type InteractiveAdapterProjectionConfig,
  type InteractiveAdapterProjectionOptions,
  type InteractiveAdapterRuntime,
} from "@game-runtime/impl/interactiveAdapterSkeleton";

type MsInteractiveRuntime = InteractiveAdapterRuntime<
  MsInteractiveSessionState,
  MsLevel,
  MsUndoHistory
>;

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
    const blockId = block.id ?? MS_TILE.Block;
    const blockName = describeMsActorName(blockId) ?? "block";
    return buildInteractiveFailureCause({
      actorId: blockId,
      actorName: blockName,
      kind: "other",
      message: `Crushed by ${blockName} at (${chipPos.x}, ${chipPos.y})`,
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

const msProjectionConfig: InteractiveAdapterProjectionConfig<
  MsInteractiveSessionState,
  MsLevel,
  MsUndoHistory
> = {
  getCurrentTick: (token) => token.state.engine.timer.currentTime,
  projectFrame: (token, phase, previousFrame) => projectMsInteractiveFrame(token, phase, previousFrame),
  projectHintText: (runtime) => levelHintTextAtZ(runtime.level, runtime.token.state.internal.chipZ) || null,
  projectRunState: (request, runtime, frame) => projectMsRunState(request, runtime, frame),
};

function projectMsSession(
  session: Pick<InteractiveGameSession, "request" | "mode">,
  runtime: MsInteractiveRuntime,
  phase: "initial" | "tick",
  options?: InteractiveAdapterProjectionOptions,
): InteractiveGameSession {
  return projectInteractiveAdapterSession(session, runtime, phase, msProjectionConfig, options);
}

const msHistoryConfig: InteractiveAdapterHistoryConfig<
  MsInteractiveSessionState,
  MsLevel,
  MsUndoHistory
> = {
  advanceToken: (token, inputCode) => advanceMsInteractiveSession(token, inputCode),
  forkUndoHistory: (history, token) => forkMsUndoHistory(history, token),
  getCurrentTick: (token) => token.state.engine.timer.currentTime,
  projectSession: (session, runtime, phase) => projectMsSession(session, runtime, phase),
  recordUndoTick: (history, token, _inputCode, source) =>
    recordMsUndoTick(history, token, token.lastInput.inputCode, source),
  restoreUndoHistoryToTick: (history, targetTick) => restoreMsUndoHistoryToTick(history, targetTick),
};

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
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "MS",
      "TS MS engine",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runMsInputTrace(loaded.request, level, commands, maxTicks),
    );
  }

  async runReplayTrace(
    request: Parameters<GameEnginePort["runReplayTrace"]>[0],
    replay: Parameters<GameEnginePort["runReplayTrace"]>[1],
    maxTicks: number,
  ): ReturnType<GameEnginePort["runReplayTrace"]> {
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "MS",
      "TS MS engine",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runMsReplayTrace(loaded.request, level, replay, maxTicks),
    );
  }

  async runInputTraceDebug(
    request: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[0],
    commands: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[1],
    maxTicks: number,
  ) {
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "MS",
      "TS MS engine",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runMsInputTraceDebug(loaded.request, level, commands, maxTicks),
    );
  }

  async runReplayTraceDebug(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
  ) {
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "MS",
      "TS MS engine",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runMsReplayTraceDebug(loaded.request, level, replay, maxTicks),
    );
  }

  async runReplayTraceDebugWindow(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
    windowStart: number,
    windowEndExclusive: number,
  ) {
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "MS",
      "TS MS engine",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runMsReplayTraceDebugWindow(loaded.request, level, replay, maxTicks, windowStart, windowEndExclusive),
    );
  }

  async startSession(
    request: Parameters<InteractiveGameEnginePort["startSession"]>[0],
    options?: Parameters<InteractiveGameEnginePort["startSession"]>[1],
  ): Promise<InteractiveGameSession> {
    const prepared = await withPreparedInteractiveLevelProfiled(
      this.levels,
      request,
      "MS",
      "TS MS engine",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
    );
    const projectionStartedAtMs = performance.now();
    const runtimeInitStartedAtMs = projectionStartedAtMs;
    const token = createMsInteractiveSession(
      request,
      prepared.level,
      options?.msStepping === undefined ? null : { stepping: options.msStepping },
    );
    const runtime = createInteractiveAdapterRuntime(
      token,
      prepared.level,
      (session, settings) => createMsUndoHistory(session, settings, { lazyInitialCheckpoint: true }),
      options?.undoSettings,
    );
    const initialRuntimeInitMs = performance.now() - runtimeInitStartedAtMs;
    const { perf: projectionPerf, session } = projectInitialInteractiveAdapterSessionProfiled(
      { request, mode: "manual" },
      runtime,
      msProjectionConfig,
    );
    return {
      ...session,
      loadPerf: {
        ...prepared.perf,
        initialProjectionMs: performance.now() - projectionStartedAtMs,
        initialRuntimeInitMs,
        ...projectionPerf,
      },
    };
  }

  async startReplaySession(
    request: Parameters<InteractiveGameEnginePort["startReplaySession"]>[0],
    replay: ReplaySolutionPayload,
    options?: Parameters<InteractiveGameEnginePort["startReplaySession"]>[2],
  ): Promise<InteractiveGameSession> {
    const prepared = await withPreparedInteractiveLevelProfiled(
      this.levels,
      request,
      "MS",
      "TS MS engine",
      msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
    );
    const projectionStartedAtMs = performance.now();
    const runtimeInitStartedAtMs = projectionStartedAtMs;
    const token = createMsReplaySession(request, prepared.level, replay);
    const runtime = createInteractiveAdapterRuntime(
      token,
      prepared.level,
      (session, settings) => createMsUndoHistory(session, settings, { lazyInitialCheckpoint: true }),
      options?.undoSettings,
    );
    const initialRuntimeInitMs = performance.now() - runtimeInitStartedAtMs;
    const { perf: projectionPerf, session } = projectInitialInteractiveAdapterSessionProfiled(
      { request, mode: "replay" },
      runtime,
      msProjectionConfig,
    );
    return {
      ...session,
      loadPerf: {
        ...prepared.perf,
        initialProjectionMs: performance.now() - projectionStartedAtMs,
        initialRuntimeInitMs,
        ...projectionPerf,
      },
    };
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: InteractiveInput,
  ): Promise<InteractiveGameSession> {
    assertAdapterRuleset(session.request, "MS", "TS MS engine");
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle) as MsInteractiveRuntime;
    return advanceInteractiveSessionWithHistory(session, runtime, input, msHistoryConfig);
  }

  async restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession> {
    assertAdapterRuleset(session.request, "MS", "TS MS engine");
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle) as MsInteractiveRuntime;
    return restoreInteractiveSessionToTick(session, runtime, targetTick, msHistoryConfig);
  }

  async resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    assertAdapterRuleset(session.request, "MS", "TS MS engine");
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle) as MsInteractiveRuntime;
    return resumeInteractiveSessionFromHistory(session, runtime, msHistoryConfig);
  }

  async hydrateSession(
    session: InteractiveGameSession,
    options: InteractiveGameSessionHydrationOptions,
  ): Promise<InteractiveGameSession> {
    assertAdapterRuleset(session.request, "MS", "TS MS engine");
    const runtime = fromInteractiveHandle<MsInteractiveSessionState, MsUndoHistory>(session.handle) as MsInteractiveRuntime;
    return projectMsSession(
      {
        request: session.request,
        mode: session.mode,
      },
      runtime,
      session.history.currentTick <= session.history.initialTick ? "initial" : "tick",
      {
        includeHistoryDetails: options.historyDetails,
      },
    );
  }
}
