#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PROOF_SPEC_SCHEMA = "tworld.proof-spec/v1";
export const PROOF_RECEIPT_SCHEMA = "tworld.proof-receipt/v1";
export const PROOF_DECISION_SCHEMA = "tworld.proof-reuse-decision/v1";
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const MAX_PATH_BYTES = 4096;
const MAX_SPEC_BYTES = 1024 * 1024;
const MAX_RECEIPT_BYTES = 64 * 1024 * 1024;
const HASH_DOMAIN = "tworld.proof-receipt/v1";
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const PROOF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

class ProofReceiptError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

function fail(code, details) {
  throw new ProofReceiptError(code, details);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalValue(value[key])}`
    )).join(",")}}`;
  }
  throw new TypeError("canonical JSON accepts only JSON values and safe integers");
}

export function canonicalJson(value) {
  return `${canonicalValue(value)}\n`;
}

function exactKeys(value, expected, context) {
  if (!isRecord(value)) {
    fail("invalid-object", { context });
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const unknown = actual.filter((key) => !wanted.includes(key));
  const missing = wanted.filter((key) => !actual.includes(key));
  if (unknown.length > 0) {
    fail("unknown-field", { context, fields: unknown });
  }
  if (missing.length > 0) {
    fail("missing-field", { context, fields: missing });
  }
}

function validateRepoPath(path, context) {
  if (
    typeof path !== "string"
    || path.length === 0
    || Buffer.byteLength(path) > MAX_PATH_BYTES
    || path.includes("\\")
    || path.includes("\0")
    || isAbsolute(path)
  ) {
    fail("invalid-path", { context, path });
  }
  const segments = path.split("/");
  if (
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || posix.normalize(path) !== path
  ) {
    fail("invalid-path", { context, path });
  }
  return path;
}

function comparePath(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function resolveRepoPath(root, path) {
  validateRepoPath(path, "repository path");
  const repositoryRoot = resolve(root);
  const absolute = resolve(repositoryRoot, ...path.split("/"));
  if (absolute !== repositoryRoot && !absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail("invalid-path", { path });
  }
  return absolute;
}

async function assertNoSymlinkAncestors(root, path, role, allowMissing = false) {
  const segments = validateRepoPath(path, role).split("/");
  let current = resolve(root);
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) return;
      if (error?.code === "ENOENT") fail(`${role}-missing`, { paths: [path] });
      throw error;
    }
    if (stat.isSymbolicLink()) {
      fail(`${role}-symlink`, { paths: [path] });
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      fail(`${role}-not-directory`, { paths: [path] });
    }
  }
}

function normalizedMode(stat) {
  return (stat.mode & 0o111) === 0 ? "100644" : "100755";
}

async function readScopedFile(root, path, role) {
  validateRepoPath(path, role);
  await assertNoSymlinkAncestors(root, path, role);
  const absolute = resolveRepoPath(root, path);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) fail(`${role}-symlink`, { paths: [path] });
  if (!stat.isFile()) fail(`${role}-not-file`, { paths: [path] });
  if (stat.size > MAX_ENTRY_BYTES) fail("entry-too-large", { context: role, paths: [path] });
  const bytes = await readFile(absolute);
  if (bytes.length > MAX_ENTRY_BYTES) fail("entry-too-large", { context: role, paths: [path] });
  return { bytes, mode: normalizedMode(stat), path };
}

async function walkTree(root, treePath, role) {
  validateRepoPath(treePath, role);
  await assertNoSymlinkAncestors(root, treePath, role);
  const absoluteRoot = resolveRepoPath(root, treePath);
  const rootStat = await lstat(absoluteRoot);
  if (!rootStat.isDirectory()) fail(`${role}-not-directory`, { paths: [treePath] });

  const files = [];
  let totalLength = 0;
  async function visit(relativeDirectory, absoluteDirectory) {
    const names = (await readdir(absoluteDirectory)).sort(comparePath);
    for (const name of names) {
      const relativePath = `${relativeDirectory}/${name}`;
      validateRepoPath(relativePath, role);
      const absolutePath = resolve(absoluteDirectory, name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) fail(`${role}-symlink`, { paths: [relativePath] });
      if (stat.isDirectory()) {
        await visit(relativePath, absolutePath);
      } else if (stat.isFile()) {
        if (stat.size > MAX_ENTRY_BYTES) {
          fail("entry-too-large", { context: role, paths: [relativePath] });
        }
        const bytes = await readFile(absolutePath);
        if (bytes.length > MAX_ENTRY_BYTES) {
          fail("entry-too-large", { context: role, paths: [relativePath] });
        }
        totalLength += bytes.length;
        if (totalLength > MAX_TOTAL_BYTES) fail("entries-too-large", { context: role });
        files.push({ bytes, mode: normalizedMode(stat), path: relativePath });
        if (files.length > MAX_ENTRIES) fail("too-many-entries", { context: role });
      } else {
        fail(`${role}-unsupported-entry`, { paths: [relativePath] });
      }
    }
  }
  await visit(treePath, absoluteRoot);
  return files;
}

function validateScopes(scopes, context) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    fail("invalid-scopes", { context });
  }
  let priorKey;
  return scopes.map((scope, index) => {
    exactKeys(scope, ["kind", "path"], `${context}[${index}]`);
    if (scope.kind !== "file" && scope.kind !== "tree") {
      fail("invalid-scope-kind", { context, kind: scope.kind });
    }
    validateRepoPath(scope.path, `${context}[${index}].path`);
    const key = `${scope.path}\0${scope.kind}`;
    if (priorKey !== undefined) {
      const order = comparePath(priorKey, key);
      if (order === 0) fail("duplicate-scope", { context, path: scope.path });
      if (order > 0) fail("unsorted-scope", { context, path: scope.path });
    }
    priorKey = key;
    return { kind: scope.kind, path: scope.path };
  });
}

function validateSpec(spec) {
  exactKeys(spec, [
    "inputScopes",
    "outputManifestPath",
    "outputScopes",
    "producerContract",
    "proofId",
    "schema",
  ], "spec");
  if (spec.schema !== PROOF_SPEC_SCHEMA) fail("unknown-spec-schema", { schema: spec.schema });
  if (typeof spec.proofId !== "string" || !PROOF_ID.test(spec.proofId)) {
    fail("invalid-proof-id", { proofId: spec.proofId });
  }
  if (
    typeof spec.producerContract !== "string"
    || spec.producerContract.length === 0
    || Buffer.byteLength(spec.producerContract) > 4096
  ) {
    fail("invalid-producer-contract");
  }
  const inputScopes = validateScopes(spec.inputScopes, "spec.inputScopes");
  const outputScopes = validateScopes(spec.outputScopes, "spec.outputScopes");
  if (spec.outputManifestPath !== null) {
    validateRepoPath(spec.outputManifestPath, "spec.outputManifestPath");
  }
  return {
    inputScopes,
    outputManifestPath: spec.outputManifestPath,
    outputScopes,
    producerContract: spec.producerContract,
    proofId: spec.proofId,
    schema: spec.schema,
  };
}

function updateFrame(hash, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(length);
  hash.update(bytes);
}

function digestFile(domain, file) {
  const hash = createHash("sha256");
  hash.update(`${HASH_DOMAIN}:${domain}\0`);
  updateFrame(hash, file.path);
  updateFrame(hash, file.mode);
  updateFrame(hash, String(file.bytes.length));
  updateFrame(hash, file.bytes);
  return hash.digest("hex");
}

function buildCollection(domain, files) {
  const sorted = [...files].sort((left, right) => comparePath(left.path, right.path));
  const seen = new Set();
  let totalLength = 0;
  const hash = createHash("sha256");
  hash.update(`${HASH_DOMAIN}:${domain}\0`);
  const entries = [];
  for (const file of sorted) {
    if (seen.has(file.path)) fail("duplicate-entry", { context: domain, path: file.path });
    seen.add(file.path);
    totalLength += file.bytes.length;
    if (totalLength > MAX_TOTAL_BYTES) fail("entries-too-large", { context: domain });
    updateFrame(hash, file.path);
    updateFrame(hash, file.mode);
    updateFrame(hash, String(file.bytes.length));
    updateFrame(hash, file.bytes);
    entries.push({
      digest: digestFile(`${domain}:entry`, file),
      length: file.bytes.length,
      mode: file.mode,
      path: file.path,
    });
  }
  return { digest: hash.digest("hex"), entries, totalLength };
}

async function expandScopes(root, scopes, role) {
  const files = [];
  let totalLength = 0;
  for (const scope of scopes) {
    if (scope.kind === "file") {
      const file = await readScopedFile(root, scope.path, role);
      files.push(file);
      totalLength += file.bytes.length;
    } else {
      const treeFiles = await walkTree(root, scope.path, role);
      files.push(...treeFiles);
      totalLength += treeFiles.reduce((sum, file) => sum + file.bytes.length, 0);
    }
    if (files.length > MAX_ENTRIES) fail("too-many-entries", { context: role });
    if (totalLength > MAX_TOTAL_BYTES) fail("entries-too-large", { context: role });
  }
  return files;
}

async function loadSpec(root, specPath) {
  validateRepoPath(specPath, "spec");
  await assertNoSymlinkAncestors(root, specPath, "spec");
  const absolutePath = resolveRepoPath(root, specPath);
  const stat = await lstat(absolutePath);
  if (!stat.isFile()) fail("spec-not-file", { paths: [specPath] });
  if (stat.size > MAX_SPEC_BYTES) fail("spec-too-large", { paths: [specPath] });
  const raw = await readFile(absolutePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("spec-invalid-json", { paths: [specPath] });
  }
  const spec = validateSpec(parsed);
  const canonicalBytes = Buffer.from(canonicalJson(spec));
  const descriptorFile = {
    bytes: canonicalBytes,
    mode: normalizedMode(stat),
    path: specPath,
  };
  return {
    descriptor: {
      digest: digestFile("spec", descriptorFile),
      length: canonicalBytes.length,
      mode: descriptorFile.mode,
      path: specPath,
    },
    spec,
  };
}

export async function buildProofReceipt({ root = process.cwd(), specPath }) {
  const { descriptor, spec } = await loadSpec(root, specPath);
  const inputs = buildCollection(
    "inputs",
    await expandScopes(root, spec.inputScopes, "input"),
  );
  const outputs = buildCollection(
    "outputs",
    await expandScopes(root, spec.outputScopes, "output"),
  );
  let outputManifest = null;
  if (spec.outputManifestPath !== null) {
    const file = await readScopedFile(root, spec.outputManifestPath, "output-manifest");
    outputManifest = {
      digest: digestFile("output-manifest", file),
      length: file.bytes.length,
      mode: file.mode,
      path: file.path,
    };
  }
  return {
    algorithm: "sha256",
    inputScopes: spec.inputScopes,
    inputs,
    outputManifest,
    outputScopes: spec.outputScopes,
    outputs,
    producerContract: spec.producerContract,
    proofId: spec.proofId,
    schema: PROOF_RECEIPT_SCHEMA,
    spec: descriptor,
  };
}

function validateDigest(value, context) {
  if (typeof value !== "string" || !HEX_SHA256.test(value)) {
    fail("invalid-digest", { context });
  }
}

function validateLength(value, context, maximum = MAX_ENTRY_BYTES) {
  if (!Number.isSafeInteger(value) || value < 0) fail("invalid-length", { context });
  if (value > maximum) fail("entry-too-large", { context });
}

function validateDescriptor(descriptor, context) {
  exactKeys(descriptor, ["digest", "length", "mode", "path"], context);
  validateDigest(descriptor.digest, `${context}.digest`);
  validateLength(descriptor.length, `${context}.length`);
  if (descriptor.mode !== "100644" && descriptor.mode !== "100755") {
    fail("invalid-mode", { context });
  }
  validateRepoPath(descriptor.path, `${context}.path`);
}

function validateCollection(collection, context) {
  exactKeys(collection, ["digest", "entries", "totalLength"], context);
  validateDigest(collection.digest, `${context}.digest`);
  if (!Array.isArray(collection.entries) || collection.entries.length > MAX_ENTRIES) {
    fail("too-many-entries", { context });
  }
  let priorPath;
  let totalLength = 0;
  for (const [index, entry] of collection.entries.entries()) {
    const entryContext = `${context}.entries[${index}]`;
    validateDescriptor(entry, entryContext);
    if (priorPath !== undefined) {
      const order = comparePath(priorPath, entry.path);
      if (order === 0) fail("duplicate-entry", { context, path: entry.path });
      if (order > 0) fail("unsorted-entry", { context, path: entry.path });
    }
    priorPath = entry.path;
    totalLength += entry.length;
    if (totalLength > MAX_TOTAL_BYTES) fail("entries-too-large", { context });
  }
  validateLength(collection.totalLength, `${context}.totalLength`, MAX_TOTAL_BYTES);
  if (collection.totalLength !== totalLength) fail("total-length-mismatch", { context });
}

function validateReceipt(receipt) {
  exactKeys(receipt, [
    "algorithm",
    "inputScopes",
    "inputs",
    "outputManifest",
    "outputScopes",
    "outputs",
    "producerContract",
    "proofId",
    "schema",
    "spec",
  ], "receipt");
  if (receipt.schema !== PROOF_RECEIPT_SCHEMA) {
    fail("unknown-receipt-schema", { schema: receipt.schema });
  }
  if (receipt.algorithm !== "sha256") fail("unknown-algorithm", { algorithm: receipt.algorithm });
  if (typeof receipt.proofId !== "string" || !PROOF_ID.test(receipt.proofId)) {
    fail("invalid-proof-id", { proofId: receipt.proofId });
  }
  if (
    typeof receipt.producerContract !== "string"
    || receipt.producerContract.length === 0
    || Buffer.byteLength(receipt.producerContract) > 4096
  ) {
    fail("invalid-producer-contract");
  }
  validateScopes(receipt.inputScopes, "receipt.inputScopes");
  validateScopes(receipt.outputScopes, "receipt.outputScopes");
  validateCollection(receipt.inputs, "receipt.inputs");
  validateCollection(receipt.outputs, "receipt.outputs");
  validateDescriptor(receipt.spec, "receipt.spec");
  if (receipt.outputManifest !== null) {
    validateDescriptor(receipt.outputManifest, "receipt.outputManifest");
  }
  return receipt;
}

async function readReceipt(path, role, repositoryRoot) {
  let absolutePath;
  if (repositoryRoot !== undefined) {
    validateRepoPath(path, role);
    await assertNoSymlinkAncestors(repositoryRoot, path, role);
    absolutePath = resolveRepoPath(repositoryRoot, path);
  } else {
    absolutePath = resolve(path);
  }
  let stat;
  try {
    stat = await lstat(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${role}-missing`);
    throw error;
  }
  if (stat.isSymbolicLink()) fail(`${role}-symlink`);
  if (!stat.isFile()) fail(`${role}-not-file`);
  if (stat.size > MAX_RECEIPT_BYTES) fail(`${role}-too-large`);
  const raw = await readFile(absolutePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${role}-invalid-json`);
  }
  validateReceipt(parsed);
  if (raw !== canonicalJson(parsed)) fail(`${role}-noncanonical`);
  return { parsed, raw };
}

function addReason(reasons, code, details = {}) {
  reasons.push({ code, ...details });
}

function sameJson(left, right) {
  return canonicalValue(left) === canonicalValue(right);
}

function compareEntries(reasons, kind, receiptEntries, actualEntries) {
  const receiptByPath = new Map(receiptEntries.map((entry) => [entry.path, entry]));
  const actualByPath = new Map(actualEntries.map((entry) => [entry.path, entry]));
  const extra = actualEntries.map(({ path }) => path).filter((path) => !receiptByPath.has(path));
  const missing = receiptEntries.map(({ path }) => path).filter((path) => !actualByPath.has(path));
  if (extra.length > 0) addReason(reasons, `${kind}-extra`, { paths: extra });
  if (missing.length > 0) addReason(reasons, `${kind}-missing`, { paths: missing });

  const driftFields = ["mode", "length", "digest"];
  for (const field of driftFields) {
    const paths = receiptEntries
      .filter((entry) => actualByPath.has(entry.path) && actualByPath.get(entry.path)[field] !== entry[field])
      .map(({ path }) => path);
    if (paths.length > 0) addReason(reasons, `${kind}-${field}-drift`, { paths });
  }
}

function compareManifest(reasons, receiptManifest, actualManifest) {
  if (receiptManifest === null || actualManifest === null) {
    if (receiptManifest !== actualManifest) addReason(reasons, "output-manifest-drift");
    return;
  }
  for (const field of ["path", "mode", "length", "digest"]) {
    if (receiptManifest[field] !== actualManifest[field]) {
      addReason(reasons, `output-manifest-${field}-drift`);
    }
  }
}

function compareCurrentReceipt(receipt, actual) {
  const reasons = [];
  if (!sameJson(receipt.spec, actual.spec)) addReason(reasons, "spec-drift");
  if (receipt.proofId !== actual.proofId) addReason(reasons, "proof-id-drift");
  if (receipt.producerContract !== actual.producerContract) {
    addReason(reasons, "producer-contract-drift");
  }
  if (!sameJson(receipt.inputScopes, actual.inputScopes)) addReason(reasons, "input-scope-drift");
  if (!sameJson(receipt.outputScopes, actual.outputScopes)) addReason(reasons, "output-scope-drift");
  compareEntries(reasons, "input", receipt.inputs.entries, actual.inputs.entries);
  compareEntries(reasons, "output", receipt.outputs.entries, actual.outputs.entries);
  if (receipt.inputs.digest !== actual.inputs.digest) addReason(reasons, "input-aggregate-drift");
  if (receipt.inputs.totalLength !== actual.inputs.totalLength) addReason(reasons, "input-total-length-drift");
  if (receipt.outputs.digest !== actual.outputs.digest) addReason(reasons, "output-aggregate-drift");
  if (receipt.outputs.totalLength !== actual.outputs.totalLength) addReason(reasons, "output-total-length-drift");
  compareManifest(reasons, receipt.outputManifest, actual.outputManifest);
  return reasons;
}

function errorReason(error) {
  if (error instanceof ProofReceiptError) return { code: error.code, ...error.details };
  return { code: "verification-error", error: error?.code ?? error?.name ?? "unknown" };
}

function decision(proofId, currentValid, reasons) {
  return {
    currentValid,
    decision: currentValid && reasons.length === 0 ? "reuse" : "heavy-required",
    proofId: proofId ?? null,
    reasons,
    schema: PROOF_DECISION_SCHEMA,
  };
}

export async function verifyProofReceiptReuse({
  receiptPath,
  root = process.cwd(),
  specPath,
  trustedReceiptPath,
}) {
  let current;
  try {
    current = await readReceipt(receiptPath, "current-receipt", root);
  } catch (error) {
    return decision(null, false, [errorReason(error)]);
  }

  let actual;
  try {
    actual = await buildProofReceipt({ root, specPath });
  } catch (error) {
    return decision(current.parsed.proofId, false, [errorReason(error)]);
  }

  const currentReasons = compareCurrentReceipt(current.parsed, actual);
  if (currentReasons.length === 0 && current.raw !== canonicalJson(actual)) {
    addReason(currentReasons, "current-receipt-stale");
  }
  if (currentReasons.length > 0) {
    return decision(current.parsed.proofId, false, currentReasons);
  }

  if (trustedReceiptPath === undefined) {
    return decision(current.parsed.proofId, true, [{ code: "trusted-receipt-missing" }]);
  }
  let trusted;
  try {
    trusted = await readReceipt(trustedReceiptPath, "trusted-receipt");
  } catch (error) {
    return decision(current.parsed.proofId, true, [errorReason(error)]);
  }
  if (current.raw !== trusted.raw) {
    return decision(current.parsed.proofId, true, [{ code: "receipt-changed" }]);
  }
  return decision(current.parsed.proofId, true, []);
}

export async function writeProofReceipt({ receiptPath, root = process.cwd(), specPath }) {
  validateRepoPath(receiptPath, "receipt");
  await assertNoSymlinkAncestors(root, receiptPath, "receipt", true);
  const absolutePath = resolveRepoPath(root, receiptPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const receipt = await buildProofReceipt({ root, specPath });
  await writeFile(absolutePath, canonicalJson(receipt), { flag: "w", mode: 0o644 });
  return receipt;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (command !== "generate" && command !== "verify") {
    fail("invalid-command", { command: command ?? null });
  }
  if (rest.length % 2 !== 0) fail("invalid-arguments");
  const values = {};
  const allowed = new Set(["--root", "--spec", "--receipt", "--trusted-receipt"]);
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!allowed.has(flag) || Object.hasOwn(values, flag)) fail("invalid-arguments", { flag });
    values[flag] = rest[index + 1];
  }
  for (const required of ["--spec", "--receipt"]) {
    if (!values[required]) fail("missing-argument", { flag: required });
  }
  return {
    command,
    receiptPath: values["--receipt"],
    root: values["--root"] ?? process.cwd(),
    specPath: values["--spec"],
    trustedReceiptPath: values["--trusted-receipt"],
  };
}

async function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
    if (args.command === "generate") {
      const receipt = await writeProofReceipt(args);
      process.stdout.write(canonicalJson({
        proofId: receipt.proofId,
        receipt: args.receiptPath,
        status: "written",
      }));
      return;
    }
    const result = await verifyProofReceiptReuse(args);
    process.stdout.write(canonicalJson(result));
    if (!result.currentValid) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(canonicalJson({
      error: error instanceof ProofReceiptError ? error.code : "unexpected-error",
      status: "error",
    }));
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
