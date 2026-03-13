import type { GameEnginePort } from "@application/ports/GameEngine";
import type { DebugGameEnginePort } from "@application/ports/DebugGameEngine";
import type { InteractiveGameEnginePort, InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { LevelRepository } from "@application/ports/LevelRepository";
import { getGameInputCode, type GameInputName } from "@domain/game/command";
import { parseMsLevel } from "@domain/game/rules/ms/level";
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
import { engineStateToSnapshot } from "@domain/game/snapshot";
import type { ReplaySolutionPayload } from "@domain/game/codec";

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
    const level = parseMsLevel(loaded.levelData);
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
    const level = parseMsLevel(loaded.levelData);
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
    const level = parseMsLevel(loaded.levelData);
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
    const level = parseMsLevel(loaded.levelData);
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
    const level = parseMsLevel(loaded.levelData);
    return runMsReplayTraceDebugWindow(loaded.request, level, replay, maxTicks, windowStart, windowEndExclusive);
  }

  async startSession(request: Parameters<InteractiveGameEnginePort["startSession"]>[0]): Promise<InteractiveGameSession> {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = parseMsLevel(loaded.levelData);
    const token = createMsInteractiveSession(request, level);

    return {
      request: { ...request },
      mode: "manual",
      hintText: level.hintText || null,
      frame: {
        snapshot: engineStateToSnapshot(token.state.engine, "initial", token.lastInput),
        cells: token.state.engine.map.cells.map((cell) => ({
          position: { ...cell.position },
          top: { ...cell.top },
          bottom: { ...cell.bottom },
        })),
      },
      recordedMoves: token.recordedMoves.map((move) => ({ ...move })),
      token,
    };
  }

  async startReplaySession(
    request: Parameters<InteractiveGameEnginePort["startReplaySession"]>[0],
    replay: ReplaySolutionPayload,
  ): Promise<InteractiveGameSession> {
    if (request.ruleset !== "MS") {
      throw new Error(`TS MS engine does not support ruleset ${request.ruleset}`);
    }

    const loaded = await this.levels.loadLevel(request);
    const level = parseMsLevel(loaded.levelData);
    const token = createMsReplaySession(request, level, replay);

    return {
      request: { ...request },
      mode: "replay",
      hintText: level.hintText || null,
      frame: {
        snapshot: engineStateToSnapshot(token.state.engine, "initial", token.lastInput),
        cells: token.state.engine.map.cells.map((cell) => ({
          position: { ...cell.position },
          top: { ...cell.top },
          bottom: { ...cell.bottom },
        })),
      },
      recordedMoves: token.recordedMoves.map((move) => ({ ...move })),
      token,
    };
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: GameInputName,
  ): Promise<InteractiveGameSession> {
    const token = advanceMsInteractiveSession(session.token as MsInteractiveSessionState, getGameInputCode(input));

    return {
      ...session,
      frame: {
        snapshot: engineStateToSnapshot(token.state.engine, "tick", token.lastInput),
        cells: token.state.engine.map.cells.map((cell) => ({
          position: { ...cell.position },
          top: { ...cell.top },
          bottom: { ...cell.bottom },
        })),
      },
      recordedMoves: token.recordedMoves.map((move) => ({ ...move })),
      token,
    };
  }
}
