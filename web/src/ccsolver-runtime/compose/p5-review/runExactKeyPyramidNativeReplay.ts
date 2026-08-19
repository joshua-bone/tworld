import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { GameTrace } from "@game-core/api/types";
import type { InputTraceFixture } from "@oracle-fixtures/impl/contracts/characterizationContract";
import { mapInputTraceFixtureToGameTrace } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import type { KeyPyramidP5Target } from "./certifyKeyPyramidP5Replay";

const execFileAsync = promisify(execFile);
const ORACLE_TIMEOUT_MS = 30_000;
const ORACLE_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export type ExactKeyPyramidNativeReplayRequest = {
  readonly oraclePath: string;
  readonly args: readonly string[];
  readonly saveDirectory: string;
  readonly solutionFilename: string;
};

export type ExactKeyPyramidNativeReplayExecutor = (
  request: ExactKeyPyramidNativeReplayRequest,
) => Promise<GameTrace>;

export type ExactKeyPyramidNativeReplayResult = {
  readonly trace: GameTrace;
  readonly audit: {
    readonly command: "replay-trace";
    readonly isolatedSaveDirectory: true;
    readonly solutionFilename: string;
    readonly saveDirectoryFileCount: 1;
    readonly exactInputBytesRead: true;
    readonly maximumTicks: number;
  };
};

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index]);
}

async function executeNativeOracle(
  request: ExactKeyPyramidNativeReplayRequest,
): Promise<GameTrace> {
  const result = await execFileAsync(request.oraclePath, [...request.args], {
    encoding: "utf8",
    maxBuffer: ORACLE_MAX_BUFFER_BYTES,
    timeout: ORACLE_TIMEOUT_MS,
  });
  if (result.stderr.trim().length !== 0) {
    throw new Error(`native oracle emitted stderr:\n${result.stderr}`);
  }
  return mapInputTraceFixtureToGameTrace(
    JSON.parse(result.stdout) as InputTraceFixture,
  );
}

export async function runExactKeyPyramidNativeReplay(input: {
  readonly repositoryRoot: string;
  readonly oraclePath: string;
  readonly target: KeyPyramidP5Target;
  readonly twsBytes: Uint8Array;
  readonly maximumTicks: number;
  readonly execute?: ExactKeyPyramidNativeReplayExecutor;
}): Promise<ExactKeyPyramidNativeReplayResult> {
  if (!Number.isSafeInteger(input.maximumTicks) || input.maximumTicks <= 0 || input.maximumTicks > 4_040) {
    throw new Error("P5 native replay maximumTicks is outside the bounded verifier range");
  }
  if (input.execute === undefined) {
    try {
      await access(input.oraclePath);
    } catch (error) {
      throw new Error(`native oracle is unavailable: ${input.oraclePath}`, { cause: error });
    }
  }
  const seriesFile = input.target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac";
  const solutionFilename = `${seriesFile}.tws`;
  const saveDirectory = await mkdtemp(join(tmpdir(), "tworld-p5-native-save-"));
  const solutionPath = resolve(saveDirectory, solutionFilename);
  try {
    if ((await readdir(saveDirectory)).length !== 0) {
      throw new Error("P5 native replay temporary save directory was not empty");
    }
    await writeFile(solutionPath, input.twsBytes);
    const files = await readdir(saveDirectory);
    const stagedBytes = new Uint8Array(await readFile(solutionPath));
    if (files.length !== 1 || files[0] !== solutionFilename || !bytesEqual(stagedBytes, input.twsBytes)) {
      throw new Error("P5 native replay did not stage the exact complete TWS bytes");
    }
    const args = [
      "--root",
      input.repositoryRoot,
      "--save-dir",
      saveDirectory,
      "replay-trace",
      seriesFile,
      "1",
      String(input.maximumTicks),
    ] as const;
    const trace = await (input.execute ?? executeNativeOracle)({
      oraclePath: input.oraclePath,
      args,
      saveDirectory,
      solutionFilename,
    });
    return {
      trace,
      audit: {
        command: "replay-trace",
        isolatedSaveDirectory: true,
        solutionFilename,
        saveDirectoryFileCount: 1,
        exactInputBytesRead: true,
        maximumTicks: input.maximumTicks,
      },
    };
  } finally {
    await rm(saveDirectory, { recursive: true, force: true });
  }
}
