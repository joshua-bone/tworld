import type { GameEnginePort } from "@application/ports/GameEngine";
import type { DebugGameEnginePort } from "@application/ports/DebugGameEngine";
import type { InteractiveGameEnginePort, InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { LevelRepository } from "@application/ports/LevelRepository";
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
import { engineStateToSnapshot } from "@domain/game/snapshot";
import type { ReplaySolutionPayload } from "@domain/game/codec";

function cloneCells(token: LynxInteractiveSessionState) {
  return token.state.map.cells.map((cell) => ({
    position: { ...cell.position },
    top: { ...cell.top },
    bottom: { ...cell.bottom },
  }));
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

    return {
      request: { ...request },
      mode: "manual",
      hintText: level.hintText || null,
      frame: {
        snapshot: engineStateToSnapshot(token.state, "initial", token.lastInput),
        cells: cloneCells(token),
      },
      recordedMoves: token.recordedMoves.map((move) => ({ ...move })),
      token,
    };
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

    return {
      request: { ...request },
      mode: "replay",
      hintText: level.hintText || null,
      frame: {
        snapshot: engineStateToSnapshot(token.state, "initial", token.lastInput),
        cells: cloneCells(token),
      },
      recordedMoves: token.recordedMoves.map((move) => ({ ...move })),
      token,
    };
  }

  async advanceSession(session: InteractiveGameSession, input: GameInputName): Promise<InteractiveGameSession> {
    const request = session.request;
    if (request.ruleset !== "Lynx") {
      throw new Error(`TS Lynx engine does not support ruleset ${request.ruleset}`);
    }

    const token = advanceLynxInteractiveSession(session.token as LynxInteractiveSessionState, getGameInputCode(input));

    return {
      ...session,
      frame: {
        snapshot: engineStateToSnapshot(token.state, "tick", token.lastInput),
        cells: cloneCells(token),
      },
      recordedMoves: token.recordedMoves.map((move) => ({ ...move })),
      token,
    };
  }
}
