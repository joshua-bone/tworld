import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import type { CorpusSourcePort } from "../p1a-corpus/types";
import {
  P1B_SHARD_REQUEST_ARTIFACT,
  P1B_SHARD_RESULT_ARTIFACT,
  type P1bMeasurementShardRequestV1,
  type P1bMeasurementShardResultV1,
} from "./measuredCorpusShardProtocol";
import { measureP1bCorpusOccurrences } from "./measuredCorpusReport";

const rootEnvironmentVariable = "TWORLD_P1B_SHARD_REPOSITORY_ROOT";
const requestEnvironmentVariable = "TWORLD_P1B_SHARD_REQUEST";
const outputEnvironmentVariable = "TWORLD_P1B_SHARD_OUTPUT";

function requiredAbsoluteEnvironmentPath(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0 || !isAbsolute(value)) {
    throw new Error(`${name} must name an absolute path`);
  }
  return resolve(value);
}

function sourcePort(repositoryRoot: string): CorpusSourcePort {
  return {
    async readBytes(path) {
      const absolutePath = resolve(repositoryRoot, path);
      const relativePath = relative(repositoryRoot, absolutePath);
      if (relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath)) {
        throw new Error(`corpus source escapes repository root: ${path}`);
      }
      return new Uint8Array(await readFile(absolutePath));
    },
  };
}

function parseCanonicalRequest(text: string): P1bMeasurementShardRequestV1 {
  let request: P1bMeasurementShardRequestV1;
  try {
    request = JSON.parse(text) as P1bMeasurementShardRequestV1;
  } catch (error) {
    throw new Error("measurement shard request is invalid JSON", { cause: error });
  }
  if (canonicalizeJson(request) !== text) {
    throw new Error("measurement shard request is not canonical");
  }
  if (
    request.artifact !== P1B_SHARD_REQUEST_ARTIFACT
    || request.version !== 1
    || !Number.isSafeInteger(request.shardIndex)
    || request.shardIndex < 0
    || !Number.isSafeInteger(request.shardCount)
    || request.shardCount < 1
    || request.shardIndex >= request.shardCount
    || !Array.isArray(request.occurrences)
    || request.occurrences.length === 0
  ) {
    throw new Error("measurement shard request has an unsupported shape");
  }
  return request;
}

async function run(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("measurement shard worker accepts no command-line arguments");
  }
  const repositoryRoot = requiredAbsoluteEnvironmentPath(rootEnvironmentVariable);
  const requestPath = requiredAbsoluteEnvironmentPath(requestEnvironmentVariable);
  const outputPath = requiredAbsoluteEnvironmentPath(outputEnvironmentVariable);
  const request = parseCanonicalRequest(await readFile(requestPath, "utf8"));
  const startedAt = performance.now();
  const cases = await measureP1bCorpusOccurrences({
    ...request.measurement,
    occurrences: request.occurrences,
    source: sourcePort(repositoryRoot),
    sha256: new WebCryptoSha256(),
    // Each OS process owns no more than one live paired analysis.
    maxConcurrency: 1,
  });
  const result: P1bMeasurementShardResultV1 = {
    artifact: P1B_SHARD_RESULT_ARTIFACT,
    version: 1,
    shardIndex: request.shardIndex,
    shardCount: request.shardCount,
    cases,
    diagnostics: {
      elapsedMilliseconds: Math.round(performance.now() - startedAt),
      maxRssKibibytes: process.resourceUsage().maxRSS,
    },
  };
  await writeFile(outputPath, canonicalizeJson(result), "utf8");
}

try {
  await run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
