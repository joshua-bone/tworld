#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const destinationRoot = resolve(
  process.env.HYBRIDCC_SANDBOX_ASSET_DESTINATION_DIR ?? join(
    repositoryRoot,
    "web/src/player-web/impl/hybridcc-v1/sandbox/assets",
  ),
);
const engineManifestPath = join(
  repositoryRoot,
  "web/src/player-web/impl/hybridcc-v1/engine/engine-manifest.json",
);
const assetManifestFile = "assets-manifest.json";
const assetManifestSchema = "hybridcc.legacy-dat-sandbox.browser-assets.v1";
const defaultSourceCandidates = [
  join(repositoryRoot, "../HybridCC2026-sandbox-pr4/sandbox/legacy_dat/generated"),
  join(repositoryRoot, "../HybridCC2026/sandbox/legacy_dat/generated"),
  join(repositoryRoot, "../HybridCC2026-sandbox-pr3/sandbox/legacy_dat/generated"),
  join(repositoryRoot, "../HybridCC2026-sandbox-pr2/sandbox/legacy_dat/generated"),
  join(repositoryRoot, "../HybridCC2026-sandbox-pr1/sandbox/legacy_dat/generated"),
];
const requiredTopLevelFiles = [
  "legacy_dat_sandbox.dat",
  "legacy_dat_sandbox.hints.json",
  "replay-index.json",
];
const pinnedTopLevelHashes = new Map([
  ["legacy_dat_sandbox.dat", "32b545ac4277053b4467eabbeb2b8d48420df7870820945e2e991d5e5dc1235d"],
  ["legacy_dat_sandbox.hints.json", "98f1e5be2e1cbfe51c88c463515a5ac5360ad73156e40a8e61810a684bcfceab"],
  ["replay-index.json", "6d4c15769b342ca75b9d6cfcf5def08ea8ab671a516c4100e7c440b685d969d6"],
]);

function usage() {
  throw new Error(
    "usage: node web/src/player-web/impl/hybridcc-v1/sandbox/syncSandboxAssets.mjs [--check] [generated-directory]",
  );
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const positional = args.filter((argument) => argument !== "--check");
if (positional.length > 1) usage();

async function isDirectory(path) {
  try {
    return (await readdir(path)).length >= 0;
  } catch {
    return false;
  }
}

async function recursiveFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childPrefix = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await recursiveFiles(join(directory, entry.name), childPrefix));
    } else if (entry.isFile()) {
      files.push(childPrefix);
    }
  }
  return files;
}

async function replayFiles(directory) {
  if (!(await isDirectory(directory))) return [];
  return (await recursiveFiles(directory))
    .filter((path) => path.endsWith(".hcr1"))
    .map((path) => join("replays", path));
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function parseReplayIndex(bytes) {
  const root = parseJson(bytes, "HybridCC sandbox replay-index.json");
  if (
    !root
    || root.schema !== "hybridcc.legacy-dat-sandbox.replay-index.v2"
    || !Array.isArray(root.replays)
    || !Array.isArray(root.boundedProofs)
  ) {
    throw new Error("HybridCC sandbox replay-index.json has an unsupported schema.");
  }
  const proofIds = [];
  const validateEvidence = (entry, label) => {
    if (typeof entry?.id !== "string" || entry.id.length === 0) {
      throw new Error(`HybridCC sandbox ${label} has no proof ID.`);
    }
    proofIds.push(entry.id);
    if (!Array.isArray(entry.scenarioIds) || entry.scenarioIds.length === 0) {
      throw new Error(`HybridCC sandbox ${label} has no scenario IDs.`);
    }
    if (
      entry.scenarioIds.some((scenarioId) => (
        typeof scenarioId !== "string"
        || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(scenarioId)
      ))
    ) {
      throw new Error(`HybridCC sandbox ${label} has an unsafe scenario ID.`);
    }
    if (new Set(entry.scenarioIds).size !== entry.scenarioIds.length) {
      throw new Error(`HybridCC sandbox ${label} contains duplicate scenario IDs.`);
    }
  };
  const paths = root.replays.map((entry, index) => {
    validateEvidence(entry, `replay-index entry ${index}`);
    const path = entry?.path;
    if (
      typeof path !== "string"
      || !/^replays\/[0-9]+\.[0-9]+\.[0-9]+\/[a-z0-9][a-z0-9-]*\.hcr1$/u.test(path)
    ) {
      throw new Error(`HybridCC sandbox replay-index entry ${index} has an unsafe path.`);
    }
    return path;
  }).sort((left, right) => left.localeCompare(right));
  root.boundedProofs.forEach((entry, index) => {
    validateEvidence(entry, `bounded proof ${index}`);
    if (entry.expectedOutcome !== "unfinished" || "path" in entry) {
      throw new Error(
        `HybridCC sandbox bounded proof ${index} must be unfinished metadata without an HCR1 path.`,
      );
    }
  });
  if (new Set(proofIds).size !== proofIds.length) {
    throw new Error("HybridCC sandbox replay-index.json contains duplicate proof IDs.");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("HybridCC sandbox replay-index.json contains duplicate replay paths.");
  }
  return { root, paths };
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertPinnedAssetBytes(root, replayIndex, label) {
  for (const [file, expectedHash] of pinnedTopLevelHashes) {
    const actualHash = digest(await readFile(join(root, file)));
    if (actualHash !== expectedHash) {
      throw new Error(`HybridCC sandbox ${label} ${file} has stale SHA-256 ${actualHash}.`);
    }
  }
  for (const [index, entry] of replayIndex.replays.entries()) {
    const bytes = await readFile(join(root, entry.path));
    if (
      !Number.isSafeInteger(entry.byteLength)
      || entry.byteLength !== bytes.byteLength
      || typeof entry.sha256 !== "string"
      || entry.sha256 !== digest(bytes)
    ) {
      throw new Error(`HybridCC sandbox ${label} replay ${index} failed its indexed byte identity.`);
    }
  }
}

function assertExactFiles(actual, expected, label) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const unexpected = actual.filter((path) => !expectedSet.has(path));
  const missing = expected.filter((path) => !actualSet.has(path));
  if (unexpected.length > 0 || missing.length > 0) {
    const details = [
      ...unexpected.map((path) => `unexpected ${path}`),
      ...missing.map((path) => `missing ${path}`),
    ];
    throw new Error(`HybridCC sandbox ${label} files disagree with their manifest:\n${details.join("\n")}`);
  }
}

async function fileRecords(root, files) {
  return Promise.all([...files].sort((left, right) => left.localeCompare(right)).map(async (path) => {
    const bytes = await readFile(join(root, path));
    return { path, byteLength: bytes.byteLength, sha256: digest(bytes) };
  }));
}

function sourceCommit(sourceRoot) {
  const override = process.env.HYBRIDCC_SANDBOX_SOURCE_COMMIT;
  if (override) return override;
  try {
    return execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(
      "Could not derive the HybridCC sandbox source commit; set HYBRIDCC_SANDBOX_SOURCE_COMMIT for a detached fixture.",
      { cause: error },
    );
  }
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const engineManifest = parseJson(
  await readFile(engineManifestPath),
  "Hybrid v1 engine manifest",
);
if (
  typeof engineManifest.sourceRepository !== "string"
  || !/^[0-9a-f]{40}$/u.test(engineManifest.sourceCommit)
) {
  throw new Error("Hybrid v1 engine manifest has invalid source provenance.");
}

const requestedSource = positional[0] ?? process.env.HYBRIDCC_SANDBOX_GENERATED_DIR;
const selfCheck = checkOnly && !requestedSource;
let sourceRoot = requestedSource ? resolve(requestedSource) : selfCheck ? destinationRoot : null;
if (sourceRoot === null) {
  for (const candidate of defaultSourceCandidates) {
    if (await isDirectory(candidate)) {
      sourceRoot = candidate;
      break;
    }
  }
}
if (sourceRoot === null || !(await isDirectory(sourceRoot))) {
  throw new Error(
    "HybridCC sandbox output was not found; pass its generated directory explicitly.",
  );
}
if (!selfCheck) {
  const actualSourceCommit = sourceCommit(sourceRoot);
  if (actualSourceCommit !== engineManifest.sourceCommit) {
    throw new Error(
      `HybridCC sandbox source commit ${actualSourceCommit} does not match the pinned engine ${engineManifest.sourceCommit}.`,
    );
  }
}

const replayIndexBytes = await readFile(join(sourceRoot, "replay-index.json"));
const replayIndex = parseReplayIndex(replayIndexBytes);
const sourceReplays = await replayFiles(join(sourceRoot, "replays"));
assertExactFiles(sourceReplays, replayIndex.paths, "source replay");
await assertPinnedAssetBytes(sourceRoot, replayIndex.root, "source");

const files = [...requiredTopLevelFiles, ...replayIndex.paths];
const expectedManifest = {
  schema: assetManifestSchema,
  sourceRepository: engineManifest.sourceRepository,
  sourceCommit: engineManifest.sourceCommit,
  files: await fileRecords(sourceRoot, files),
};

if (!checkOnly) {
  await rm(destinationRoot, { force: true, recursive: true });
  for (const file of files) {
    const destination = join(destinationRoot, file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(join(sourceRoot, file)));
  }
  await writeFile(join(destinationRoot, assetManifestFile), canonicalJson(expectedManifest));
} else {
  const mismatches = [];
  for (const file of files) {
    const sourceBytes = await readFile(join(sourceRoot, file));
    let destinationBytes = null;
    try {
      destinationBytes = await readFile(join(destinationRoot, file));
    } catch {
      // Report absent files through the same deterministic mismatch list.
    }
    if (destinationBytes === null || !sourceBytes.equals(destinationBytes)) {
      mismatches.push(relative(repositoryRoot, join(destinationRoot, file)));
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`HybridCC sandbox assets are stale:\n${mismatches.join("\n")}`);
  }

  const manifestBytes = await readFile(join(destinationRoot, assetManifestFile));
  const bundledManifest = parseJson(manifestBytes, "HybridCC sandbox assets manifest");
  if (manifestBytes.toString("utf8") !== canonicalJson(bundledManifest)) {
    throw new Error("HybridCC sandbox assets manifest is not canonical JSON.");
  }
  if (canonicalJson(bundledManifest) !== canonicalJson(expectedManifest)) {
    throw new Error("HybridCC sandbox assets manifest is stale or has different source provenance.");
  }
  const destinationFiles = await recursiveFiles(destinationRoot);
  assertExactFiles(destinationFiles, [...files, assetManifestFile], "destination asset");
  await assertPinnedAssetBytes(destinationRoot, replayIndex.root, "destination");
}

process.stdout.write(
  `${checkOnly ? "Checked" : "Synchronized"} ${files.length} HybridCC sandbox assets.\n`,
);
