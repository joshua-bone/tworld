import type { GameEnginePort } from "@application/ports/GameEngine";
import type { DebugGameEnginePort } from "@application/ports/DebugGameEngine";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
  InteractiveGameSessionHandle,
} from "@application/ports/InteractiveGameEngine";
import type { LevelRepository } from "@application/ports/LevelRepository";
import { projectInteractiveGameSession } from "@application/use-cases/projectInteractiveGameSession";
import { getGameInputCode, type GameInputName } from "@domain/game/command";
import { decodeMsLevelData, prepareMsLevel } from "@domain/game/rules/ms/level";
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
} from "@domain/game/rules/ms/engine";
import { projectMsInteractiveFrame } from "@domain/game/rules/ms/interactiveProjection";
import type { ReplaySolutionPayload } from "@domain/game/codec";

function toInteractiveHandle(token: MsInteractiveSessionState): InteractiveGameSessionHandle {
  return token as unknown as InteractiveGameSessionHandle;
}

function fromInteractiveHandle(handle: InteractiveGameSessionHandle): MsInteractiveSessionState {
  return handle as unknown as MsInteractiveSessionState;
}

export class TsMsGameEngineAdapter implements GameEnginePort, DebugGameEnginePort, InteractiveGameEnginePort {
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

  async startSession(request: Parameters<InteractiveGameEnginePort["startSession"]>[0]): Promise<InteractiveGameSession> {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    const token = createMsInteractiveSession(request, level);

    return projectInteractiveGameSession({
      request,
      mode: "manual",
      hintText: level.hintText || null,
      frame: projectMsInteractiveFrame(token, "initial"),
      recordedMoves: token.recordedMoves,
      handle: toInteractiveHandle(token),
    });
  }

  async startReplaySession(
    request: Parameters<InteractiveGameEnginePort["startReplaySession"]>[0],
    replay: ReplaySolutionPayload,
  ): Promise<InteractiveGameSession> {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareMsLevel(decodeMsLevelData(loaded.levelData));
    const token = createMsReplaySession(request, level, replay);

    return projectInteractiveGameSession({
      request,
      mode: "replay",
      hintText: level.hintText || null,
      frame: projectMsInteractiveFrame(token, "initial"),
      recordedMoves: token.recordedMoves,
      handle: toInteractiveHandle(token),
    });
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: GameInputName,
  ): Promise<InteractiveGameSession> {
    const token = advanceMsInteractiveSession(fromInteractiveHandle(session.handle), getGameInputCode(input));

    return projectInteractiveGameSession({
      request: session.request,
      mode: session.mode,
      hintText: session.hintText,
      frame: projectMsInteractiveFrame(token, "tick"),
      recordedMoves: token.recordedMoves,
      handle: toInteractiveHandle(token),
    });
  }
}
