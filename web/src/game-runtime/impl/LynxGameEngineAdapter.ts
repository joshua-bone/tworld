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
import type { LynxLevel } from "@ruleset-lynx/api/level";
import { levelHintTextAtZ } from "@ruleset-ms/api/level";
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
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import {
  createLynxUndoHistory,
  forkLynxUndoHistory,
  recordLynxUndoTick,
  restoreLynxUndoHistoryToTick,
} from "@undo-runtime/impl/lynxHistory";
import type { LynxUndoHistory } from "@undo-runtime/impl/lynxHistory";
import { isMsBlockActorId, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  advanceInteractiveSessionWithHistory,
  assertAdapterRuleset,
  createInteractiveAdapterRuntime,
  projectInteractiveAdapterSession,
  restoreInteractiveSessionToTick,
  resumeInteractiveSessionFromHistory,
  withPreparedInteractiveLevel,
  type InteractiveAdapterHistoryConfig,
  type InteractiveAdapterProjectionConfig,
  type InteractiveAdapterRuntime,
} from "@game-runtime/impl/interactiveAdapterSkeleton";

type LynxInteractiveRuntime = InteractiveAdapterRuntime<
  LynxInteractiveSessionState,
  LynxLevel,
  LynxUndoHistory
>;

function findLynxCollisionCause(runtime: LynxInteractiveRuntime): InteractiveGameSessionEndCause {
  const chipPos = boardPositionToGridPosition(runtime.token.chipPos, runtime.token.chipZ ?? 1);
  const chipZ = runtime.token.chipZ ?? 1;
  const actor = runtime.token.actors.find(
    (entry) => !entry.hidden && entry.pos === runtime.token.chipPos && (entry.z ?? 1) === chipZ,
  );

  if (actor) {
    const actorName = describeMsActorName(actor.id) ?? "monster";
    const isBlock = isMsBlockActorId(actor.id);
    return buildInteractiveFailureCause({
      actorId: actor.id,
      actorName,
      kind: isBlock ? "other" : "monster",
      message:
        isBlock
          ? `Crushed by ${actorName} at (${chipPos.x}, ${chipPos.y})`
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

const lynxProjectionConfig: InteractiveAdapterProjectionConfig<
  LynxInteractiveSessionState,
  LynxLevel,
  LynxUndoHistory
> = {
  getCurrentTick: (token) => token.state.timer.currentTime,
  projectFrame: (token, phase) => projectLynxInteractiveFrame(token, phase),
  projectHintText: (runtime) => levelHintTextAtZ(runtime.level, runtime.token.chipZ) || null,
  projectRunState: (request, runtime, frame) => projectLynxRunState(request, runtime, frame),
};

function projectLynxSession(
  session: Pick<InteractiveGameSession, "request" | "mode">,
  runtime: LynxInteractiveRuntime,
  phase: "initial" | "tick",
): InteractiveGameSession {
  return projectInteractiveAdapterSession(session, runtime, phase, lynxProjectionConfig);
}

const lynxHistoryConfig: InteractiveAdapterHistoryConfig<
  LynxInteractiveSessionState,
  LynxLevel,
  LynxUndoHistory
> = {
  advanceToken: (token, inputCode) => advanceLynxInteractiveSession(token, inputCode),
  forkUndoHistory: (history, token) => forkLynxUndoHistory(history, token),
  getCurrentTick: (token) => token.state.timer.currentTime,
  projectSession: (session, runtime, phase) => projectLynxSession(session, runtime, phase),
  recordUndoTick: (history, token, _inputCode, source) =>
    recordLynxUndoTick(history, token, token.lastInput.inputCode, source),
  restoreUndoHistoryToTick: (history, targetTick) => restoreLynxUndoHistoryToTick(history, targetTick),
};

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
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "Lynx",
      "TS Lynx engine",
      lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runLynxInputTrace(loaded.request, level, commands, maxTicks),
    );
  }

  async runReplayTrace(
    request: Parameters<GameEnginePort["runReplayTrace"]>[0],
    replay: Parameters<GameEnginePort["runReplayTrace"]>[1],
    maxTicks: number,
  ) {
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "Lynx",
      "TS Lynx engine",
      lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runLynxReplayTrace(loaded.request, level, replay, maxTicks),
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
      "Lynx",
      "TS Lynx engine",
      lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runLynxInputTraceDebug(loaded.request, level, commands, maxTicks),
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
      "Lynx",
      "TS Lynx engine",
      lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runLynxReplayTraceDebug(loaded.request, level, replay, maxTicks),
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
      "Lynx",
      "TS Lynx engine",
      lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      (loaded, level) =>
      runLynxReplayTraceDebugWindow(loaded.request, level, replay, maxTicks, windowStart, windowEndExclusive),
    );
  }

  async startSession(
    request: Parameters<InteractiveGameEnginePort["startSession"]>[0],
    options?: Parameters<InteractiveGameEnginePort["startSession"]>[1],
  ): Promise<InteractiveGameSession> {
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "Lynx",
      "TS Lynx engine",
      lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      async (_loaded, level) => {
      const token = createLynxInteractiveSession(request, level);
      const runtime = createInteractiveAdapterRuntime(token, level, createLynxUndoHistory, options?.undoSettings);
      return projectLynxSession({ request, mode: "manual" }, runtime, "initial");
      },
    );
  }

  async startReplaySession(
    request: Parameters<InteractiveGameEnginePort["startReplaySession"]>[0],
    replay: ReplaySolutionPayload,
    options?: Parameters<InteractiveGameEnginePort["startReplaySession"]>[2],
  ): Promise<InteractiveGameSession> {
    return withPreparedInteractiveLevel(
      this.levels,
      request,
      "Lynx",
      "TS Lynx engine",
      lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel,
      async (_loaded, level) => {
      const token = createLynxReplaySession(request, level, replay);
      const runtime = createInteractiveAdapterRuntime(token, level, createLynxUndoHistory, options?.undoSettings);
      return projectLynxSession({ request, mode: "replay" }, runtime, "initial");
      },
    );
  }

  async advanceSession(session: InteractiveGameSession, input: InteractiveInput): Promise<InteractiveGameSession> {
    assertAdapterRuleset(session.request, "Lynx", "TS Lynx engine");
    const runtime = fromInteractiveHandle<LynxInteractiveSessionState, LynxUndoHistory>(session.handle) as LynxInteractiveRuntime;
    return advanceInteractiveSessionWithHistory(session, runtime, input, lynxHistoryConfig);
  }

  async restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession> {
    assertAdapterRuleset(session.request, "Lynx", "TS Lynx engine");
    const runtime = fromInteractiveHandle<LynxInteractiveSessionState, LynxUndoHistory>(session.handle) as LynxInteractiveRuntime;
    return restoreInteractiveSessionToTick(session, runtime, targetTick, lynxHistoryConfig);
  }

  async resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    assertAdapterRuleset(session.request, "Lynx", "TS Lynx engine");
    const runtime = fromInteractiveHandle<LynxInteractiveSessionState, LynxUndoHistory>(session.handle) as LynxInteractiveRuntime;
    return resumeInteractiveSessionFromHistory(session, runtime, lynxHistoryConfig);
  }
}
