#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { MAX_ENTRY_BYTES } from "./proof-receipt.mjs";

const execFileAsync = promisify(execFile);

export const MAX_CHANGED_TEST_JSON_BYTES = 64 * 1024;
export const MAX_CHANGED_TEST_COUNT = 512;
export const MAX_CHANGED_TEST_FILE_BYTES = MAX_ENTRY_BYTES;
const MAX_CHANGED_TEST_TOTAL_BYTES = 1024 * 1024 * 1024;
const ASCII_CONTROL = /[\u0000-\u001f\u007f]/u;
const CANONICAL_WEB_TEST = /^web\/src\/(?:[^/]+\/)*[^/]+\.test\.ts$/u;
const P5_TEST_ROOT = "web/src/ccsolver-runtime/compose/p5-review/";

export const NATIVE_CHANGED_WEB_TESTS = Object.freeze([
  "web/src/replay-verifier/impl/compareInputTraceScenario.test.ts",
  "web/src/replay-verifier/impl/compareLynxInputTraceScenario.test.ts",
  "web/src/replay-verifier/impl/compareLynxReplayTraceScenario.test.ts",
  "web/src/replay-verifier/impl/compareLynxSolutionFileReplaySweep.test.ts",
  "web/src/replay-verifier/impl/compareMsInputTraceScenario.test.ts",
  "web/src/replay-verifier/impl/compareMsReplayTraceScenario.test.ts",
  "web/src/replay-verifier/impl/compareMsSolutionFileReplaySweep.test.ts",
  "web/src/replay-verifier/impl/compareMsTimeoutInputTrace.test.ts",
  "web/src/replay-verifier/impl/engine/use-cases/compareReplayTraceDebugScenario.test.ts",
  "web/src/replay-verifier/impl/inspectLynxReplayComparison.test.ts",
  "web/src/replay-verifier/impl/lynxOracleDebugTrace.test.ts",
  "web/src/replay-verifier/impl/lynxOracleReplayCharacterization.test.ts",
  "web/src/replay-verifier/impl/msOracleReplayCharacterization.test.ts",
]);

export const UNSUPPORTED_CHANGED_WEB_TESTS = Object.freeze([
  "web/src/replay-verifier/impl/engine/use-cases/compareLynxReplayTraceDebugScenario.test.ts",
  "web/src/ruleset-lynx/impl/bowlingBallCharacterization.todo.test.ts",
  "web/src/ruleset-ms/impl/bowlingBallCharacterization.todo.test.ts",
]);

const NATIVE_TEST_SET = new Set(NATIVE_CHANGED_WEB_TESTS);
const UNSUPPORTED_TEST_SET = new Set(UNSUPPORTED_CHANGED_WEB_TESTS);

function isCanonicalWebTestPath(path) {
  return typeof path === "string"
    && Buffer.byteLength(path) <= 4096
    && !ASCII_CONTROL.test(path)
    && !path.includes("\\")
    && CANONICAL_WEB_TEST.test(path)
    && !path.split("/").some((segment) => segment === "." || segment === "..");
}

export function changedWebTestDisposition(path) {
  if (!isCanonicalWebTestPath(path)) return null;
  if (UNSUPPORTED_TEST_SET.has(path)) return "unsupported";
  if (path.startsWith(P5_TEST_ROOT)) return "p5";
  if (NATIVE_TEST_SET.has(path)) return "native";
  return "workspace";
}

async function inspectRegularRepoFile(root, path, { allowMissing }) {
  const repositoryRoot = resolve(root);
  const segments = path.split("/");
  let current = repositoryRoot;
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    if (current !== repositoryRoot && !current.startsWith(`${repositoryRoot}${sep}`)) {
      throw new Error(`changed test escapes repository root: ${path}`);
    }
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) return null;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`changed test uses a symbolic link: ${path}`);
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw new Error(`changed test ancestor is not a directory: ${path}`);
    }
    if (index === segments.length - 1) {
      if (!info.isFile()) throw new Error(`changed test is not a regular file: ${path}`);
      if (info.size > MAX_CHANGED_TEST_FILE_BYTES) {
        throw new Error(`changed test exceeds the file-size limit: ${path}`);
      }
      return info;
    }
  }
  throw new Error(`invalid changed test path: ${path}`);
}

export async function partitionChangedWebTestPaths({ changedPaths, deletedPaths = [], root }) {
  if (!Array.isArray(changedPaths) || !Array.isArray(deletedPaths)) {
    throw new TypeError("changed and deleted paths must be arrays");
  }
  const deleted = new Set(deletedPaths);
  const partitions = { native: [], p5: [], workspace: [] };
  let totalBytes = 0;
  for (const path of [...new Set(changedPaths)].sort()) {
    const disposition = changedWebTestDisposition(path);
    if (disposition === null) continue;
    const info = await inspectRegularRepoFile(root, path, { allowMissing: true });
    if (info === null) {
      if (deleted.has(path)) continue;
      throw new Error(`changed test is missing but is not a proven deletion: ${path}`);
    }
    if (disposition === "unsupported") {
      throw new Error(`unsupported changed web test must be enabled before CI can cover it: ${path}`);
    }
    totalBytes += info.size;
    if (totalBytes > MAX_CHANGED_TEST_TOTAL_BYTES) throw new Error("changed tests exceed the total-size limit");
    partitions[disposition].push(path);
  }
  const count = Object.values(partitions).reduce((sum, paths) => sum + paths.length, 0);
  if (count > MAX_CHANGED_TEST_COUNT) throw new Error("too many changed web tests");
  return partitions;
}

export function parseChangedWebTestJson(value, lane) {
  if (lane !== "workspace" && lane !== "native") throw new Error(`invalid changed-test lane: ${lane}`);
  if (typeof value !== "string" || Buffer.byteLength(value) > MAX_CHANGED_TEST_JSON_BYTES) {
    throw new Error("changed-test JSON exceeds its transport limit");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("changed-test JSON is invalid");
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_CHANGED_TEST_COUNT) {
    throw new Error("changed-test JSON must be a bounded array");
  }
  const unique = new Set();
  for (const path of parsed) {
    if (changedWebTestDisposition(path) !== lane) throw new Error(`changed test is not in ${lane} lane`);
    if (unique.has(path)) throw new Error(`duplicate changed test: ${path}`);
    unique.add(path);
  }
  const sorted = [...unique].sort();
  if (JSON.stringify(parsed) !== JSON.stringify(sorted)) {
    throw new Error("changed-test JSON must be sorted and canonical");
  }
  return sorted;
}

export function buildChangedWebTestInvocation(paths, lane, root) {
  if (!Array.isArray(paths) || !paths.every((path) => changedWebTestDisposition(path) === lane)) {
    throw new Error(`changed test invocation contains a path outside the ${lane} lane`);
  }
  const repositoryRoot = resolve(root);
  const env = { ...process.env };
  if (lane === "native") {
    Object.assign(env, {
      TWORLD_ENABLE_LYNX_REPLAY_INSPECT: "1",
      TWORLD_ENABLE_LYNX_REPLAY_SWEEP: "1",
      TWORLD_LYNX_REPLAY_FILTER: "CCLP1-lynx.dac.tws:1",
      TWORLD_LYNX_SOLUTION_FILE: "save/CCLP1-lynx.dac.tws",
      TWORLD_LYNX_SWEEP_TIMEOUT_MS: "300000",
      TWORLD_MS_REPLAY_FILTER: "CCLP1.dac.tws:1",
      TWORLD_MS_SOLUTION_FILE: "save/CCLP1.dac.tws",
      TWORLD_MS_SWEEP_TIMEOUT_MS: "300000",
      TWORLD_ORACLE_BIN: resolve(repositoryRoot, "build-verify/legacy_c/tworld-oracle"),
    });
  }
  return {
    args: [
      "--workspace", "web", "run", "test", "--", "--run",
      ...paths.map((path) => path.slice("web/".length)),
    ],
    command: "npm",
    options: {
      cwd: repositoryRoot,
      encoding: "utf8",
      env,
      maxBuffer: MAX_ENTRY_BYTES,
      shell: false,
      timeout: lane === "native" ? 25 * 60_000 : 20 * 60_000,
      windowsHide: true,
    },
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--root", "--lane", "--json"].includes(argument)) throw new Error(`unknown option: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || options[argument] !== undefined) throw new Error(`${argument} requires one value`);
    options[argument] = value;
    index += 1;
  }
  if (options["--lane"] === undefined || options["--json"] === undefined) {
    throw new Error("--lane and --json are required");
  }
  return { json: options["--json"], lane: options["--lane"], root: options["--root"] ?? process.cwd() };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const paths = parseChangedWebTestJson(options.json, options.lane);
  if (paths.length === 0) {
    process.stdout.write(`No changed ${options.lane} web tests.\n`);
    return;
  }
  const checked = await partitionChangedWebTestPaths({ changedPaths: paths, deletedPaths: [], root: options.root });
  if (JSON.stringify(checked[options.lane]) !== JSON.stringify(paths)) {
    throw new Error("changed-test lane changed during filesystem validation");
  }
  if (options.lane === "native") {
    const oracle = resolve(options.root, "build-verify/legacy_c/tworld-oracle");
    await inspectRegularRepoFile(options.root, "build-verify/legacy_c/tworld-oracle", { allowMissing: false });
    await access(oracle, constants.X_OK);
  }
  const invocation = buildChangedWebTestInvocation(paths, options.lane, options.root);
  try {
    const result = await execFileAsync(invocation.command, invocation.args, invocation.options);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  } catch (error) {
    if (typeof error?.stdout === "string") process.stdout.write(error.stdout);
    if (typeof error?.stderr === "string") process.stderr.write(error.stderr);
    throw error;
  }
}

const isDirectInvocation = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectInvocation) {
  main().catch((error) => {
    process.stderr.write(`changed-web-tests: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
