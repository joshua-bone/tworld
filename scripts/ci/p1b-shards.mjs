#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProofReceipt,
  canonicalJson as canonicalProofJson,
  verifyProofReceiptReuse,
} from "./proof-receipt.mjs";

const P1B_SPEC_PATH = "scripts/ci/proof-specs/p1b.json";
const P1B_RECEIPT_PATH = "scripts/ci/proof-receipts/p1b.receipt.json";
const DRIVER_PATH =
  "web/src/ccsolver-runtime/compose/p1b-curriculum/runP1bDistributedShards.ts";
const WORKER_ENTRY_PATH =
  "web/src/ccsolver-runtime/compose/p1b-curriculum/measureP1bShardCases.ts";
const SEMANTIC_CONTROL_PATHS = [
  ".nvmrc",
  "ccsolver/src/adapters/web-crypto/index.ts",
  "ccsolver/package.json",
  "ccsolver/tsconfig.base.json",
  "ccsolver/tsconfig.json",
  "package-lock.json",
  "package.json",
  "web/package.json",
  "web/tsconfig.base.json",
  "web/tsconfig.tools.json",
  "web/vite.config.ts",
];
const SEMANTIC_DOMAIN = "tworld.p1b.semantic-producer/v1";
const MAX_FORWARD_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_FORWARD_REQUEST_BYTES = 512 * 1024;
const MAX_FORWARD_RESULT_BYTES = 2 * 1024 * 1024;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SHARD_ID = /^0[0-7]-[0-9a-f]{64}$/u;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs"];
const WEB_ALIASES = [
  ["@content/", "web/src/content/"],
  ["@game-core/", "web/src/game-core/"],
  ["@game-runtime/", "web/src/game-runtime/"],
  ["@level-catalog/", "web/src/level-catalog/"],
  ["@oracle-fixtures/", "web/src/oracle-fixtures/"],
  ["@replay-verifier/", "web/src/replay-verifier/"],
  ["@ruleset-lynx/", "web/src/ruleset-lynx/"],
  ["@ruleset-ms/", "web/src/ruleset-ms/"],
  ["@undo-runtime/", "web/src/undo-runtime/"],
];

class P1bShardCliError extends Error {}

function fail(message) {
  throw new P1bShardCliError(message);
}

function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(compareBytes).map((key) =>
      `${JSON.stringify(key)}:${canonicalValue(value[key])}`,
    ).join(",")}}`;
  }
  fail("canonical transport JSON accepts only safe JSON values");
}

export function canonicalTransportJson(value) {
  return canonicalValue(value);
}

function contentReferenceBytes(bytes) {
  return {
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    byteLength: bytes.length,
  };
}

function contentReferenceJson(value) {
  return contentReferenceBytes(Buffer.from(canonicalProofJson(value)));
}

function updateFrame(hash, value) {
  const bytes = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
  hash.update(String(bytes.length));
  hash.update(":");
  hash.update(bytes);
  hash.update(",");
}

function repositoryPath(root, absolutePath) {
  const path = relative(resolve(root), absolutePath).split(sep).join("/");
  if (path === "" || path === ".." || path.startsWith("../")) {
    fail(`semantic producer file escapes repository root: ${absolutePath}`);
  }
  return path;
}

async function regularSourceFile(root, path) {
  const absolute = resolve(root, path);
  const normalized = repositoryPath(root, absolute);
  const stat = await lstat(absolute).catch(() => null);
  if (stat === null) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(`semantic producer entry is not a regular file: ${normalized}`);
  }
  const actual = await realpath(absolute);
  if (actual !== absolute) fail(`semantic producer path traverses a symlink: ${normalized}`);
  return { absolute, path: normalized, stat };
}

function valueModuleRequests(source) {
  const requests = new Set();
  const staticStatement = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gu;
  for (const match of source.matchAll(staticStatement)) {
    if (!match[1].trimStart().startsWith("type ")) requests.add(match[2]);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/gu)) {
    requests.add(match[1]);
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) {
    requests.add(match[1]);
  }
  return [...requests];
}

async function resolveSourceModule(root, importingPath, request) {
  let base;
  if (request.startsWith(".")) {
    base = resolve(dirname(importingPath), request);
  } else if (request.startsWith("@tworld/ccsolver/")) {
    const subpath = request.slice("@tworld/ccsolver/".length);
    base = resolve(root, subpath === "adapters/web-crypto"
      ? "ccsolver/src/adapters/web-crypto/index"
      : `ccsolver/src/${subpath}/index`);
  } else {
    const alias = WEB_ALIASES.find(([prefix]) => request.startsWith(prefix));
    if (alias === undefined) return null;
    base = resolve(root, `${alias[1]}${request.slice(alias[0].length)}`);
  }
  const bases = base.endsWith(".js") ? [base.slice(0, -3), base] : [base];
  for (const candidateBase of bases) {
    for (const suffix of SOURCE_EXTENSIONS) {
      const candidate = await regularSourceFile(root, `${candidateBase}${suffix}`);
      if (candidate !== null) return candidate.absolute;
    }
    for (const suffix of SOURCE_EXTENSIONS.slice(1)) {
      const candidate = await regularSourceFile(root, resolve(candidateBase, `index${suffix}`));
      if (candidate !== null) return candidate.absolute;
    }
  }
  fail(`unresolved semantic producer import in ${repositoryPath(root, importingPath)}: ${request}`);
}

export async function buildP1bSemanticProducerBinding({
  root = process.cwd(),
  entryPaths = [WORKER_ENTRY_PATH],
  controlPaths = SEMANTIC_CONTROL_PATHS,
} = {}) {
  const repositoryRoot = resolve(root);
  const pending = [];
  for (const path of [...entryPaths, ...controlPaths]) {
    const file = await regularSourceFile(repositoryRoot, path);
    if (file === null) fail(`semantic producer entry is missing: ${path}`);
    pending.push(file.absolute);
  }
  const seen = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    if (/\.(?:[cm]?js|tsx?)$/u.test(path)) {
      const source = await readFile(path, "utf8");
      for (const request of valueModuleRequests(source)) {
        const resolved = await resolveSourceModule(repositoryRoot, path, request);
        if (resolved !== null) pending.push(resolved);
      }
    }
  }
  const files = [];
  for (const absolute of seen) {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail(`semantic producer entry changed type: ${repositoryPath(repositoryRoot, absolute)}`);
    }
    files.push({
      bytes: await readFile(absolute),
      mode: (stat.mode & 0o111) === 0 ? "100644" : "100755",
      path: repositoryPath(repositoryRoot, absolute),
    });
  }
  files.sort((left, right) => compareBytes(left.path, right.path));
  const hash = createHash("sha256");
  hash.update(`${SEMANTIC_DOMAIN}\0`);
  let totalLength = 0;
  for (const file of files) {
    totalLength += file.bytes.length;
    updateFrame(hash, file.path);
    updateFrame(hash, file.mode);
    updateFrame(hash, String(file.bytes.length));
    updateFrame(hash, file.bytes);
  }
  return {
    content: {
      digest: `sha256:${hash.digest("hex")}`,
      byteLength: totalLength,
    },
    fileCount: files.length,
    paths: files.map((file) => file.path),
  };
}

export function p1bProofBindingFromReceipt(receipt) {
  if (receipt?.proofId !== "p1b") fail("P1B receipt has the wrong proof id");
  return {
    proofId: "p1b",
    producerContract: contentReferenceJson(receipt.producerContract),
    spec: contentReferenceJson(receipt.spec),
    inputs: contentReferenceJson(receipt.inputs),
  };
}

async function checkedBindings(root) {
  const verification = await verifyProofReceiptReuse({
    root,
    specPath: P1B_SPEC_PATH,
    receiptPath: P1B_RECEIPT_PATH,
  });
  if (!verification.currentValid) {
    fail(`current P1B receipt is invalid: ${canonicalProofJson(verification).trim()}`);
  }
  const receipt = await buildProofReceipt({ root, specPath: P1B_SPEC_PATH });
  const semantic = await buildP1bSemanticProducerBinding({ root });
  return {
    proof: p1bProofBindingFromReceipt(receipt),
    producer: { content: semantic.content, fileCount: semantic.fileCount },
  };
}

async function trustedBindings(root) {
  const trustedReceiptPath = resolve(root, P1B_RECEIPT_PATH);
  const verification = await verifyProofReceiptReuse({
    root,
    specPath: P1B_SPEC_PATH,
    receiptPath: P1B_RECEIPT_PATH,
    trustedReceiptPath,
  });
  if (!verification.currentValid || verification.decision !== "reuse") {
    fail(`trusted P1B authority is invalid: ${canonicalProofJson(verification).trim()}`);
  }
  return checkedBindings(root);
}

function exactOptions(argv, valueFlags, booleanFlags = []) {
  const allowedValues = new Set(valueFlags);
  const allowedBooleans = new Set(booleanFlags);
  const values = {};
  for (let index = 0; index < argv.length;) {
    const flag = argv[index];
    if (allowedBooleans.has(flag)) {
      if (Object.hasOwn(values, flag)) fail(`duplicate argument: ${flag}`);
      values[flag] = true;
      index += 1;
      continue;
    }
    if (!allowedValues.has(flag) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      fail(`invalid argument: ${flag ?? "<missing>"}`);
    }
    if (Object.hasOwn(values, flag)) fail(`duplicate argument: ${flag}`);
    values[flag] = argv[index + 1];
    index += 2;
  }
  return values;
}

function requireFlags(values, flags) {
  for (const flag of flags) {
    if (!values[flag]) fail(`missing argument: ${flag}`);
  }
}

function actualHead(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
  if (result.status !== 0) fail("could not resolve the checked-out HEAD revision");
  return result.stdout.trim();
}

async function assertRegularFile(path, maximumBytes, description) {
  const absolute = resolve(path);
  let current = isAbsolute(absolute) ? sep : "";
  for (const segment of absolute.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    const stat = await lstat(current).catch(() => null);
    if (stat === null) fail(`${description} is missing`);
    if (stat.isSymbolicLink()) fail(`${description} traverses a symlink`);
  }
  const stat = await lstat(absolute);
  if (!stat.isFile()) fail(`${description} is not a regular file`);
  if (stat.size > maximumBytes) fail(`${description} is oversized`);
  return readFile(absolute, "utf8");
}

function parseCanonicalTransport(text, description) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`${description} is invalid JSON`);
  }
  if (canonicalTransportJson(parsed) !== text) fail(`${description} is not canonical JSON`);
  return parsed;
}

function sameReference(left, right) {
  return left?.digest === right?.digest
    && left?.byteLength === right?.byteLength
    && SHA256_DIGEST.test(left.digest)
    && Number.isSafeInteger(left.byteLength)
    && left.byteLength >= 0;
}

function requireExactKeys(value, expected, description) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${description} must be an object`);
  }
  const actual = Object.keys(value).sort(compareBytes);
  const wanted = [...expected].sort(compareBytes);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${description} has an unsupported shape`);
  }
  return value;
}

export async function forwardP1bReconstructedShard({
  root,
  manifestPath,
  requestPath,
  reconstructedPath,
  outputPath,
}) {
  const manifestText = await assertRegularFile(
    manifestPath,
    MAX_FORWARD_MANIFEST_BYTES,
    "P1B manifest",
  );
  const requestText = await assertRegularFile(
    requestPath,
    MAX_FORWARD_REQUEST_BYTES,
    "P1B request",
  );
  const resultText = await assertRegularFile(
    reconstructedPath,
    MAX_FORWARD_RESULT_BYTES,
    "reconstructed P1B result",
  );
  const manifest = parseCanonicalTransport(manifestText, "P1B manifest");
  const request = parseCanonicalTransport(requestText, "P1B request");
  const result = parseCanonicalTransport(resultText, "reconstructed P1B result");
  requireExactKeys(manifest, [
    "artifact",
    "context",
    "measurement",
    "partition",
    "plan",
    "producer",
    "proof",
    "shards",
    "validity",
    "validityPolicyRevision",
    "version",
  ], "P1B manifest");
  requireExactKeys(request, [
    "artifact",
    "measurement",
    "occurrences",
    "partition",
    "producer",
    "validityPolicyRevision",
    "version",
  ], "P1B request");
  requireExactKeys(result, [
    "artifact",
    "cases",
    "casesContent",
    "context",
    "manifest",
    "partition",
    "plan",
    "request",
    "shardId",
    "version",
  ], "reconstructed P1B result");
  const actualPlan = contentReferenceBytes(Buffer.from(canonicalTransportJson({
    measurement: manifest.measurement,
    partition: manifest.partition,
    producer: manifest.producer,
    shards: manifest.shards,
    validity: manifest.validity,
    validityPolicyRevision: manifest.validityPolicyRevision,
  })));
  if (
    manifest?.artifact !== "ccsolver-p1b-distributed-measurement-manifest"
    || manifest?.version !== 1
    || manifest?.context?.headRevision !== actualHead(root)
    || !Array.isArray(manifest.shards)
    || !sameReference(manifest.plan, actualPlan)
  ) {
    fail("P1B manifest context is stale or unsupported");
  }
  const requestReference = contentReferenceBytes(Buffer.from(requestText));
  const descriptor = manifest.shards.find((entry) =>
    sameReference(entry?.request, requestReference),
  );
  if (
    descriptor === undefined
    || !SHARD_ID.test(descriptor.shardId)
    || requestPath.split(sep).at(-1) !== `${descriptor.shardId}.request.json`
    || request?.artifact !== "ccsolver-p1b-distributed-measurement-request"
    || request?.version !== 1
    || request?.partition?.shardIndex !== descriptor.shardIndex
    || request?.partition?.shardCount !== manifest.partition.shardCount
    || request?.partition?.startOccurrenceIndex !== descriptor.startOccurrenceIndex
    || request?.partition?.endOccurrenceIndex !== descriptor.endOccurrenceIndex
    || canonicalTransportJson(request.producer) !== canonicalTransportJson(manifest.producer)
    || request.validityPolicyRevision !== manifest.validityPolicyRevision
    || canonicalTransportJson(request.measurement) !== canonicalTransportJson(manifest.measurement)
    || !Array.isArray(request.occurrences)
    || request.occurrences.length !== descriptor.occurrenceIds.length
    || request.occurrences.some((entry, index) => entry?.occurrenceId !== descriptor.occurrenceIds[index])
  ) {
    fail("P1B request is foreign to its manifest");
  }
  const manifestReference = contentReferenceBytes(Buffer.from(manifestText));
  const casesReference = contentReferenceBytes(Buffer.from(canonicalTransportJson(result?.cases)));
  if (
    result?.artifact !== "ccsolver-p1b-distributed-measurement-result"
    || result?.version !== 1
    || result?.shardId !== descriptor.shardId
    || canonicalTransportJson(result.context) !== canonicalTransportJson(manifest.context)
    || !sameReference(result.manifest, manifestReference)
    || !sameReference(result.plan, manifest.plan)
    || !sameReference(result.request, descriptor.request)
    || !sameReference(result.casesContent, casesReference)
    || result?.partition?.shardIndex !== descriptor.shardIndex
    || result?.partition?.shardCount !== manifest.partition.shardCount
    || result?.partition?.startOccurrenceIndex !== descriptor.startOccurrenceIndex
    || result?.partition?.endOccurrenceIndex !== descriptor.endOccurrenceIndex
    || !Array.isArray(result.cases)
    || result.cases.length !== descriptor.occurrenceIds.length
    || result.cases.some((entry, index) => entry?.occurrenceId !== descriptor.occurrenceIds[index])
  ) {
    fail("reconstructed P1B result is stale, tampered, or foreign");
  }
  const expectedOutputName = `${descriptor.shardId}.result.json`;
  if (outputPath.split(sep).at(-1) !== expectedOutputName) {
    fail("P1B forwarded result output path is invalid");
  }
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), resultText, { encoding: "utf8", flag: "wx", mode: 0o644 });
}

export async function validateP1bDownloadedArtifactTree({
  manifestPath,
  requestsDirectory,
  resultsDirectory,
}) {
  const manifestText = await assertRegularFile(
    manifestPath,
    MAX_FORWARD_MANIFEST_BYTES,
    "P1B manifest",
  );
  const manifest = parseCanonicalTransport(manifestText, "P1B manifest");
  if (!Array.isArray(manifest?.shards) || manifest.shards.length !== 8) {
    fail("P1B manifest does not declare the fixed eight shards");
  }
  const shardIds = new Set();
  const requestNames = new Set();
  for (const [index, descriptor] of manifest.shards.entries()) {
    if (
      descriptor?.shardIndex !== index
      || !SHARD_ID.test(descriptor?.shardId)
      || descriptor.shardId.slice(0, 2) !== String(index).padStart(2, "0")
      || shardIds.has(descriptor.shardId)
    ) {
      fail("P1B manifest shard identities are invalid or duplicated");
    }
    shardIds.add(descriptor.shardId);
    requestNames.add(`${descriptor.shardId}.request.json`);
  }
  const requests = await readdir(resolve(requestsDirectory), { withFileTypes: true });
  if (
    requests.length !== requestNames.size
    || requests.some((entry) =>
      !entry.isFile() || entry.isSymbolicLink() || !requestNames.has(entry.name),
    )
  ) {
    fail("P1B request directory has missing, extra, symlink, or nonregular entries");
  }
  for (const name of requestNames) {
    await assertRegularFile(
      resolve(requestsDirectory, name),
      MAX_FORWARD_REQUEST_BYTES,
      `P1B request ${name}`,
    );
  }
  const resultRoots = await readdir(resolve(resultsDirectory), { withFileTypes: true });
  if (
    resultRoots.length !== shardIds.size
    || resultRoots.some((entry) =>
      !entry.isDirectory() || entry.isSymbolicLink() || !shardIds.has(entry.name),
    )
  ) {
    fail("P1B result root has missing, extra, symlink, or non-directory entries");
  }
  for (const shardId of shardIds) {
    const directory = resolve(resultsDirectory, shardId);
    const entries = await readdir(directory, { withFileTypes: true });
    const expected = `${shardId}.result.json`;
    if (
      entries.length !== 1
      || entries[0].name !== expected
      || !entries[0].isFile()
      || entries[0].isSymbolicLink()
    ) {
      fail(`P1B result directory is not exact: ${shardId}`);
    }
    await assertRegularFile(
      resolve(directory, expected),
      MAX_FORWARD_RESULT_BYTES,
      `P1B result ${shardId}`,
    );
  }
}

function runDriver(command, argv, environment) {
  const rootIndex = argv.indexOf("--root");
  const root = rootIndex >= 0 ? resolve(argv[rootIndex + 1]) : process.cwd();
  const driverArguments = [...argv];
  if (rootIndex >= 0) driverArguments[rootIndex + 1] = root;
  const viteNode = resolve(root, "web/node_modules/vite-node/vite-node.mjs");
  const driver = resolve(root, DRIVER_PATH);
  const result = spawnSync(process.execPath, [viteNode, driver, command, ...driverArguments], {
    cwd: resolve(root, "web"),
    env: { ...process.env, ...environment },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: command === "run" ? 45 * 60_000 : 15 * 60_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "forward") {
    const values = exactOptions(rest, [
      "--root",
      "--manifest",
      "--request",
      "--reconstructed",
      "--output",
    ]);
    requireFlags(values, ["--root", "--manifest", "--request", "--reconstructed", "--output"]);
    await forwardP1bReconstructedShard({
      root: resolve(values["--root"]),
      manifestPath: values["--manifest"],
      requestPath: values["--request"],
      reconstructedPath: values["--reconstructed"],
      outputPath: values["--output"],
    });
    return;
  }
  if (command !== "prepare" && command !== "run" && command !== "finalize") {
    fail(`unsupported P1B shard command: ${command ?? "<missing>"}`);
  }
  const valueFlags = command === "prepare"
    ? ["--root", "--head", "--run-id", "--run-attempt", "--output", "--github-output", "--trusted-root"]
    : command === "run"
      ? ["--root", "--manifest", "--request", "--output"]
      : ["--root", "--head", "--manifest", "--requests", "--results"];
  const values = exactOptions(rest, valueFlags, command === "finalize" ? ["--check"] : []);
  const required = command === "prepare"
    ? ["--root", "--head", "--run-id", "--run-attempt", "--output", "--github-output"]
    : command === "run"
      ? ["--root", "--manifest", "--request", "--output"]
      : ["--root", "--head", "--manifest", "--requests", "--results", "--check"];
  requireFlags(values, required);
  const root = resolve(values["--root"]);
  const environment = {};
  if (command === "prepare" || command === "finalize") {
    environment.TWORLD_P1B_CURRENT_BINDINGS = JSON.stringify(await checkedBindings(root));
  }
  if (command === "prepare" && values["--trusted-root"] !== undefined) {
    const trustedRoot = resolve(values["--trusted-root"]);
    try {
      environment.TWORLD_P1B_TRUSTED_BINDINGS = JSON.stringify(await trustedBindings(trustedRoot));
    } catch (error) {
      process.stderr.write(
        `Trusted P1B receipt authority unavailable; measuring all shards: `
        + `${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  if (command === "finalize") {
    await validateP1bDownloadedArtifactTree({
      manifestPath: values["--manifest"],
      requestsDirectory: values["--requests"],
      resultsDirectory: values["--results"],
    });
  }
  runDriver(command, rest, environment);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
