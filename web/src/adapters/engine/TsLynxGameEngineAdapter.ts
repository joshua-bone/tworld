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
import { parseLynxLevel } from "@domain/game/rules/lynx/level";
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
} from "@domain/game/rules/lynx/engine";
import { projectLynxInteractiveFrame } from "@domain/game/rules/lynx/interactiveProjection";
import type { ReplaySolutionPayload } from "@domain/game/codec";

function toInteractiveHandle(token: LynxInteractiveSessionState): InteractiveGameSessionHandle {
  return token as unknown as InteractiveGameSessionHandle;
}

function fromInteractiveHandle(handle: InteractiveGameSessionHandle): LynxInteractiveSessionState {
  return handle as unknown as LynxInteractiveSessionState;
}

export class TsLynxGameEngineAdapter implements GameEnginePort, DebugGameEnginePort, InteractiveGameEnginePort {
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
    const level = parseLynxLevel(loaded.levelData);
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
    const level = parseLynxLevel(loaded.levelData);
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
    const level = parseLynxLevel(loaded.levelData);
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
    const level = parseLynxLevel(loaded.levelData);
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
    const level = parseLynxLevel(loaded.levelData);
    return runLynxReplayTraceDebugWindow(loaded.request, level, replay, maxTicks, windowStart, windowEndExclusive);
  }

  async startSession(request: Parameters<InteractiveGameEnginePort["startSession"]>[0]): Promise<InteractiveGameSession> {
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = parseLynxLevel(loaded.levelData);
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
    const level = parseLynxLevel(loaded.levelData);
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

  async advanceSession(session: InteractiveGameSession, input: GameInputName): Promise<InteractiveGameSession> {
    const request = session.request;
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const token = advanceLynxInteractiveSession(fromInteractiveHandle(session.handle), getGameInputCode(input));

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
