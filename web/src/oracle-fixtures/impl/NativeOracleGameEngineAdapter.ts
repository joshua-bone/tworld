import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mapInputTraceFixtureToGameTrace } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { mapOracleDebugFixtureToGameDebugTrace } from "@oracle-fixtures/impl/mappers/oracleDebug";
import type { DebugGameEnginePort } from "@game-runtime/ports/DebugGameEngine";
import { formatTraceCommandSpec } from "@replay-verifier/impl/traceScenario";
import type { GameEnginePort, GameEngineTrace } from "@game-runtime/ports/GameEngine";
import type { InputTraceFixture } from "@oracle-fixtures/impl/contracts/characterizationContract";
import type { OracleDebugTraceFixture } from "@oracle-fixtures/impl/contracts/oracleDebugContract";

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(currentDir, "../../../../");
// Late official replay debug traces can exceed 256 MiB once phase snapshots are included.
const ORACLE_MAX_BUFFER_BYTES = 512 * 1024 * 1024;

export const defaultOraclePath = resolve(defaultRepoRoot, "build-verify", "legacy_c", "tworld-oracle");

const EXPECTED_ORACLE_STDERR_PATTERNS = [
  /CHIPS\.dat unavailable/,
  /solution file.*was recorded for a different level set/,
  /invalid cloner wiring: no button at \(\d+ \d+\)/,
  /disabling miswired cloner button at \(\d+ \d+\)/,
] as const;

export function isExpectedOracleStderrLine(line: string): boolean {
  return EXPECTED_ORACLE_STDERR_PATTERNS.some((pattern) => pattern.test(line));
}

function assertExpectedStderr(stderr: string, command: string): void {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.every((line) => isExpectedOracleStderrLine(line))) {
    return;
  }

  throw new Error(`unexpected stderr from ${command}:\n${stderr}`);
}

export interface NativeOracleGameEngineAdapterOptions {
  oraclePath?: string;
  repoRoot?: string;
}

export class NativeOracleGameEngineAdapter implements GameEnginePort, DebugGameEnginePort {
  private readonly oraclePath: string;
  private readonly repoRoot: string;

  constructor(options: NativeOracleGameEngineAdapterOptions = {}) {
    this.oraclePath = options.oraclePath ?? process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath;
    this.repoRoot = options.repoRoot ?? defaultRepoRoot;
  }

  static hasDefaultOracle(): boolean {
    return existsSync(process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath);
  }

  supportsRuleset(): boolean {
    return true;
  }

  async runInputTrace(
    request: Parameters<GameEnginePort["runInputTrace"]>[0],
    commands: Parameters<GameEnginePort["runInputTrace"]>[1],
    maxTicks: number,
  ): Promise<GameEngineTrace> {
    const args = [
      "input-trace",
      request.seriesFile,
      String(request.levelNumber),
      formatTraceCommandSpec(commands),
      String(maxTicks),
    ];
    if (request.randomSeed !== undefined) {
      args.push(String(request.randomSeed));
    }

    return this.runInputTraceCommand(args);
  }

  async runReplayTrace(
    request: Parameters<GameEnginePort["runReplayTrace"]>[0],
    replay: Parameters<GameEnginePort["runReplayTrace"]>[1],
    maxTicks: number,
  ): Promise<GameEngineTrace> {
    return this.runInputTraceCommand([
      "replay-trace-solution",
      request.seriesFile,
      String(request.levelNumber),
      String(maxTicks),
      String(replay.bestTimeTicks ?? maxTicks),
      String(replay.flags),
      String(replay.randomSlideDirection),
      String(replay.stepping),
      String(replay.randomSeed),
      replay.moves.map((move) => `${move.when}:${move.dir}`).join(",") || "-",
    ]);
  }

  async runInputTraceDebug(
    request: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[0],
    commands: Parameters<DebugGameEnginePort["runInputTraceDebug"]>[1],
    maxTicks: number,
  ) {
    const args = [
      "input-trace-debug",
      request.seriesFile,
      String(request.levelNumber),
      formatTraceCommandSpec(commands),
      String(maxTicks),
    ];
    if (request.randomSeed !== undefined) {
      args.push(String(request.randomSeed));
    }

    return this.runInputTraceDebugCommand(args);
  }

  async runReplayTraceDebug(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
  ) {
    return this.runInputTraceDebugCommand([
      "replay-trace-solution-debug",
      request.seriesFile,
      String(request.levelNumber),
      String(maxTicks),
      String(replay.bestTimeTicks ?? maxTicks),
      String(replay.flags),
      String(replay.randomSlideDirection),
      String(replay.stepping),
      String(replay.randomSeed),
      replay.moves.map((move) => `${move.when}:${move.dir}`).join(",") || "-",
    ]);
  }

  async runReplayTraceDebugWindow(
    request: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[0],
    replay: Parameters<DebugGameEnginePort["runReplayTraceDebug"]>[1],
    maxTicks: number,
    windowStart: number,
    windowEndExclusive: number,
  ) {
    return this.runInputTraceDebugCommand([
      "replay-trace-solution-debug-window",
      request.seriesFile,
      String(request.levelNumber),
      String(maxTicks),
      String(replay.bestTimeTicks ?? maxTicks),
      String(replay.flags),
      String(replay.randomSlideDirection),
      String(replay.stepping),
      String(replay.randomSeed),
      String(windowStart),
      String(windowEndExclusive),
      replay.moves.map((move) => `${move.when}:${move.dir}`).join(",") || "-",
    ]);
  }

  private async runInputTraceCommand(args: string[]): Promise<GameEngineTrace> {
    const command = `${this.oraclePath} ${args.join(" ")}`;
    const result = await execFileAsync(this.oraclePath, args, {
      cwd: this.repoRoot,
      encoding: "utf-8",
      maxBuffer: ORACLE_MAX_BUFFER_BYTES,
    });

    if (result.stderr) {
      assertExpectedStderr(result.stderr, command);
    }

    return mapInputTraceFixtureToGameTrace(JSON.parse(result.stdout) as InputTraceFixture);
  }

  private async runInputTraceDebugCommand(args: string[]) {
    const command = `${this.oraclePath} ${args.join(" ")}`;
    const result = await execFileAsync(this.oraclePath, args, {
      cwd: this.repoRoot,
      encoding: "utf-8",
      maxBuffer: ORACLE_MAX_BUFFER_BYTES,
    });

    if (result.stderr) {
      assertExpectedStderr(result.stderr, command);
    }

    return mapOracleDebugFixtureToGameDebugTrace(JSON.parse(result.stdout) as OracleDebugTraceFixture);
  }
}
