import { execFileSync } from "node:child_process";
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  parseCanonicalJson,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import type { CorpusManifestV1, CorpusSourcePort } from "../p1a-corpus/types";
import type { P1bMeasuredCorpusCaseV1 } from "./curriculumManifest";
import {
  buildP1bCorpusValidityReport,
  canonicalP1bCorpusValidityReportJson,
  type P1bCorpusValidityReportV1,
} from "./corpusValidityReport";
import { measureP1bShardCases } from "./measureP1bShardCases";
import {
  P1B_DISTRIBUTED_SHARD_COUNT,
  P1B_MAX_SHARD_MANIFEST_BYTES,
  P1B_MAX_SHARD_REQUEST_BYTES,
  P1B_MAX_SHARD_RESULT_BYTES,
  buildP1bMeasurementShardPlan,
  buildP1bMeasurementShardResult,
  parseP1bMeasurementShardManifest,
  reconstructP1bMeasurementShardResults,
  reduceP1bMeasurementShardResults,
  validateP1bMeasurementShardRequestArtifact,
  type P1bMeasurementShardPlan,
  type P1bShardProducerBindingV1,
  type P1bShardProofBindingV1,
} from "./measuredCorpusShardContract";
import {
  assembleP1bMeasuredCorpusReport,
  selectP1bValidPairedCorpusOccurrences,
  type P1bMeasuredCorpusReportV1,
} from "./measuredCorpusReport";
import {
  P1B_CORPUS_MANIFEST_PATH,
  P1B_MEASURED_CORPUS_PATH,
  buildP1bCheckedArtifactsFromValidity,
  p1bAnalysisRevisions,
} from "./p1bCheckedArtifacts";

const BINDINGS_ENVIRONMENT = "TWORLD_P1B_CURRENT_BINDINGS";
const TRUSTED_BINDINGS_ENVIRONMENT = "TWORLD_P1B_TRUSTED_BINDINGS";
const MAX_CORPUS_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_MEASURED_REPORT_BYTES = 16 * 1024 * 1024;

interface P1bDriverBindings {
  readonly proof: P1bShardProofBindingV1;
  readonly producer: P1bShardProducerBindingV1;
}

interface DriverArguments {
  readonly command: "prepare" | "run" | "finalize";
  readonly values: Readonly<Record<string, string | true>>;
}

function fail(message: string): never {
  throw new Error(message);
}

function parseArguments(argv: readonly string[]): DriverArguments {
  const [command, ...rest] = argv;
  if (command !== "prepare" && command !== "run" && command !== "finalize") {
    fail(`unsupported distributed P1B command: ${command ?? "<missing>"}`);
  }
  const valueFlags = command === "prepare"
    ? new Set([
        "--root",
        "--head",
        "--run-id",
        "--run-attempt",
        "--output",
        "--github-output",
        "--trusted-root",
      ])
    : command === "run"
      ? new Set(["--root", "--manifest", "--request", "--output"])
      : new Set(["--root", "--head", "--manifest", "--requests", "--results"]);
  const booleanFlags = command === "finalize" ? new Set(["--check"]) : new Set<string>();
  const values: Record<string, string | true> = {};
  for (let index = 0; index < rest.length;) {
    const flag = rest[index]!;
    if (booleanFlags.has(flag)) {
      if (Object.hasOwn(values, flag)) fail(`duplicate argument: ${flag}`);
      values[flag] = true;
      index += 1;
      continue;
    }
    const value = rest[index + 1];
    if (
      !valueFlags.has(flag)
      || value === undefined
      || value.startsWith("--")
      || Object.hasOwn(values, flag)
    ) {
      fail(`invalid argument: ${flag}`);
    }
    values[flag] = value;
    index += 2;
  }
  const required = command === "prepare"
    ? ["--root", "--head", "--run-id", "--run-attempt", "--output", "--github-output"]
    : command === "run"
      ? ["--root", "--manifest", "--request", "--output"]
      : ["--root", "--head", "--manifest", "--requests", "--results", "--check"];
  for (const flag of required) {
    if (!values[flag]) fail(`missing argument: ${flag}`);
  }
  return { command, values };
}

function stringArgument(values: DriverArguments["values"], flag: string): string {
  const value = values[flag];
  if (typeof value !== "string" || value.length === 0) fail(`missing argument: ${flag}`);
  return value;
}

function actualHead(root: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
  }).trim();
}

function assertHead(root: string, expected: string): void {
  const actual = actualHead(root);
  if (actual !== expected) {
    fail(`checked-out HEAD mismatch: expected ${expected}, received ${actual}`);
  }
}

async function readDirectRegularFile(
  path: string,
  maximumBytes: number,
  description: string,
): Promise<string> {
  const absolute = resolve(path);
  const stat = await lstat(absolute).catch(() => null);
  if (
    stat === null
    || stat.isSymbolicLink()
    || !stat.isFile()
    || stat.size > maximumBytes
    || await realpath(absolute) !== absolute
  ) {
    fail(`${description} is missing, indirect, nonregular, or oversized`);
  }
  const text = await readFile(absolute, "utf8");
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    fail(`${description} is oversized`);
  }
  return text;
}

async function writeExclusive(path: string, text: string): Promise<void> {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory() || await realpath(parent) !== parent) {
    fail(`output parent is indirect or non-directory: ${parent}`);
  }
  await writeFile(absolute, text, { encoding: "utf8", flag: "wx", mode: 0o644 });
}

function repositorySource(root: string): CorpusSourcePort {
  const repositoryRoot = resolve(root);
  return {
    async readBytes(path) {
      const absolute = resolve(repositoryRoot, path);
      const relativePath = relative(repositoryRoot, absolute);
      if (relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath)) {
        fail(`repository source escapes root: ${path}`);
      }
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink() || !stat.isFile() || await realpath(absolute) !== absolute) {
        fail(`repository source is indirect or nonregular: ${path}`);
      }
      return new Uint8Array(await readFile(absolute));
    },
  };
}

async function readCorpusManifest(root: string): Promise<CorpusManifestV1> {
  const path = resolve(root, P1B_CORPUS_MANIFEST_PATH);
  const text = await readDirectRegularFile(path, MAX_CORPUS_MANIFEST_BYTES, "P1B corpus manifest");
  let manifest: CorpusManifestV1;
  try {
    manifest = parseCanonicalJson(text) as unknown as CorpusManifestV1;
  } catch (error) {
    throw new Error("P1B corpus manifest is not canonical JSON", { cause: error });
  }
  return manifest;
}

function bindingsFromEnvironment(name: string, required: boolean): P1bDriverBindings | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    if (required) fail(`${name} is required`);
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} is invalid JSON`, { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${name} has an unsupported shape`);
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "producer,proof") {
    fail(`${name} has an unsupported shape`);
  }
  return parsed as P1bDriverBindings;
}

async function buildValidity(root: string): Promise<{
  readonly manifest: CorpusManifestV1;
  readonly report: P1bCorpusValidityReportV1;
}> {
  const manifest = await readCorpusManifest(root);
  const report = await buildP1bCorpusValidityReport({
    manifest,
    source: repositorySource(root),
    sha256: new WebCryptoSha256(),
  });
  return { manifest, report };
}

async function planFor(input: {
  readonly root: string;
  readonly context: {
    readonly repository: "joshua-bone/tworld";
    readonly headRevision: string;
    readonly runId: string;
    readonly runAttempt: number;
  };
  readonly bindings: P1bDriverBindings;
}): Promise<{
  readonly plan: P1bMeasurementShardPlan;
  readonly manifest: CorpusManifestV1;
  readonly validity: P1bCorpusValidityReportV1;
}> {
  const { manifest, report: validity } = await buildValidity(input.root);
  const validityCanonical = canonicalP1bCorpusValidityReportJson(validity);
  const sha256 = new WebCryptoSha256();
  const plan = await buildP1bMeasurementShardPlan({
    context: input.context,
    proof: input.bindings.proof,
    producer: input.bindings.producer,
    validity: await referenceCanonicalJson(validityCanonical, sha256),
    validityPolicyRevision: validity.source.validityPolicyRevision,
    measurement: {
      corpusRevision: validity.source.corpusRevision,
      artifactRepositoryId: validity.source.artifactRepositoryId,
      analysisRevisions: p1bAnalysisRevisions(manifest.source.revision),
    },
    occurrences: selectP1bValidPairedCorpusOccurrences(validity),
    sha256,
  });
  return { plan, manifest, validity };
}

async function trustedCasesAndPlan(input: {
  readonly root: string;
  readonly bindings: P1bDriverBindings;
  readonly currentContext: P1bMeasurementShardPlan["manifest"]["artifact"]["context"];
}): Promise<{
  readonly cases: readonly P1bMeasuredCorpusCaseV1[];
  readonly plan: P1bMeasurementShardPlan;
}> {
  const headRevision = actualHead(input.root);
  const trusted = await planFor({
    root: input.root,
    context: { ...input.currentContext, headRevision },
    bindings: input.bindings,
  });
  const reportText = await readDirectRegularFile(
    resolve(input.root, P1B_MEASURED_CORPUS_PATH),
    MAX_MEASURED_REPORT_BYTES,
    "trusted measured P1B report",
  );
  let report: P1bMeasuredCorpusReportV1;
  try {
    report = parseCanonicalJson(reportText) as unknown as P1bMeasuredCorpusReportV1;
  } catch (error) {
    throw new Error("trusted measured P1B report is not canonical", { cause: error });
  }
  const reassembled = await assembleP1bMeasuredCorpusReport({
    validityReport: trusted.validity,
    sha256: new WebCryptoSha256(),
    analysisRevisions: p1bAnalysisRevisions(trusted.manifest.source.revision),
    cases: report.cases,
  });
  if (reassembled.canonicalJson !== reportText) {
    fail("trusted measured P1B report disagrees with recomputed validity");
  }
  return { cases: reassembled.report.cases, plan: trusted.plan };
}

async function prepare(values: DriverArguments["values"]): Promise<void> {
  const root = resolve(stringArgument(values, "--root"));
  const head = stringArgument(values, "--head");
  assertHead(root, head);
  const runAttemptText = stringArgument(values, "--run-attempt");
  if (!/^[1-9][0-9]*$/u.test(runAttemptText)) fail("run attempt must be a positive integer");
  const context = {
    repository: "joshua-bone/tworld" as const,
    headRevision: head,
    runId: stringArgument(values, "--run-id"),
    runAttempt: Number(runAttemptText),
  };
  const bindings = bindingsFromEnvironment(BINDINGS_ENVIRONMENT, true)!;
  const current = await planFor({ root, context, bindings });
  let reconstructed: Awaited<ReturnType<typeof reconstructP1bMeasurementShardResults>> = {
    pendingShardIds: current.plan.requests.map((entry) => entry.shardId),
    results: [],
  };
  const trustedRootValue = values["--trusted-root"];
  const trustedBindings = bindingsFromEnvironment(TRUSTED_BINDINGS_ENVIRONMENT, false);
  if (typeof trustedRootValue === "string" && trustedBindings !== undefined) {
    try {
      const trusted = await trustedCasesAndPlan({
        root: resolve(trustedRootValue),
        bindings: trustedBindings,
        currentContext: context,
      });
      reconstructed = await reconstructP1bMeasurementShardResults({
        current: current.plan,
        trusted: trusted.plan,
        trustedCases: trusted.cases,
        sha256: new WebCryptoSha256(),
      });
    } catch (error) {
      process.stderr.write(
        `Trusted P1B shard reconstruction unavailable; measuring all shards: `
        + `${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  const output = resolve(stringArgument(values, "--output"));
  await mkdir(output);
  await mkdir(resolve(output, "requests"));
  await mkdir(resolve(output, "reconstructed-results"));
  await writeExclusive(resolve(output, "manifest.json"), current.plan.manifest.canonicalJson);
  for (const request of current.plan.requests) {
    await writeExclusive(resolve(output, request.requestPath), request.canonicalJson);
  }
  for (const result of reconstructed.results) {
    await writeExclusive(
      resolve(output, "reconstructed-results", `${result.shardId}.result.json`),
      result.canonicalJson,
    );
  }
  const pending = new Set(reconstructed.pendingShardIds);
  const matrix = {
    include: current.plan.requests.map((request) => ({
      artifact_name:
        `p1b-shard-${context.runId}-${context.runAttempt}-${context.headRevision}-${request.shardId}`,
      measure: pending.has(request.shardId),
      shard_id: request.shardId,
      shard_index: request.request.partition.shardIndex,
    })),
  };
  await appendFile(stringArgument(values, "--github-output"), [
    `needs_shards=true`,
    `shard_count=${P1B_DISTRIBUTED_SHARD_COUNT}`,
    `shard_matrix=${canonicalizeJson(matrix)}`,
    "",
  ].join("\n"), "utf8");
  process.stdout.write(canonicalizeJson({
    measuredShardCount: pending.size,
    reconstructedShardCount: reconstructed.results.length,
    shardCount: P1B_DISTRIBUTED_SHARD_COUNT,
    status: "prepared",
  }));
  process.stdout.write("\n");
}

async function runShard(values: DriverArguments["values"]): Promise<void> {
  const root = resolve(stringArgument(values, "--root"));
  const manifestPath = resolve(stringArgument(values, "--manifest"));
  const requestPath = resolve(stringArgument(values, "--request"));
  const manifestText = await readDirectRegularFile(
    manifestPath,
    P1B_MAX_SHARD_MANIFEST_BYTES,
    "P1B shard manifest",
  );
  const requestText = await readDirectRegularFile(
    requestPath,
    P1B_MAX_SHARD_REQUEST_BYTES,
    "P1B shard request",
  );
  const requestRelativePath = `requests/${basename(requestPath)}`;
  const verified = await validateP1bMeasurementShardRequestArtifact({
    manifestCanonicalJson: manifestText,
    requestPath: requestRelativePath,
    requestCanonicalJson: requestText,
    sha256: new WebCryptoSha256(),
  });
  assertHead(root, verified.manifest.artifact.context.headRevision);
  const startedAt = performance.now();
  const cases = await measureP1bShardCases({
    repositoryRoot: root,
    request: verified.request.request,
    sha256: new WebCryptoSha256(),
  });
  const result = await buildP1bMeasurementShardResult({
    manifest: verified.manifest,
    request: verified.request,
    cases,
    sha256: new WebCryptoSha256(),
  });
  const outputPath = resolve(stringArgument(values, "--output"));
  if (basename(outputPath) !== `${result.shardId}.result.json`) {
    fail("P1B shard output path disagrees with the request");
  }
  await writeExclusive(outputPath, result.canonicalJson);
  process.stdout.write(
    `P1B shard ${result.shardId}: ${cases.length} cases in `
    + `${Math.round(performance.now() - startedAt)} ms; `
    + `${Math.ceil(process.resourceUsage().maxRSS / 1_024)} MiB max RSS.\n`,
  );
}

async function exactRequestArtifacts(
  directory: string,
  expected: P1bMeasurementShardPlan["requests"],
): Promise<readonly { readonly path: string; readonly canonicalJson: string }[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const expectedNames = new Set(expected.map((entry) => basename(entry.requestPath)));
  if (
    entries.length !== expectedNames.size
    || entries.some((entry) => !entry.isFile() || entry.isSymbolicLink() || !expectedNames.has(entry.name))
  ) {
    fail("P1B request directory has missing, extra, symlink, or nonregular entries");
  }
  return Promise.all(expected.map(async (entry) => ({
    path: entry.requestPath,
    canonicalJson: await readDirectRegularFile(
      resolve(directory, basename(entry.requestPath)),
      P1B_MAX_SHARD_REQUEST_BYTES,
      `P1B request ${entry.shardId}`,
    ),
  })));
}

async function exactResultArtifacts(
  directory: string,
  expected: P1bMeasurementShardPlan["requests"],
): Promise<readonly { readonly path: string; readonly canonicalJson: string }[]> {
  const rootEntries = await readdir(directory, { withFileTypes: true });
  const expectedDirectories = new Set(expected.map((entry) => entry.shardId));
  if (
    rootEntries.length !== expectedDirectories.size
    || rootEntries.some((entry) =>
      !entry.isDirectory() || entry.isSymbolicLink() || !expectedDirectories.has(entry.name),
    )
  ) {
    fail("P1B result root has missing, extra, symlink, or non-directory entries");
  }
  return Promise.all(expected.map(async (entry) => {
    const shardDirectory = resolve(directory, entry.shardId);
    const names = await readdir(shardDirectory, { withFileTypes: true });
    const expectedName = `${entry.shardId}.result.json`;
    if (
      names.length !== 1
      || names[0]!.name !== expectedName
      || !names[0]!.isFile()
      || names[0]!.isSymbolicLink()
    ) {
      fail(`P1B result directory is not exact: ${entry.shardId}`);
    }
    return {
      path: entry.resultPath,
      canonicalJson: await readDirectRegularFile(
        resolve(shardDirectory, expectedName),
        P1B_MAX_SHARD_RESULT_BYTES,
        `P1B result ${entry.shardId}`,
      ),
    };
  }));
}

async function finalize(values: DriverArguments["values"]): Promise<void> {
  const root = resolve(stringArgument(values, "--root"));
  const head = stringArgument(values, "--head");
  assertHead(root, head);
  const manifestText = await readDirectRegularFile(
    resolve(stringArgument(values, "--manifest")),
    P1B_MAX_SHARD_MANIFEST_BYTES,
    "P1B shard manifest",
  );
  const received = await parseP1bMeasurementShardManifest(
    manifestText,
    new WebCryptoSha256(),
  );
  if (received.artifact.context.headRevision !== head) {
    fail("P1B shard manifest is bound to a different HEAD");
  }
  if (
    process.env.GITHUB_RUN_ID !== undefined
    && process.env.GITHUB_RUN_ID !== received.artifact.context.runId
  ) {
    fail("P1B shard manifest is bound to a different workflow run");
  }
  if (
    process.env.GITHUB_RUN_ATTEMPT !== undefined
    && Number(process.env.GITHUB_RUN_ATTEMPT) !== received.artifact.context.runAttempt
  ) {
    fail("P1B shard manifest is bound to a different workflow attempt");
  }
  const recomputed = await planFor({
    root,
    context: received.artifact.context,
    bindings: bindingsFromEnvironment(BINDINGS_ENVIRONMENT, true)!,
  });
  if (recomputed.plan.manifest.canonicalJson !== manifestText) {
    fail("P1B shard manifest disagrees with the independently recomputed current plan");
  }
  const requestArtifacts = await exactRequestArtifacts(
    resolve(stringArgument(values, "--requests")),
    recomputed.plan.requests,
  );
  const resultArtifacts = await exactResultArtifacts(
    resolve(stringArgument(values, "--results")),
    recomputed.plan.requests,
  );
  const cases = await reduceP1bMeasurementShardResults({
    manifestCanonicalJson: manifestText,
    requestArtifacts,
    resultArtifacts,
    sha256: new WebCryptoSha256(),
  });
  const generated = await buildP1bCheckedArtifactsFromValidity({
    manifest: recomputed.manifest,
    source: repositorySource(root),
    sha256: new WebCryptoSha256(),
    validityReport: recomputed.validity,
    async resolveMeasuredCases({ validityReport, measurement }) {
      const expected = await buildP1bMeasurementShardPlan({
        context: received.artifact.context,
        proof: received.artifact.proof,
        producer: received.artifact.producer,
        validity: await referenceCanonicalJson(
          canonicalP1bCorpusValidityReportJson(validityReport),
          new WebCryptoSha256(),
        ),
        validityPolicyRevision: validityReport.source.validityPolicyRevision,
        measurement,
        occurrences: selectP1bValidPairedCorpusOccurrences(validityReport),
        sha256: new WebCryptoSha256(),
      });
      if (expected.manifest.canonicalJson !== manifestText) {
        fail("P1B final output builder observed a different shard plan");
      }
      return cases;
    },
  });
  for (const output of generated.outputs) {
    const checked = await readDirectRegularFile(
      resolve(root, output.path),
      64 * 1024 * 1024,
      `checked P1B output ${output.path}`,
    );
    if (checked !== output.canonicalJson) {
      fail(`checked-in P1B artifact is stale: ${output.path}`);
    }
  }
  process.stdout.write(
    `Verified ${generated.outputs.length} distributed P1B artifacts from `
    + `${cases.length} exact measured cases.\n`,
  );
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.command === "prepare") await prepare(parsed.values);
  else if (parsed.command === "run") await runShard(parsed.values);
  else await finalize(parsed.values);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
