import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  canonicalizeJson,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import type {
  CorpusManifestV1,
  CorpusSourcePort,
} from "../p1a-corpus/types";
import type { P1bMeasuredCorpusCaseV1 } from "./curriculumManifest";
import type { P1bCorpusOccurrenceV1 } from "./corpusValidityReport";
import {
  P1B_MAX_MEASUREMENT_PROCESSES,
  buildP1bMeasuredCorpusReportSharded,
} from "./measuredCorpusSharding";
import {
  P1B_SHARD_REQUEST_ARTIFACT,
  P1B_SHARD_RESULT_ARTIFACT,
  type P1bMeasurementShardRequestV1,
  type P1bMeasurementShardResultV1,
} from "./measuredCorpusShardProtocol";
import {
  P1B_CORPUS_MANIFEST_PATH,
  buildP1bCheckedArtifacts,
} from "./p1bCheckedArtifacts";
import { writeFixedOutputsTransactionally } from "./writeFixedOutputsTransactionally";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const concurrencyEnvironmentVariable = "TWORLD_P1B_ANALYSIS_JOBS";
const defaultMaxConcurrency = P1B_MAX_MEASUREMENT_PROCESSES;
const maximumMaxConcurrency = P1B_MAX_MEASUREMENT_PROCESSES;
const webRoot = resolve(repositoryRoot, "web");
const viteNodePath = resolve(webRoot, "node_modules/vite-node/vite-node.mjs");
const shardWorkerPath = resolve(
  webRoot,
  "src/ccsolver-runtime/compose/p1b-curriculum/runP1bMeasuredShard.ts",
);
const maximumWorkerOutputBytes = 65_536;

type Operation = "check" | "write";

interface GeneratedOutput {
  readonly path: string;
  readonly canonicalJson: CanonicalJson;
}

interface ShardDiagnostic {
  readonly shardIndex: number;
  readonly occurrenceCount: number;
  readonly elapsedMilliseconds: number;
  readonly maxRssKibibytes: number;
}

function usage(): string {
  return [
    "Usage: npm run ccsolver:p1b:check",
    "       npm run ccsolver:p1b:generate",
    "",
    `Environment: ${concurrencyEnvironmentVariable}=1..${maximumMaxConcurrency}`,
    `             (default ${defaultMaxConcurrency})`,
  ].join("\n");
}

function parseArguments(arguments_: readonly string[]): Operation {
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  if (arguments_.length === 1 && arguments_[0] === "--write") return "write";
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0] ?? "")) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  throw new Error("choose exactly one of --check or --write");
}

function maxConcurrencyFromEnvironment(value: string | undefined): number {
  if (value === undefined || value.length === 0) return defaultMaxConcurrency;
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(
      `${concurrencyEnvironmentVariable} must be an integer from 1 through ${maximumMaxConcurrency}`,
    );
  }
  const concurrency = Number(value);
  if (!Number.isSafeInteger(concurrency) || concurrency > maximumMaxConcurrency) {
    throw new Error(
      `${concurrencyEnvironmentVariable} must be an integer from 1 through ${maximumMaxConcurrency}`,
    );
  }
  return concurrency;
}

function sourcePort(root: string): CorpusSourcePort {
  return {
    async readBytes(path) {
      return new Uint8Array(await readFile(resolve(root, path)));
    },
  };
}

async function readCheckedCorpusManifest(root: string): Promise<CorpusManifestV1> {
  const absolutePath = resolve(root, P1B_CORPUS_MANIFEST_PATH);
  let checkedIn: string;
  try {
    checkedIn = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new Error(`checked-in corpus manifest is missing: ${P1B_CORPUS_MANIFEST_PATH}`, {
      cause: error,
    });
  }
  let manifest: CorpusManifestV1;
  try {
    manifest = JSON.parse(checkedIn) as CorpusManifestV1;
  } catch (error) {
    throw new Error(`checked-in corpus manifest is invalid JSON: ${P1B_CORPUS_MANIFEST_PATH}`, {
      cause: error,
    });
  }
  if (canonicalizeJson(manifest) !== checkedIn) {
    throw new Error(`checked-in corpus manifest is not canonical: ${P1B_CORPUS_MANIFEST_PATH}`);
  }
  return manifest;
}

function appendBounded(output: string, chunk: Uint8Array): string {
  const combined = output + new TextDecoder().decode(chunk);
  return combined.length <= maximumWorkerOutputBytes
    ? combined
    : combined.slice(combined.length - maximumWorkerOutputBytes);
}

async function waitForShardProcess(
  shardIndex: number,
  signal: AbortSignal,
  requestPath: string,
  outputPath: string,
): Promise<void> {
  if (signal.aborted) throw new Error(`measurement shard ${shardIndex} aborted before start`);
  const child = spawn(process.execPath, [viteNodePath, shardWorkerPath], {
    cwd: webRoot,
    env: {
      ...process.env,
      TWORLD_P1B_SHARD_REPOSITORY_ROOT: repositoryRoot,
      TWORLD_P1B_SHARD_REQUEST: requestPath,
      TWORLD_P1B_SHARD_OUTPUT: outputPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout = appendBounded(stdout, chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = appendBounded(stderr, chunk);
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false;
    let forcedKill: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (forcedKill !== undefined) clearTimeout(forcedKill);
      if (error === undefined) resolvePromise();
      else rejectPromise(error);
    };
    const abort = () => {
      child.kill("SIGTERM");
      forcedKill = setTimeout(() => child.kill("SIGKILL"), 5_000);
    };
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      finish(new Error(`measurement shard ${shardIndex} could not start`, { cause: error }));
    });
    child.once("close", (code, processSignal) => {
      if (signal.aborted) {
        finish(new Error(`measurement shard ${shardIndex} aborted`));
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `signal ${processSignal ?? "unknown"}`;
        finish(new Error(`measurement shard ${shardIndex} failed (${code ?? "no code"}): ${detail}`));
        return;
      }
      if (stdout.trim().length > 0 || stderr.trim().length > 0) {
        finish(new Error(`measurement shard ${shardIndex} emitted unexpected process output`));
        return;
      }
      finish();
    });
  });
}

function parseCanonicalShardResult(
  text: string,
  request: P1bMeasurementShardRequestV1,
): P1bMeasurementShardResultV1 {
  let result: P1bMeasurementShardResultV1;
  try {
    result = JSON.parse(text) as P1bMeasurementShardResultV1;
  } catch (error) {
    throw new Error(`measurement shard ${request.shardIndex} returned invalid JSON`, {
      cause: error,
    });
  }
  if (canonicalizeJson(result) !== text) {
    throw new Error(`measurement shard ${request.shardIndex} result is not canonical`);
  }
  if (
    result.artifact !== P1B_SHARD_RESULT_ARTIFACT
    || result.version !== 1
    || result.shardIndex !== request.shardIndex
    || result.shardCount !== request.shardCount
    || !Array.isArray(result.cases)
    || result.cases.length !== request.occurrences.length
    || !Number.isSafeInteger(result.diagnostics.elapsedMilliseconds)
    || result.diagnostics.elapsedMilliseconds < 0
    || !Number.isSafeInteger(result.diagnostics.maxRssKibibytes)
    || result.diagnostics.maxRssKibibytes < 0
  ) {
    throw new Error(`measurement shard ${request.shardIndex} result has an unsupported shape`);
  }
  const expectedIds = request.occurrences.map((entry) => entry.occurrenceId).sort();
  const actualIds = result.cases.map((entry) => entry.occurrenceId).sort();
  if (expectedIds.some((occurrenceId, index) => occurrenceId !== actualIds[index])) {
    throw new Error(`measurement shard ${request.shardIndex} returned the wrong occurrences`);
  }
  return result;
}

async function runMeasurementShard(
  temporaryDirectory: string,
  input: {
    readonly shardIndex: number;
    readonly shardCount: number;
    readonly occurrences: readonly P1bCorpusOccurrenceV1[];
    readonly measurement: P1bMeasurementShardRequestV1["measurement"];
    readonly signal: AbortSignal;
  },
  diagnostics: ShardDiagnostic[],
): Promise<readonly P1bMeasuredCorpusCaseV1[]> {
  const suffix = String(input.shardIndex).padStart(2, "0");
  const requestPath = resolve(temporaryDirectory, `request-${suffix}.json`);
  const outputPath = resolve(temporaryDirectory, `result-${suffix}.json`);
  const request: P1bMeasurementShardRequestV1 = {
    artifact: P1B_SHARD_REQUEST_ARTIFACT,
    version: 1,
    shardIndex: input.shardIndex,
    shardCount: input.shardCount,
    measurement: input.measurement,
    occurrences: input.occurrences,
  };
  await writeFile(requestPath, canonicalizeJson(request), "utf8");
  await waitForShardProcess(
    input.shardIndex,
    input.signal,
    requestPath,
    outputPath,
  );
  const result = parseCanonicalShardResult(await readFile(outputPath, "utf8"), request);
  diagnostics.push({
    shardIndex: result.shardIndex,
    occurrenceCount: result.cases.length,
    ...result.diagnostics,
  });
  process.stdout.write(
    `P1B shard ${result.shardIndex + 1}/${result.shardCount}: `
    + `${result.cases.length} cases in ${result.diagnostics.elapsedMilliseconds} ms, `
    + `${Math.ceil(result.diagnostics.maxRssKibibytes / 1_024)} MiB max RSS.\n`,
  );
  return result.cases;
}

async function buildOutputs(maxWorkers: number): Promise<{
  readonly outputs: readonly GeneratedOutput[];
  readonly validOccurrenceCount: number;
  readonly invalidOccurrenceCount: number;
  readonly measuredOccurrenceCount: number;
  readonly parityOccurrenceCount: number;
  readonly divergentOccurrenceCount: number;
  readonly shardDiagnostics: readonly ShardDiagnostic[];
}> {
  const sha256 = new WebCryptoSha256();
  const manifest = await readCheckedCorpusManifest(repositoryRoot);
  const source = sourcePort(repositoryRoot);
  const shardDiagnostics: ShardDiagnostic[] = [];
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "tworld-p1b-measurement-"));
  let generated: Awaited<ReturnType<typeof buildP1bCheckedArtifacts>>;
  try {
    generated = await buildP1bCheckedArtifacts({
      manifest,
      source,
      sha256,
      async resolveMeasuredCases({ validityReport, measurement }) {
        process.stdout.write(
          `P1B validity: ${validityReport.summary.validPairedOccurrenceCount} valid paired cases; `
          + `starting ${maxWorkers} process workers.\n`,
        );
        const measured = await buildP1bMeasuredCorpusReportSharded({
          validityReport,
          sha256,
          analysisRevisions: measurement.analysisRevisions,
          maxWorkers,
          runShard: (input) => runMeasurementShard(
            temporaryDirectory,
            input,
            shardDiagnostics,
          ),
        });
        return measured.report.cases;
      },
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return {
    outputs: generated.outputs,
    validOccurrenceCount: generated.validOccurrenceCount,
    invalidOccurrenceCount: generated.invalidOccurrenceCount,
    measuredOccurrenceCount: generated.measuredOccurrenceCount,
    parityOccurrenceCount: generated.parityOccurrenceCount,
    divergentOccurrenceCount: generated.divergentOccurrenceCount,
    shardDiagnostics: [...shardDiagnostics].sort((left, right) =>
      left.shardIndex - right.shardIndex,
    ),
  };
}

async function applyOutputs(
  operation: Operation,
  outputs: readonly GeneratedOutput[],
): Promise<number> {
  const totalBytes = outputs.reduce(
    (sum, output) => sum + new TextEncoder().encode(output.canonicalJson).byteLength,
    0,
  );
  if (operation === "write") {
    await writeFixedOutputsTransactionally(repositoryRoot, outputs);
    return totalBytes;
  }
  for (const output of outputs) {
    const absolutePath = resolve(repositoryRoot, output.path);
    let checkedIn: string;
    try {
      checkedIn = await readFile(absolutePath, "utf8");
    } catch (error) {
      throw new Error(`checked-in P1B artifact is missing: ${output.path}`, { cause: error });
    }
    if (checkedIn !== output.canonicalJson) {
      throw new Error(
        `checked-in P1B artifact is stale: ${relative(repositoryRoot, absolutePath)}; `
        + "run npm run ccsolver:p1b:generate",
      );
    }
  }
  return totalBytes;
}

async function run(operation: Operation): Promise<void> {
  const startedAt = performance.now();
  const maxConcurrency = maxConcurrencyFromEnvironment(
    process.env[concurrencyEnvironmentVariable],
  );
  const generated = await buildOutputs(maxConcurrency);
  const totalBytes = await applyOutputs(operation, generated.outputs);
  const elapsedMilliseconds = Math.round(performance.now() - startedAt);
  const workerMaxRssUpperBoundKibibytes = generated.shardDiagnostics.reduce(
    (sum, diagnostic) => sum + diagnostic.maxRssKibibytes,
    0,
  );
  const largestWorkerMaxRssKibibytes = Math.max(
    0,
    ...generated.shardDiagnostics.map((diagnostic) => diagnostic.maxRssKibibytes),
  );
  process.stdout.write(
    `${operation === "write" ? "Wrote" : "Verified"} ${generated.outputs.length} P1B artifacts `
    + `(${totalBytes} bytes) in ${elapsedMilliseconds} ms with ${maxConcurrency} workers: `
    + `${generated.validOccurrenceCount} valid, ${generated.invalidOccurrenceCount} quarantined, `
    + `${generated.measuredOccurrenceCount} measured (${generated.parityOccurrenceCount} parity, `
    + `${generated.divergentOccurrenceCount} divergent); worker max-RSS upper bound `
    + `${Math.ceil(workerMaxRssUpperBoundKibibytes / 1_024)} MiB `
    + `(largest ${Math.ceil(largestWorkerMaxRssKibibytes / 1_024)} MiB).\n`,
  );
}

try {
  await run(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}
