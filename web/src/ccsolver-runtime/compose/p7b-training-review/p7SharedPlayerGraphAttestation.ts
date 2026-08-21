import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";

export const P7_SHARED_PLAYER_GRAPH_ARTIFACT =
  "ccsolver-p7-shared-player-graph-attestation" as const;
export const P7_SHARED_PLAYER_SOURCE_ENTRY =
  "web/src/bootstrap/browser/p7bReplayPlayer.tsx" as const;
export const P7_SHARED_PLAYER_VITE_MANIFEST_KEY =
  "src/bootstrap/browser/p7bReplayPlayer.tsx" as const;
export const P7_SHARED_PLAYER_DIST_ENTRY = "assets/p7b-replay-player.js" as const;
export const P7_SHARED_PLAYER_GRAPH_CHECKED_PATH =
  "ccsolver/fixtures/golden/p7b/shared-player/p7b-replay-player-graph.json" as const;
export const P7_SHARED_PLAYER_GRAPH_MAX_FILES = 1_024;
export const P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES = 64 * 1024 * 1024;
export const P7_SHARED_PLAYER_GRAPH_MAX_TOTAL_BYTES = 512 * 1024 * 1024;
export const P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
export const P7_SHARED_PLAYER_GRAPH_MAX_ATTESTATION_BYTES = 2 * 1024 * 1024;
export const P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_KEY_BYTES = 2_048;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface P7SharedPlayerBuiltFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface P7SharedPlayerGraphAttestationV1 {
  readonly artifact: typeof P7_SHARED_PLAYER_GRAPH_ARTIFACT;
  readonly version: 1;
  readonly viteManifest: {
    readonly key: typeof P7_SHARED_PLAYER_VITE_MANIFEST_KEY;
    readonly content: BlobReferenceV1;
  };
  readonly source: {
    readonly entryPath: typeof P7_SHARED_PLAYER_SOURCE_ENTRY;
    readonly entryContent: BlobReferenceV1;
    readonly closureRevision: string;
  };
  readonly toolchainRevision: string;
  readonly entry: {
    readonly path: typeof P7_SHARED_PLAYER_DIST_ENTRY;
    readonly content: BlobReferenceV1;
  };
  readonly filesOrder: "path";
  readonly files: readonly {
    readonly path: string;
    readonly content: BlobReferenceV1;
  }[];
  readonly totals: {
    readonly fileCount: number;
    readonly byteLength: number;
  };
}

export interface P7SharedPlayerGraphBuildInput {
  readonly sourceEntryBytes: Uint8Array;
  readonly sourceClosureRevision: string;
  readonly toolchainRevision: string;
  readonly viteManifestBytes: Uint8Array;
  readonly builtFiles: readonly P7SharedPlayerBuiltFile[];
  readonly sha256: Sha256Port;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unsupported shape`);
  }
  return record;
}

function boundedText(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || value.includes("\0")
    || value.includes("\r")
    || value.includes("\n")
    || encoder.encode(value).byteLength > 1_024
  ) throw new Error(`${label} is invalid`);
  return value;
}

function safePath(value: unknown, label: string): string {
  const path = boundedText(value, label);
  if (
    !SAFE_PATH_PATTERN.test(path)
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`${label} is unsafe`);
  return path;
}

/** Vite manifest keys are object lookup identities, never filesystem paths. */
export function p7SharedPlayerViteManifestKey(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || value !== value.trim()
    || value.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(value)
    || encoder.encode(value).byteLength > P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_KEY_BYTES
  ) throw new Error(`${label} is invalid`);
  return value;
}

function reference(value: unknown, label: string): BlobReferenceV1 {
  const record = exactKeys(value, ["byteLength", "digest"], label);
  if (typeof record.digest !== "string" || !SHA256_PATTERN.test(record.digest)) {
    throw new Error(`${label} digest is invalid`);
  }
  if (
    !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 0
    || (record.byteLength as number) > P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES
  ) throw new Error(`${label} byte length is out of bounds`);
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: record.byteLength as number,
  };
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function parseViteManifest(bytes: Uint8Array): Record<string, unknown> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_BYTES) {
    throw new Error("shared player Vite manifest exceeds its byte bound");
  }
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes)) as unknown;
  } catch (error: unknown) {
    throw new Error("shared player Vite manifest is invalid", { cause: error });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("shared player Vite manifest must be an object");
  }
  return value as Record<string, unknown>;
}

function descriptor(value: unknown, key: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`shared player Vite dependency is missing: ${key}`);
  }
  return value as Record<string, unknown>;
}

function outputPathArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
    throw new Error(`${label} is invalid`);
  }
  return value.map((entry) => safePath(entry, label));
}

function manifestKeyArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
    throw new Error(`${label} is invalid`);
  }
  return value.map((entry) => p7SharedPlayerViteManifestKey(entry, label));
}

function reachableGraph(manifest: Record<string, unknown>): {
  readonly filePaths: readonly string[];
  readonly manifestBytes: Uint8Array;
} {
  const root = descriptor(manifest[P7_SHARED_PLAYER_VITE_MANIFEST_KEY], P7_SHARED_PLAYER_VITE_MANIFEST_KEY);
  if (
    root.file !== P7_SHARED_PLAYER_DIST_ENTRY
    || root.isEntry !== true
    || (root.src !== undefined && root.src !== P7_SHARED_PLAYER_VITE_MANIFEST_KEY)
  ) throw new Error("shared player fixed entry drifted");
  const pending: string[] = [P7_SHARED_PLAYER_VITE_MANIFEST_KEY];
  const visitedKeys = new Set<string>();
  const paths = new Set<string>();
  while (pending.length > 0) {
    const key = pending.shift()!;
    if (visitedKeys.has(key)) continue;
    visitedKeys.add(key);
    if (visitedKeys.size > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
      throw new Error("shared player Vite graph exceeds its file bound");
    }
    const entry = descriptor(manifest[key], key);
    paths.add(safePath(entry.file, `shared player Vite file ${key}`));
    for (const field of ["css", "assets"] as const) {
      outputPathArray(entry[field], `shared player Vite ${field}`).forEach((path) => paths.add(path));
    }
    for (const field of ["imports", "dynamicImports"] as const) {
      const imports = manifestKeyArray(entry[field], `shared player Vite ${field}`);
      for (const imported of imports) {
        if (!Object.hasOwn(manifest, imported)) {
          throw new Error(`shared player Vite dependency is missing: ${imported}`);
        }
        pending.push(imported);
      }
    }
  }
  if (paths.size > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
    throw new Error("shared player Vite graph exceeds its file bound");
  }
  const projectedManifest = Object.fromEntries(
    [...visitedKeys]
      .sort(compareText)
      .map((key) => [key, manifest[key]]),
  );
  return {
    filePaths: [...paths].sort(compareText),
    manifestBytes: encoder.encode(canonicalizeJson(projectedManifest as CanonicalJsonValue)),
  };
}

function preflightFiles(files: readonly P7SharedPlayerBuiltFile[]): Map<string, Uint8Array> {
  if (files.length > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
    throw new Error("shared player built file count exceeds its bound");
  }
  let total = 0;
  for (const file of files) {
    const byteLength = (file.bytes as { readonly byteLength?: unknown } | null)?.byteLength;
    if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0) {
      throw new Error("shared player built file byte length is invalid");
    }
    if ((byteLength as number) > P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES) {
      throw new Error("shared player built file exceeds its byte bound");
    }
    total += byteLength as number;
    if (total > P7_SHARED_PLAYER_GRAPH_MAX_TOTAL_BYTES) {
      throw new Error("shared player built file total exceeds its byte bound");
    }
  }
  const result = new Map<string, Uint8Array>();
  for (const file of files) {
    const path = safePath(file.path, "shared player built file path");
    if (result.has(path)) throw new Error(`shared player built file is duplicated: ${path}`);
    if (!(file.bytes instanceof Uint8Array)) throw new Error(`shared player built file is invalid: ${path}`);
    result.set(path, new Uint8Array(file.bytes));
  }
  return result;
}

export async function buildP7SharedPlayerGraphAttestation(
  input: P7SharedPlayerGraphBuildInput,
): Promise<P7SharedPlayerGraphAttestationV1> {
  const manifest = parseViteManifest(input.viteManifestBytes);
  const graph = reachableGraph(manifest);
  const expectedPaths = graph.filePaths;
  const filesByPath = preflightFiles(input.builtFiles);
  const unexpected = [...filesByPath.keys()].find((path) => !expectedPaths.includes(path));
  if (unexpected !== undefined) throw new Error(`shared player has an unexpected built file: ${unexpected}`);
  if (filesByPath.size !== expectedPaths.length || expectedPaths.some((path) => !filesByPath.has(path))) {
    throw new Error("shared player built file set is incomplete");
  }
  if (!(input.sourceEntryBytes instanceof Uint8Array)
    || input.sourceEntryBytes.byteLength > P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES) {
    throw new Error("shared player source entry exceeds its byte bound");
  }
  const files = await Promise.all(expectedPaths.map(async (path) => ({
    path,
    content: await referenceSourceBytes(filesByPath.get(path)!, input.sha256),
  })));
  const entry = files.find(({ path }) => path === P7_SHARED_PLAYER_DIST_ENTRY)!;
  const byteLength = files.reduce((total, file) => total + file.content.byteLength, 0);
  return {
    artifact: P7_SHARED_PLAYER_GRAPH_ARTIFACT,
    version: 1,
    viteManifest: {
      key: P7_SHARED_PLAYER_VITE_MANIFEST_KEY,
      content: await referenceSourceBytes(graph.manifestBytes, input.sha256),
    },
    source: {
      entryPath: P7_SHARED_PLAYER_SOURCE_ENTRY,
      entryContent: await referenceSourceBytes(input.sourceEntryBytes, input.sha256),
      closureRevision: boundedText(input.sourceClosureRevision, "shared player source closure revision"),
    },
    toolchainRevision: boundedText(input.toolchainRevision, "shared player toolchain revision"),
    entry: { path: P7_SHARED_PLAYER_DIST_ENTRY, content: entry.content },
    filesOrder: "path",
    files,
    totals: { fileCount: files.length, byteLength },
  };
}

function copyAttestation(value: unknown): P7SharedPlayerGraphAttestationV1 {
  const record = exactKeys(value, [
    "artifact", "entry", "files", "filesOrder", "source", "toolchainRevision",
    "totals", "version", "viteManifest",
  ], "shared player graph attestation");
  if (
    record.artifact !== P7_SHARED_PLAYER_GRAPH_ARTIFACT
    || record.version !== 1
    || record.filesOrder !== "path"
  ) throw new Error("shared player graph attestation identity is unsupported");
  const rawManifest = exactKeys(record.viteManifest, ["content", "key"], "shared player Vite binding");
  if (rawManifest.key !== P7_SHARED_PLAYER_VITE_MANIFEST_KEY) {
    throw new Error("shared player Vite manifest key drifted");
  }
  const rawSource = exactKeys(
    record.source,
    ["closureRevision", "entryContent", "entryPath"],
    "shared player source binding",
  );
  if (rawSource.entryPath !== P7_SHARED_PLAYER_SOURCE_ENTRY) {
    throw new Error("shared player source entry path drifted");
  }
  const rawEntry = exactKeys(record.entry, ["content", "path"], "shared player entry binding");
  if (rawEntry.path !== P7_SHARED_PLAYER_DIST_ENTRY) {
    throw new Error("shared player dist entry path drifted");
  }
  if (!Array.isArray(record.files) || record.files.length > P7_SHARED_PLAYER_GRAPH_MAX_FILES) {
    throw new Error("shared player graph file count exceeds its bound");
  }
  let previous = "";
  const files = record.files.map((value, index) => {
    const file = exactKeys(value, ["content", "path"], `shared player graph file ${index}`);
    const path = safePath(file.path, `shared player graph file ${index} path`);
    if (index > 0 && compareText(previous, path) >= 0) {
      throw new Error("shared player graph file order is not strict");
    }
    previous = path;
    return { path, content: reference(file.content, `shared player graph file ${index} content`) };
  });
  const entryContent = reference(rawEntry.content, "shared player entry content");
  const declaredEntry = files.find(({ path }) => path === P7_SHARED_PLAYER_DIST_ENTRY);
  if (declaredEntry === undefined || !sameReference(declaredEntry.content, entryContent)) {
    throw new Error("shared player graph entry content drifted");
  }
  const totals = exactKeys(record.totals, ["byteLength", "fileCount"], "shared player graph totals");
  const byteLength = files.reduce((total, file) => total + file.content.byteLength, 0);
  if (totals.fileCount !== files.length || totals.byteLength !== byteLength) {
    throw new Error("shared player graph totals are not derived exactly");
  }
  return {
    artifact: P7_SHARED_PLAYER_GRAPH_ARTIFACT,
    version: 1,
    viteManifest: {
      key: P7_SHARED_PLAYER_VITE_MANIFEST_KEY,
      content: reference(rawManifest.content, "shared player Vite manifest content"),
    },
    source: {
      entryPath: P7_SHARED_PLAYER_SOURCE_ENTRY,
      entryContent: reference(rawSource.entryContent, "shared player source entry content"),
      closureRevision: boundedText(rawSource.closureRevision, "shared player source closure revision"),
    },
    toolchainRevision: boundedText(record.toolchainRevision, "shared player toolchain revision"),
    entry: { path: P7_SHARED_PLAYER_DIST_ENTRY, content: entryContent },
    filesOrder: "path",
    files,
    totals: { fileCount: files.length, byteLength },
  };
}

export function canonicalizeP7SharedPlayerGraphAttestation(
  value: P7SharedPlayerGraphAttestationV1,
): CanonicalJson {
  const copied = copyAttestation(value);
  const canonical = canonicalizeJson(copied as unknown as CanonicalJsonValue);
  if (encoder.encode(canonical).byteLength > P7_SHARED_PLAYER_GRAPH_MAX_ATTESTATION_BYTES) {
    throw new Error("shared player graph attestation exceeds its byte bound");
  }
  return canonical;
}

export function parseP7SharedPlayerGraphAttestation(value: string): P7SharedPlayerGraphAttestationV1 {
  if (encoder.encode(value).byteLength > P7_SHARED_PLAYER_GRAPH_MAX_ATTESTATION_BYTES) {
    throw new Error("shared player graph attestation exceeds its byte bound");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error: unknown) {
    throw new Error("shared player graph attestation is invalid JSON", { cause: error });
  }
  const copied = copyAttestation(parsed);
  if (canonicalizeP7SharedPlayerGraphAttestation(copied) !== value) {
    throw new Error("shared player graph attestation is not canonical JSON");
  }
  return copied;
}

export async function attestP7SharedPlayerGraph(
  input: P7SharedPlayerGraphBuildInput & { readonly attestation: P7SharedPlayerGraphAttestationV1 },
): Promise<{
  readonly fileCount: number;
  readonly byteLength: number;
  readonly entryContent: BlobReferenceV1;
}> {
  const expected = copyAttestation(input.attestation);
  const observed = await buildP7SharedPlayerGraphAttestation(input);
  if (!sameReference(expected.viteManifest.content, observed.viteManifest.content)) {
    throw new Error("shared player Vite manifest content drifted");
  }
  if (!sameReference(expected.source.entryContent, observed.source.entryContent)) {
    throw new Error("shared player source entry content drifted");
  }
  if (
    expected.source.closureRevision !== observed.source.closureRevision
    || expected.toolchainRevision !== observed.toolchainRevision
  ) throw new Error("shared player source or toolchain revision drifted");
  if (
    expected.files.length !== observed.files.length
    || expected.files.some((file, index) => (
      file.path !== observed.files[index]?.path
      || !sameReference(file.content, observed.files[index]!.content)
    ))
  ) throw new Error("shared player built file content drifted");
  return {
    fileCount: observed.totals.fileCount,
    byteLength: observed.totals.byteLength,
    entryContent: observed.entry.content,
  };
}
