import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { DebugGameEnginePort } from "@game-runtime/ports/DebugGameEngine";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
  InteractiveGameSessionHandle,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { LevelRepository } from "@level-catalog/ports/LevelRepository";
import { projectInteractiveGameSession } from "@game-runtime/impl/projectInteractiveGameSession";
import { resolveGameInputCode, type InteractiveInput } from "@game-core/api/command";
import { prepareLynxLevel } from "@ruleset-lynx/api/level";
import { decodeMsLevelData } from "@ruleset-ms/api/level";
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

function toInteractiveHandle(token: LynxInteractiveSessionState): InteractiveGameSessionHandle {
  return token as unknown as InteractiveGameSessionHandle;
}

function fromInteractiveHandle(handle: InteractiveGameSessionHandle): LynxInteractiveSessionState {
  return handle as unknown as LynxInteractiveSessionState;
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
    const level = prepareLynxLevel(decodeMsLevelData(loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelData(loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelData(loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelData(loaded.levelData));
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
    const level = prepareLynxLevel(decodeMsLevelData(loaded.levelData));
    return runLynxReplayTraceDebugWindow(loaded.request, level, replay, maxTicks, windowStart, windowEndExclusive);
  }

  async startSession(request: Parameters<InteractiveGameEnginePort["startSession"]>[0]): Promise<InteractiveGameSession> {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelData(loaded.levelData));
    const token = createLynxInteractiveSession(request, level);

    return projectInteractiveGameSession({
      request,
      mode: "manual",
      hintText: level.hintText || null,
      frame: projectLynxInteractiveFrame(token, "initial"),
      recordedMoves: token.recordedMoves,
      handle: toInteractiveHandle(token),
    });
  }

  async startReplaySession(
    request: Parameters<InteractiveGameEnginePort["startReplaySession"]>[0],
    replay: ReplaySolutionPayload,
  ): Promise<InteractiveGameSession> {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = prepareLynxLevel(decodeMsLevelData(loaded.levelData));
    const token = createLynxReplaySession(request, level, replay);

    return projectInteractiveGameSession({
      request,
      mode: "replay",
      hintText: level.hintText || null,
      frame: projectLynxInteractiveFrame(token, "initial"),
      recordedMoves: token.recordedMoves,
      handle: toInteractiveHandle(token),
    });
  }

  async advanceSession(session: InteractiveGameSession, input: InteractiveInput): Promise<InteractiveGameSession> {
    const request = session.request;
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const token = advanceLynxInteractiveSession(fromInteractiveHandle(session.handle), resolveGameInputCode(input));

    return projectInteractiveGameSession({
      request: session.request,
      mode: session.mode,
      hintText: session.hintText,
      frame: projectLynxInteractiveFrame(token, "tick"),
      recordedMoves: token.recordedMoves,
      handle: toInteractiveHandle(token),
    });
  }
}
