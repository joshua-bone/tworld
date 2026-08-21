import {
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { P7bTrainingPackBuildInput } from "../p7b-training-review/buildP7bTrainingPackOutputs";
import {
  P7_SHARED_PLAYER_DIST_ENTRY,
  P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
  P7_SHARED_PLAYER_GRAPH_MAX_ATTESTATION_BYTES,
  P7_SHARED_PLAYER_GRAPH_MAX_FILES,
  P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES,
  P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_BYTES,
  P7_SHARED_PLAYER_GRAPH_MAX_TOTAL_BYTES,
  P7_SHARED_PLAYER_SOURCE_ENTRY,
  P7_SHARED_PLAYER_VITE_MANIFEST_KEY,
  attestP7SharedPlayerGraph,
  buildP7SharedPlayerGraphAttestation,
  canonicalizeP7SharedPlayerGraphAttestation,
  parseP7SharedPlayerGraphAttestation,
  p7SharedPlayerViteManifestKey,
  type P7SharedPlayerBuiltFile,
  type P7SharedPlayerGraphAttestationV1,
  type P7SharedPlayerGraphBuildInput,
} from "../p7b-training-review/p7SharedPlayerGraphAttestation";

const VITE_MANIFEST_PATH = "web/dist/.vite/manifest.json";
const WEB_DIST_PARENT = "web/dist";
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const decoder = new TextDecoder("utf-8", { fatal: true });
let transactionOrdinal = 0;

export const P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION =
  "p7-shared-player-source-closure-v1" as const;
export const P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION =
  "node22.22.0-vite7.3.1-base-tworld-v1" as const;

export type P7TrainingSharedPlayerInput = P7bTrainingPackBuildInput["sharedPlayer"];

export interface P7TrainingFreshPlayerGraph extends P7TrainingSharedPlayerInput {
  readonly buildInput: P7SharedPlayerGraphBuildInput;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function safeRelativePath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 2_048
    || !SAFE_PATH_PATTERN.test(value)
    || value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`${label} is unsafe`);
  return value;
}

function descendant(repositoryRoot: string, relativePath: string): string {
  const root = resolve(repositoryRoot);
  const absolute = resolve(root, safeRelativePath(relativePath, "P7 player graph path"));
  if (!absolute.startsWith(`${root}${sep}`)) throw new Error("P7 player graph path escapes repository root");
  return absolute;
}

async function requireRoot(repositoryRoot: string): Promise<string> {
  const root = resolve(repositoryRoot);
  const details = await lstat(root);
  if (details.isSymbolicLink()) throw new Error("P7 player graph repository root is a symbolic link");
  if (!details.isDirectory()) throw new Error("P7 player graph repository root is not a directory");
  return root;
}

async function trustedDirectoryChain(input: {
  readonly repositoryRoot: string;
  readonly relativeDirectory: string;
  readonly create: boolean;
}): Promise<string> {
  const root = await requireRoot(input.repositoryRoot);
  const safe = safeRelativePath(input.relativeDirectory, "P7 player graph directory");
  let current = root;
  for (const segment of safe.split("/")) {
    current = resolve(current, segment);
    let details;
    try {
      details = await lstat(current);
    } catch (error) {
      if (!isMissing(error) || !input.create) {
        if (isMissing(error)) throw new Error(`P7 player graph directory is missing: ${safe}`);
        throw error;
      }
      await mkdir(current);
      details = await lstat(current);
    }
    if (details.isSymbolicLink()) {
      throw new Error(`P7 player graph directory is a symbolic link: ${safe}`);
    }
    if (!details.isDirectory()) throw new Error(`P7 player graph directory is invalid: ${safe}`);
  }
  return current;
}

async function readTrustedFile(input: {
  readonly repositoryRoot: string;
  readonly relativePath: string;
  readonly maximumBytes: number;
  readonly label: string;
}): Promise<Uint8Array> {
  const relativePath = safeRelativePath(input.relativePath, input.label);
  await trustedDirectoryChain({
    repositoryRoot: input.repositoryRoot,
    relativeDirectory: dirname(relativePath).split(sep).join("/"),
    create: false,
  });
  const absolute = descendant(input.repositoryRoot, relativePath);
  let details;
  try {
    details = await lstat(absolute);
  } catch (error) {
    if (isMissing(error)) throw new Error(`${input.label} is missing: ${relativePath}`);
    throw error;
  }
  if (details.isSymbolicLink()) throw new Error(`${input.label} is a symbolic link: ${relativePath}`);
  if (!details.isFile() || details.size > input.maximumBytes) {
    throw new Error(`${input.label} is invalid or exceeds its byte bound: ${relativePath}`);
  }
  const bytes = new Uint8Array(await readFile(absolute));
  if (bytes.byteLength !== details.size) throw new Error(`${input.label} changed while read`);
  return bytes;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function outputPathArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
    throw new Error(`${label} is invalid`);
  }
  return value.map((entry) => safeRelativePath(entry, label));
}

function manifestKeyArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
    throw new Error(`${label} is invalid`);
  }
  return value.map((entry) => p7SharedPlayerViteManifestKey(entry, label));
}

function reachablePlayerFiles(viteManifestBytes: Uint8Array): readonly string[] {
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(decoder.decode(viteManifestBytes)) as unknown;
  } catch (error) {
    throw new Error("P7 player Vite manifest is invalid", { cause: error });
  }
  const manifest = record(manifestValue, "P7 player Vite manifest");
  const root = record(manifest[P7_SHARED_PLAYER_VITE_MANIFEST_KEY], "P7 player Vite entry");
  if (
    root.file !== P7_SHARED_PLAYER_DIST_ENTRY
    || root.isEntry !== true
    || (root.src !== undefined && root.src !== P7_SHARED_PLAYER_VITE_MANIFEST_KEY)
  ) throw new Error("P7 player fixed Vite entry drifted");
  const pending: string[] = [P7_SHARED_PLAYER_VITE_MANIFEST_KEY];
  const visited = new Set<string>();
  const paths = new Set<string>();
  while (pending.length > 0) {
    const key = pending.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    if (visited.size > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
      throw new Error("P7 player Vite graph exceeds its file bound");
    }
    const entry = record(manifest[key], `P7 player Vite dependency ${key}`);
    paths.add(safeRelativePath(entry.file, `P7 player Vite file ${key}`));
    for (const field of ["css", "assets"] as const) {
      outputPathArray(entry[field], `P7 player Vite ${field}`).forEach((path) => paths.add(path));
    }
    for (const field of ["imports", "dynamicImports"] as const) {
      for (const imported of manifestKeyArray(entry[field], `P7 player Vite ${field}`)) {
        if (!Object.hasOwn(manifest, imported)) {
          throw new Error(`P7 player Vite dependency is missing: ${imported}`);
        }
        pending.push(imported);
      }
    }
  }
  return [...paths].sort();
}

async function loadFreshBuildInput(input: {
  readonly repositoryRoot: string;
  readonly sourceClosureRevision: string;
  readonly toolchainRevision: string;
  readonly sha256: Sha256Port;
}): Promise<P7SharedPlayerGraphBuildInput> {
  const sourceEntryBytes = await readTrustedFile({
    repositoryRoot: input.repositoryRoot,
    relativePath: P7_SHARED_PLAYER_SOURCE_ENTRY,
    maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES,
    label: "P7 player source entry",
  });
  const viteManifestBytes = await readTrustedFile({
    repositoryRoot: input.repositoryRoot,
    relativePath: VITE_MANIFEST_PATH,
    maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_BYTES,
    label: "P7 player Vite manifest",
  });
  const paths = reachablePlayerFiles(viteManifestBytes);
  const builtFiles: P7SharedPlayerBuiltFile[] = [];
  let totalByteLength = 0;
  for (const path of paths) {
    const bytes = await readTrustedFile({
      repositoryRoot: input.repositoryRoot,
      relativePath: `${WEB_DIST_PARENT}/${path}`,
      maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES,
      label: `P7 player built file ${path}`,
    });
    totalByteLength += bytes.byteLength;
    if (totalByteLength > P7_SHARED_PLAYER_GRAPH_MAX_TOTAL_BYTES) {
      throw new Error("P7 player built graph exceeds its byte bound");
    }
    builtFiles.push({ path, bytes });
  }
  return {
    sourceEntryBytes,
    sourceClosureRevision: input.sourceClosureRevision,
    toolchainRevision: input.toolchainRevision,
    viteManifestBytes,
    builtFiles,
    sha256: input.sha256,
  };
}

export async function buildFreshP7TrainingPlayerGraph(input: {
  readonly repositoryRoot: string;
  readonly sourceClosureRevision: string;
  readonly toolchainRevision: string;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingFreshPlayerGraph> {
  const buildInput = await loadFreshBuildInput(input);
  const graphAttestation = await buildP7SharedPlayerGraphAttestation(buildInput);
  await attestP7SharedPlayerGraph({ ...buildInput, attestation: graphAttestation });
  return {
    graphAttestationPath: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
    graphAttestation,
    buildInput,
  };
}

async function loadCheckedGraph(
  repositoryRoot: string,
): Promise<P7SharedPlayerGraphAttestationV1> {
  const bytes = await readTrustedFile({
    repositoryRoot,
    relativePath: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
    maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_ATTESTATION_BYTES,
    label: "P7 checked player graph",
  });
  return parseP7SharedPlayerGraphAttestation(decoder.decode(bytes));
}

export async function checkP7TrainingPlayerGraph(input: {
  readonly repositoryRoot: string;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingSharedPlayerInput> {
  const graphAttestation = await loadCheckedGraph(input.repositoryRoot);
  if (
    graphAttestation.source.closureRevision
    !== P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION
  ) throw new Error("P7 checked player graph source revision drifted");
  if (
    graphAttestation.toolchainRevision
    !== P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION
  ) throw new Error("P7 checked player graph toolchain revision drifted");
  const buildInput = await loadFreshBuildInput({
    repositoryRoot: input.repositoryRoot,
    sourceClosureRevision: P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
    toolchainRevision: P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
    sha256: input.sha256,
  });
  await attestP7SharedPlayerGraph({ ...buildInput, attestation: graphAttestation });
  return { graphAttestationPath: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH, graphAttestation };
}

export async function attestCheckedP7TrainingPlayerGraph(input: {
  readonly repositoryRoot: string;
  readonly sha256: Sha256Port;
}): Promise<{
  readonly fileCount: number;
  readonly byteLength: number;
  readonly entryContent: P7SharedPlayerGraphAttestationV1["entry"]["content"];
}> {
  const graphAttestation = (await checkP7TrainingPlayerGraph(input)).graphAttestation;
  const buildInput = await loadFreshBuildInput({
    repositoryRoot: input.repositoryRoot,
    sourceClosureRevision: P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
    toolchainRevision: P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
    sha256: input.sha256,
  });
  return attestP7SharedPlayerGraph({ ...buildInput, attestation: graphAttestation });
}

export async function writeP7TrainingPlayerGraphTransactionally(input: {
  readonly repositoryRoot: string;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingSharedPlayerInput> {
  const fresh = await buildFreshP7TrainingPlayerGraph({
    ...input,
    sourceClosureRevision: P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
    toolchainRevision: P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
  });
  const canonical = canonicalizeP7SharedPlayerGraphAttestation(fresh.graphAttestation);
  const relativeParent = dirname(P7_SHARED_PLAYER_GRAPH_CHECKED_PATH).split(sep).join("/");
  await trustedDirectoryChain({
    repositoryRoot: input.repositoryRoot,
    relativeDirectory: relativeParent,
    create: true,
  });
  const target = descendant(input.repositoryRoot, P7_SHARED_PLAYER_GRAPH_CHECKED_PATH);
  try {
    const existing = await lstat(target);
    if (existing.isSymbolicLink()) throw new Error("P7 checked player graph is a symbolic link");
    if (!existing.isFile()) throw new Error("P7 checked player graph target is not a file");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  transactionOrdinal += 1;
  const temporary = `${target}.tmp-${process.pid}-${transactionOrdinal}`;
  try {
    await writeFile(temporary, canonical, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return checkP7TrainingPlayerGraph({ repositoryRoot: input.repositoryRoot, sha256: input.sha256 });
}
