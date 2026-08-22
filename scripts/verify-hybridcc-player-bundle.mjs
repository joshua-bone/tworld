#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_PUBLIC_ROUTE = "/tworld/dev/hybridcc/";
const PUBLIC_RELATIVE_ROOT = "web/public/dev/hybridcc";
const DIST_RELATIVE_ROOT = "web/dist/dev/hybridcc";
const MANIFEST_FILENAME = "manifest.v1.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PAYLOAD_FILES = 256;
const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
const SAFE_RELATIVE_PATH = /^[A-Za-z0-9._/-]+$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`invalid HybridCC deployment bundle: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalJson(value))}\n`, "utf8");
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys must be exactly ${wanted.join(",")}`);
  }
}

function assertSafeRelativePath(relativePath, label) {
  if (
    typeof relativePath !== "string"
    || relativePath.length === 0
    || !SAFE_RELATIVE_PATH.test(relativePath)
    || relativePath.includes("\\")
    || posix.isAbsolute(relativePath)
    || posix.normalize(relativePath) !== relativePath
    || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(`${label} is not a canonical safe relative path: ${String(relativePath)}`);
  }
}

async function walkFiles(root, label) {
  const rootStat = await lstat(root).catch((error) => {
    if (error?.code === "ENOENT") fail(`missing ${label} root: ${root}`);
    throw error;
  });
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail(`${label} root must be a real directory: ${root}`);
  }

  const files = [];
  async function visit(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory === ""
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      assertSafeRelativePath(relativePath, `${label} filesystem path`);
      const absolutePath = resolve(directory, entry.name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink() || entry.isSymbolicLink()) {
        fail(`${label} contains a symbolic link: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        const bytes = await readFile(absolutePath);
        files.push(Object.freeze({
          bytes,
          path: relativePath,
          sha256: sha256(bytes),
        }));
      } else {
        fail(`${label} contains a non-file entry: ${relativePath}`);
      }
    }
  }

  await visit(root, "");
  files.sort((left, right) => compareCodeUnits(left.path, right.path));
  return files;
}

function rejectSourceMaps(files, label) {
  for (const file of files) {
    if (file.path.toLowerCase().endsWith(".map")) {
      fail(`${label} contains a source-map file: ${file.path}`);
    }
    if (/\.(?:css|m?js)$/iu.test(file.path)) {
      const text = file.bytes.toString("utf8");
      if (/sourceMappingURL\s*=/u.test(text)) {
        fail(`${label} contains a source-map reference: ${file.path}`);
      }
    }
  }
}

async function validateManifest(root, allFiles) {
  const manifestFile = allFiles.find(({ path }) => path === MANIFEST_FILENAME);
  if (!manifestFile) fail(`missing ${MANIFEST_FILENAME}`);
  if (manifestFile.bytes.byteLength > MAX_MANIFEST_BYTES) {
    fail(`${MANIFEST_FILENAME} exceeds ${MAX_MANIFEST_BYTES} bytes`);
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  } catch {
    fail(`${MANIFEST_FILENAME} is not valid JSON`);
  }
  assertExactKeys(manifest, [
    "basePath",
    "contentSha256",
    "entrypoint",
    "fileCount",
    "files",
    "format",
    "hybridccRevision",
    "nativeFormats",
    "playerHostAbi",
    "totalBytes",
    "tworldRevision",
    "version",
  ], "bundle manifest");
  if (!manifestFile.bytes.equals(canonicalJsonBytes(manifest))) {
    fail(`${MANIFEST_FILENAME} must use canonical JSON with one trailing newline`);
  }
  if (manifest.format !== "hybridcc.player-bundle" || manifest.version !== 1) {
    fail("unsupported bundle format or version");
  }
  if (manifest.basePath !== "./" || manifest.entrypoint !== "index.html") {
    fail(`bundle must remain relative at ${EXPECTED_PUBLIC_ROUTE}`);
  }
  if (
    !/^(?:WORKTREE|[0-9a-f]{40})$/u.test(manifest.hybridccRevision)
    || !/^[0-9a-f]{40}$/u.test(manifest.tworldRevision)
  ) {
    fail("source revisions must be WORKTREE or lowercase 40-character Git hashes");
  }
  assertExactKeys(manifest.nativeFormats, ["image", "package", "replay"], "nativeFormats");
  if (
    !Object.values(manifest.nativeFormats).every((value) => Number.isSafeInteger(value) && value >= 1)
    || !Number.isSafeInteger(manifest.playerHostAbi)
    || manifest.playerHostAbi < 1
  ) {
    fail("native format and player ABI versions must be safe integers");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_PAYLOAD_FILES) {
    fail(`manifest files must be an array with at most ${MAX_PAYLOAD_FILES} entries`);
  }

  const payloadFiles = allFiles.filter(({ path }) => path !== MANIFEST_FILENAME);
  let priorPath = "";
  let totalBytes = 0;
  for (let index = 0; index < manifest.files.length; index += 1) {
    const record = manifest.files[index];
    assertExactKeys(record, ["bytes", "path", "sha256"], `files[${index}]`);
    assertSafeRelativePath(record.path, `files[${index}].path`);
    if (record.path === MANIFEST_FILENAME || record.path <= priorPath) {
      fail("manifest payload paths must be unique and strictly sorted");
    }
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 0 || !SHA256.test(record.sha256)) {
      fail(`files[${index}] has an invalid byte count or SHA-256 digest`);
    }
    priorPath = record.path;
    totalBytes += record.bytes;

    const actual = payloadFiles[index];
    if (
      actual === undefined
      || actual.path !== record.path
      || actual.bytes.byteLength !== record.bytes
      || actual.sha256 !== record.sha256
    ) {
      fail(`manifest does not exactly describe payload path ${record.path}`);
    }
  }
  if (payloadFiles.length !== manifest.files.length) {
    fail("manifest payload file count does not match the filesystem");
  }
  if (
    manifest.fileCount !== manifest.files.length
    || manifest.totalBytes !== totalBytes
    || totalBytes > MAX_PAYLOAD_BYTES
  ) {
    fail("manifest fileCount or totalBytes does not match its payload records");
  }
  const contentSha256 = sha256(canonicalJsonBytes(manifest.files));
  if (!SHA256.test(manifest.contentSha256) || manifest.contentSha256 !== contentSha256) {
    fail("manifest contentSha256 does not bind the canonical payload records");
  }

  const entrypoint = payloadFiles.find(({ path }) => path === manifest.entrypoint);
  if (!entrypoint) fail("manifest entrypoint is not a payload file");
  const entrypointText = entrypoint.bytes.toString("utf8");
  if (/<base\b/iu.test(entrypointText)) fail("entrypoint must not override the relative base URL");
  for (const match of entrypointText.matchAll(/\b(?:href|src)=["']([^"']+)["']/giu)) {
    if (!match[1].startsWith("./")) {
      fail(`entrypoint asset URL must be route-relative: ${match[1]}`);
    }
  }

  return Object.freeze({
    contentSha256,
    files: allFiles,
    manifest,
    root,
  });
}

function assertByteIdentical(source, deployed) {
  if (source.files.length !== deployed.files.length) {
    fail("Vite output has a different file count from the public source bundle");
  }
  for (let index = 0; index < source.files.length; index += 1) {
    const expected = source.files[index];
    const actual = deployed.files[index];
    if (
      actual.path !== expected.path
      || actual.bytes.byteLength !== expected.bytes.byteLength
      || actual.sha256 !== expected.sha256
    ) {
      fail(`Vite output is not byte-identical at ${expected.path}`);
    }
  }
}

function parseArguments(argv) {
  if (argv.length === 0) return { sourceOnly: false };
  if (argv.length === 1 && argv[0] === "--source-only") return { sourceOnly: true };
  throw new Error("usage: verify-hybridcc-player-bundle.mjs [--source-only]");
}

async function main() {
  const { sourceOnly } = parseArguments(process.argv.slice(2));
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const publicRoot = resolve(repositoryRoot, PUBLIC_RELATIVE_ROOT);
  const publicFiles = await walkFiles(publicRoot, "public bundle");
  rejectSourceMaps(publicFiles, "public bundle");
  const source = await validateManifest(publicRoot, publicFiles);

  if (!sourceOnly) {
    const distRoot = resolve(repositoryRoot, DIST_RELATIVE_ROOT);
    const distFiles = await walkFiles(distRoot, "Vite output bundle");
    rejectSourceMaps(distFiles, "Vite output bundle");
    const deployed = await validateManifest(distRoot, distFiles);
    assertByteIdentical(source, deployed);
  }

  process.stdout.write(`${JSON.stringify({
    contentSha256: source.contentSha256,
    payloadFileCount: source.manifest.fileCount,
    route: EXPECTED_PUBLIC_ROUTE,
    treeFileCount: source.files.length,
    verifiedViteOutput: !sourceOnly,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
