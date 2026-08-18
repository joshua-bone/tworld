import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  encodeArtifact,
  identifyBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { buildTworldPairedStaticAnalysis } from "../buildTworldPairedStaticAnalysis";
import type {
  CorpusManifestV1,
  CorpusSourcePort,
} from "../p1a-corpus/types";
import {
  P1B_PHASE_A_SYNTHETIC_FIXTURES,
  buildP1bCurriculumManifest,
  type P1bMeasuredCorpusCaseV1,
} from "./curriculumManifest";
import {
  artifactOccurrenceIdForCorpusOccurrence,
} from "./corpusArtifactIdentity";
import {
  buildP1bCorpusValidityReport,
  canonicalP1bCorpusValidityReportJson,
  type P1bCorpusOccurrenceV1,
} from "./corpusValidityReport";
import {
  type P1bMeasuredCorpusReportBundle,
  type P1bMeasuredCorpusReportAnalysisRevisionsV1,
} from "./measuredCorpusReport";
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
import { writeFixedOutputsTransactionally } from "./writeFixedOutputsTransactionally";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const corpusManifestPath = "ccsolver/corpus/manifest.v1.json";
const validityReportPath = "ccsolver/corpus/p1b-validity-report.v1.json";
const measuredCorpusPath = "ccsolver/corpus/p1b-measured-corpus.v1.json";
const curriculumPath = "ccsolver/corpus/p1b-curriculum.v1.json";
const keyPyramidDirectory = "ccsolver/fixtures/golden/p1b/cclp1-001";
const keyPyramidOccurrenceId = "cclp1/001";
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

const ANALYSIS_REVISIONS = {
  artifactProducerRevision: "ccsolver:p1b-cross-ruleset-topology-v1",
  importProfileRevision: "tworld-legacy-dat-static:v1",
  factsAnalyzerRevision: "ccsolver-static-level-facts:p0c1-v1",
  staticAnalyzerRevision: "ccsolver-static-topology:p1a-v1",
  msAdapterRevision: "tworld-ms-level-facts:p0c1-v1",
  lynxAdapterRevision: "tworld-lynx-level-facts:p1b-v1",
} as const;

const CURRICULUM_PRODUCER_REVISION = "ccsolver:p1b-curriculum-v1";

const FORBIDDEN_DONOR_METADATA = [
  "\"bestTimeTicks\":",
  "\"containsDiagonalInput\":",
  "\"containsMouseInput\":",
  "\"entryByteLength\":",
  "\"entryOrdinal\":",
  "\"entrySha256\":",
  "\"flags\":",
  "\"moveCount\":",
  "\"password\":",
  "\"randomSeed\":",
  "\"randomSlideDirection\":",
  "\"seriesConfigPath\":",
  "\"stepping\":",
  ".tws",
] as const;

type Operation = "check" | "write";

interface GeneratedOutput {
  readonly path: string;
  readonly canonicalJson: CanonicalJson;
}

interface VerifiedOccurrenceSource {
  readonly sourcePath: string;
  readonly containerBytes: Uint8Array;
  readonly layerData: readonly Uint8Array[];
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
  const absolutePath = resolve(root, corpusManifestPath);
  let checkedIn: string;
  try {
    checkedIn = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new Error(`checked-in corpus manifest is missing: ${corpusManifestPath}`, {
      cause: error,
    });
  }
  let manifest: CorpusManifestV1;
  try {
    manifest = JSON.parse(checkedIn) as CorpusManifestV1;
  } catch (error) {
    throw new Error(`checked-in corpus manifest is invalid JSON: ${corpusManifestPath}`, {
      cause: error,
    });
  }
  if (canonicalizeJson(manifest) !== checkedIn) {
    throw new Error(`checked-in corpus manifest is not canonical: ${corpusManifestPath}`);
  }
  return manifest;
}

async function verifiedOccurrenceSource(
  root: string,
  occurrence: P1bCorpusOccurrenceV1,
  sha256: Sha256Port,
): Promise<VerifiedOccurrenceSource> {
  const members = [...occurrence.sourceMembers].sort((left, right) =>
    left.ordinal - right.ordinal,
  );
  if (members.length === 0 || members.some((member, index) => member.ordinal !== index)) {
    throw new Error(`corpus source member order is invalid: ${occurrence.occurrenceId}`);
  }
  const sourcePath = members[0]!.sourcePath;
  if (members.some((member) => member.sourcePath !== sourcePath)) {
    throw new Error(`corpus occurrence spans source containers: ${occurrence.occurrenceId}`);
  }
  const containerBytes = new Uint8Array(await readFile(resolve(root, sourcePath)));
  const layerData: Uint8Array[] = [];
  for (const member of members) {
    const end = member.byteOffset + member.byteLength;
    if (!Number.isSafeInteger(end) || end > containerBytes.byteLength) {
      throw new Error(
        `corpus source member exceeds source bytes: ${occurrence.occurrenceId}/${member.ordinal}`,
      );
    }
    const bytes = containerBytes.slice(member.byteOffset, end);
    const actualDigest = await identifyBytes(bytes, sha256);
    if (actualDigest !== `sha256:${member.sha256}`) {
      throw new Error(
        `corpus source member digest mismatch: ${occurrence.occurrenceId}/${member.ordinal}`,
      );
    }
    layerData.push(bytes);
  }
  return { sourcePath, containerBytes, layerData };
}

function analysisRevisions(corpusRevision: string): P1bMeasuredCorpusReportAnalysisRevisionsV1 {
  return {
    ...ANALYSIS_REVISIONS,
    catalogRevision: corpusRevision,
    msPolicyRevision: `tworld-ms-static-topology:${corpusRevision}`,
    lynxPolicyRevision: `tworld-lynx-static-topology:${corpusRevision}`,
  };
}

function assertDonorMetadataAbsent(path: string, canonicalJson: CanonicalJson): void {
  const leaked = FORBIDDEN_DONOR_METADATA.find((token) => canonicalJson.includes(token));
  if (leaked !== undefined) {
    throw new Error(`donor replay metadata leaked into ${path}: ${leaked}`);
  }
}

function sameContentReference(
  left: { readonly digest: string; readonly byteLength: number },
  right: { readonly digest: string; readonly byteLength: number },
): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
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

  // This is deliberately first: it rehashes every whole DAT pin and every
  // member slice named by the checked P1A manifest before target semantics run.
  const validity = await buildP1bCorpusValidityReport({ manifest, source, sha256 });
  const validityCanonical = canonicalP1bCorpusValidityReportJson(validity);
  const revisions = analysisRevisions(manifest.source.revision);
  const shardDiagnostics: ShardDiagnostic[] = [];
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "tworld-p1b-measurement-"));
  process.stdout.write(
    `P1B validity: ${validity.summary.validPairedOccurrenceCount} valid paired cases; `
    + `starting ${maxWorkers} process workers.\n`,
  );
  let measured: P1bMeasuredCorpusReportBundle;
  try {
    measured = await buildP1bMeasuredCorpusReportSharded({
      validityReport: validity,
      sha256,
      analysisRevisions: revisions,
      maxWorkers,
      runShard: (input) => runMeasurementShard(
        temporaryDirectory,
        input,
        shardDiagnostics,
      ),
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  const curriculum = buildP1bCurriculumManifest({
    producerRevision: CURRICULUM_PRODUCER_REVISION,
    source: {
      corpusManifest: validity.source.corpusManifest,
      corpusValidityReport: measured.report.source.corpusValidityReport,
      measuredCorpusReport: measured.content,
      corpusRevision: validity.source.corpusRevision,
      validityPolicyRevision: validity.source.validityPolicyRevision,
    },
    corpusOccurrences: validity.occurrences,
    syntheticFixtures: P1B_PHASE_A_SYNTHETIC_FIXTURES,
    measuredCases: measured.report.cases,
  });

  const keyPyramid = validity.occurrences.find((occurrence) =>
    occurrence.occurrenceId === keyPyramidOccurrenceId,
  );
  if (keyPyramid === undefined) {
    throw new Error(`checked corpus occurrence is absent: ${keyPyramidOccurrenceId}`);
  }
  if (!keyPyramid.paired || keyPyramid.validity.status !== "valid") {
    throw new Error(`checked corpus occurrence is not valid and paired: ${keyPyramidOccurrenceId}`);
  }
  const keyPyramidSource = await verifiedOccurrenceSource(repositoryRoot, keyPyramid, sha256);
  const paired = await buildTworldPairedStaticAnalysis({
    occurrenceId: artifactOccurrenceIdForCorpusOccurrence(keyPyramid.occurrenceId),
    producerRevision: revisions.artifactProducerRevision,
    repository: "tworld",
    repositoryRevision: manifest.source.revision,
    sourcePath: keyPyramidSource.sourcePath,
    importProfileRevision: revisions.importProfileRevision,
    analyzerRevision: revisions.factsAnalyzerRevision,
    staticAnalyzerRevision: revisions.staticAnalyzerRevision,
    catalogRevision: revisions.catalogRevision,
    msAdapterRevision: revisions.msAdapterRevision,
    lynxAdapterRevision: revisions.lynxAdapterRevision,
    msPolicyRevision: revisions.msPolicyRevision,
    lynxPolicyRevision: revisions.lynxPolicyRevision,
    containerBytes: keyPyramidSource.containerBytes,
    loaded: {
      levelData: keyPyramidSource.layerData[0]!,
      layerData: keyPyramidSource.layerData,
    },
  }, sha256);
  const measuredKeyPyramid = measured.report.cases.find((entry) =>
    entry.occurrenceId === keyPyramidOccurrenceId,
  );
  if (
    measuredKeyPyramid === undefined
    || !sameContentReference(measuredKeyPyramid.targets[0].levelFacts, paired.ms.levelFactsContent)
    || !sameContentReference(
      measuredKeyPyramid.targets[0].topologyEvidence,
      paired.ms.topology.content,
    )
    || !sameContentReference(
      measuredKeyPyramid.targets[0].staticAnalysis,
      paired.ms.analysisContent,
    )
    || !sameContentReference(
      measuredKeyPyramid.targets[1].levelFacts,
      paired.lynx.levelFactsContent,
    )
    || !sameContentReference(
      measuredKeyPyramid.targets[1].topologyEvidence,
      paired.lynx.topology.content,
    )
    || !sameContentReference(
      measuredKeyPyramid.targets[1].staticAnalysis,
      paired.lynx.analysisContent,
    )
    || !sameContentReference(measuredKeyPyramid.comparison.content, paired.comparisonContent)
  ) {
    throw new Error("Key Pyramid goldens disagree with the measured corpus evidence");
  }

  const outputs: GeneratedOutput[] = [
    { path: validityReportPath, canonicalJson: validityCanonical },
    { path: measuredCorpusPath, canonicalJson: measured.canonicalJson },
    { path: curriculumPath, canonicalJson: canonicalizeJson(curriculum) },
    {
      path: `${keyPyramidDirectory}/ms/level-facts.v1.json`,
      canonicalJson: encodeArtifact(paired.ms.levelFacts.facts),
    },
    {
      path: `${keyPyramidDirectory}/ms/topology-evidence.v1.json`,
      canonicalJson: paired.ms.topology.canonicalJson,
    },
    {
      path: `${keyPyramidDirectory}/ms/static-analysis.v1.json`,
      canonicalJson: paired.ms.analysisCanonicalJson,
    },
    {
      path: `${keyPyramidDirectory}/ms/dossier-data.v1.json`,
      canonicalJson: paired.ms.dossierCanonicalJson,
    },
    {
      path: `${keyPyramidDirectory}/lynx/level-facts.v1.json`,
      canonicalJson: encodeArtifact(paired.lynx.levelFacts.facts),
    },
    {
      path: `${keyPyramidDirectory}/lynx/topology-evidence.v1.json`,
      canonicalJson: paired.lynx.topology.canonicalJson,
    },
    {
      path: `${keyPyramidDirectory}/lynx/static-analysis.v1.json`,
      canonicalJson: paired.lynx.analysisCanonicalJson,
    },
    {
      path: `${keyPyramidDirectory}/lynx/dossier-data.v1.json`,
      canonicalJson: paired.lynx.dossierCanonicalJson,
    },
    {
      path: `${keyPyramidDirectory}/comparison/static-topology-comparison.v1.json`,
      canonicalJson: paired.comparisonCanonicalJson,
    },
  ];

  for (const output of outputs.slice(0, 3)) {
    assertDonorMetadataAbsent(output.path, output.canonicalJson);
  }

  return {
    outputs,
    validOccurrenceCount: validity.summary.validOccurrenceCount,
    invalidOccurrenceCount: validity.summary.invalidOccurrenceCount,
    measuredOccurrenceCount: measured.report.summary.measuredOccurrenceCount,
    parityOccurrenceCount: measured.report.summary.parityOccurrenceCount,
    divergentOccurrenceCount: measured.report.summary.divergentOccurrenceCount,
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
