import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION } from "@tworld/ccsolver/alignment";

export const P6B_P7A_CHECKED_ROOT = "ccsolver/fixtures/golden/p7a/phase-a-key-door" as const;
export const P6B_P7A_DIST_ROUTE = "dev/ccsolver/experiments/phase-a/key-door/tactic-realization" as const;

export type P6bP7aMediaType = "application/json" | "image/png" | "text/html" | "text/markdown";
export type P6bP7aReviewOutput = {
  readonly path: string;
  readonly mediaType: P6bP7aMediaType;
  readonly content: Uint8Array;
};

const CHECKED_LAYOUT = [
  ["assets/standard-artwork-lynx.png", "image/png"],
  ["assets/standard-artwork-ms.png", "image/png"],
  ["fixture.json", "application/json"],
  ["lynx/replay-certificate.json", "application/json"],
  ["lynx/tactic-realization.json", "application/json"],
  ["manifest.json", "application/json"],
  ["ms/replay-certificate.json", "application/json"],
  ["ms/tactic-realization.json", "application/json"],
  ["portfolio-canaries.json", "application/json"],
  ["review.html", "text/html"],
  ["review.md", "text/markdown"],
] as const satisfies readonly (readonly [string, P6bP7aMediaType])[];

const MAXIMUM_FILE_BYTES = 6_000_000;
const MAXIMUM_TOTAL_BYTES = 16_000_000;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function safeDescendant(root: string, target: string, label: string): string {
  const inside = relative(root, target);
  if (
    inside.length === 0
    || inside === ".."
    || inside.startsWith("../")
    || inside.startsWith("..\\")
    || isAbsolute(inside)
  ) {
    throw new Error(`${label} escapes its fixed output leaf`);
  }
  return inside;
}

export function resolveP6bP7aTransactionTargets(repositoryRoot: string) {
  const root = resolve(repositoryRoot);
  const ccssolverRoot = resolve(root, "ccsolver");
  const checkedRoot = resolve(root, P6B_P7A_CHECKED_ROOT);
  const distRoot = resolve(root, "web/dist", P6B_P7A_DIST_ROUTE);
  if (
    checkedRoot === ccssolverRoot
    || relative(ccssolverRoot, checkedRoot) !== ["fixtures", "golden", "p7a", "phase-a-key-door"].join(sep)
    || relative(resolve(root, "web/dist"), distRoot)
      !== ["dev", "ccsolver", "experiments", "phase-a", "key-door", "tactic-realization"].join(sep)
  ) {
    throw new Error("P6B/P7A transaction target scope invariant failed");
  }
  return { repositoryRoot: root, ccssolverRoot, checkedRoot, distRoot };
}

export function assertP6bP7aOutputPath(
  repositoryRoot: string,
  outputRootRelative: string,
  outputPath: string,
): string {
  if (isAbsolute(outputPath) || outputPath.includes("\\") || outputPath.split("/").includes("..")) {
    throw new Error(`P6B/P7A unsafe output path: ${outputPath}`);
  }
  return safeDescendant(
    resolve(repositoryRoot, outputRootRelative),
    resolve(repositoryRoot, outputPath),
    `P6B/P7A output ${outputPath}`,
  );
}

async function listFiles(directory: string, prefix = ""): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(resolve(directory, entry.name), path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`P6B/P7A output leaf contains a non-file entry: ${path}`);
  }
  return files;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function assertCanonicalJson(path: string, content: Uint8Array): unknown {
  const text = new TextDecoder().decode(content);
  const value: unknown = JSON.parse(text);
  if (canonicalizeJson(value as CanonicalJsonValue) !== text) {
    throw new Error(`checked P6B/P7A JSON is not canonical: ${path}`);
  }
  return value;
}

function hasExactKeys(value: unknown, expected: readonly string[]): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

export async function loadCheckedP6bP7aDistOutputs(
  repositoryRoot: string,
): Promise<readonly P6bP7aReviewOutput[]> {
  resolveP6bP7aTransactionTargets(repositoryRoot);
  const checkedRoot = resolve(repositoryRoot, P6B_P7A_CHECKED_ROOT);
  const actual = await listFiles(checkedRoot);
  const expected = CHECKED_LAYOUT.map(([path]) => path);
  if (actual.length !== expected.length || expected.some((path, index) => path !== actual[index])) {
    throw new Error(`checked P6B/P7A file set drifted: expected ${expected.length}, received ${actual.length}`);
  }
  let totalBytes = 0;
  const outputs = await Promise.all(CHECKED_LAYOUT.map(async ([suffix, mediaType]) => {
    const path = `${P6B_P7A_CHECKED_ROOT}/${suffix}`;
    const content = new Uint8Array(await readFile(resolve(repositoryRoot, path)));
    totalBytes += content.byteLength;
    if (content.byteLength > MAXIMUM_FILE_BYTES) {
      throw new Error(`checked P6B/P7A file exceeds its byte bound: ${path}`);
    }
    if (mediaType === "application/json") assertCanonicalJson(path, content);
    return { path, mediaType, content } satisfies P6bP7aReviewOutput;
  }));
  if (totalBytes > MAXIMUM_TOTAL_BYTES) throw new Error("checked P6B/P7A leaf exceeds its byte bound");
  const manifestOutput = outputs.find(({ path }) => path.endsWith("/manifest.json"));
  if (manifestOutput === undefined) throw new Error("checked P6B/P7A leaf lacks its manifest");
  const manifest = assertCanonicalJson(manifestOutput.path, manifestOutput.content) as Record<string, any>;
  const payloads = outputs.filter(({ path }) => !path.endsWith("/manifest.json"));
  if (
    !hasExactKeys(manifest, ["manifestType", "manifestVersion", "caseId", "filesOrder", "files", "proof"])
    || !hasExactKeys(manifest.proof, [
      "standardOnly",
      "expandedTiles",
      "sourceScopePolicy",
      "sourceEligibilityReceipts",
      "portfolioClaims",
      "realEngineEvaluation",
      "checkpointRestore",
      "replayCertification",
      "donorInputRead",
      "nativeOracleParityClaimed",
    ])
    || manifest.manifestType !== "p6b-p7a-standard-tactic-review-manifest"
    || manifest.manifestVersion !== 1
    || manifest.caseId !== "phase-a-key-door"
    || manifest.proof?.standardOnly !== true
    || manifest.proof?.expandedTiles !== "excluded"
    || manifest.proof?.sourceScopePolicy !== P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION
    || manifest.proof?.sourceEligibilityReceipts !== 5
    || manifest.proof?.portfolioClaims !== "proposal-not-proven"
    || manifest.proof?.realEngineEvaluation !== true
    || manifest.proof?.checkpointRestore !== "exact"
    || manifest.proof?.replayCertification !== "fresh-runtime"
    || manifest.proof?.donorInputRead !== false
    || manifest.proof?.nativeOracleParityClaimed !== false
    || manifest.filesOrder !== "path"
    || !Array.isArray(manifest.files)
    || manifest.files.length !== payloads.length
  ) {
    throw new Error("checked P6B/P7A manifest does not describe the complete bounded proof leaf");
  }
  const sha256 = new WebCryptoSha256();
  for (let index = 0; index < payloads.length; index += 1) {
    const output = payloads[index]!;
    const declared = manifest.files[index] as Record<string, any> | undefined;
    const reference = await referenceSourceBytes(output.content, sha256);
    if (
      !hasExactKeys(declared, ["path", "mediaType", "content"])
      || !hasExactKeys(declared?.content, ["digest", "byteLength"])
      || declared?.path !== output.path
      || declared.mediaType !== output.mediaType
      || declared.content?.digest !== reference.digest
      || declared.content?.byteLength !== reference.byteLength
    ) {
      throw new Error(`checked P6B/P7A manifest payload drifted: ${output.path}`);
    }
  }
  return outputs.map((output) => {
    const suffix = output.path.slice(`${P6B_P7A_CHECKED_ROOT}/`.length);
    return {
      ...output,
      path: `${P6B_P7A_DIST_ROUTE}/${suffix === "review.html" ? "index.html" : suffix}`,
    };
  }).sort((left, right) => compareText(left.path, right.path));
}

export async function checkP6bP7aOutputTree(
  repositoryRoot: string,
  outputs: readonly P6bP7aReviewOutput[],
): Promise<void> {
  const expected = outputs.map(({ path }) => (
    assertP6bP7aOutputPath(repositoryRoot, P6B_P7A_CHECKED_ROOT, path)
  )).sort(compareText);
  const actual = await listFiles(resolve(repositoryRoot, P6B_P7A_CHECKED_ROOT));
  if (expected.length !== actual.length || expected.some((path, index) => path !== actual[index])) {
    throw new Error(`checked P6B/P7A output set drifted: expected ${expected.length}, received ${actual.length}`);
  }
  for (const output of outputs) {
    const current = new Uint8Array(await readFile(resolve(repositoryRoot, output.path)));
    if (!equalBytes(current, output.content)) {
      throw new Error(`checked P6B/P7A output drifted: ${output.path}`);
    }
  }
}

async function writeLeaf(
  repositoryRoot: string,
  outputRootRelative: string,
  outputs: readonly P6bP7aReviewOutput[],
): Promise<void> {
  if (outputs.length === 0) throw new Error("P6B/P7A transaction requires at least one file");
  const root = resolve(repositoryRoot);
  const outputRoot = resolve(root, outputRootRelative);
  safeDescendant(root, outputRoot, "P6B/P7A fixed output root");
  const staging = await mkdtemp(resolve(root, ".p6b-p7a-output-"));
  const fresh = resolve(staging, "new");
  const backup = resolve(staging, "old");
  let oldMoved = false;
  let newMoved = false;
  let preserve = false;
  try {
    const paths = new Set<string>();
    for (const output of outputs) {
      const suffix = assertP6bP7aOutputPath(root, outputRootRelative, output.path);
      if (paths.has(suffix)) throw new Error(`P6B/P7A duplicate output: ${output.path}`);
      paths.add(suffix);
      const staged = resolve(fresh, suffix);
      safeDescendant(fresh, staged, `P6B/P7A staged output ${output.path}`);
      await mkdir(dirname(staged), { recursive: true });
      await writeFile(staged, output.content);
    }
    await mkdir(dirname(outputRoot), { recursive: true });
    try {
      await rename(outputRoot, backup);
      oldMoved = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rename(fresh, outputRoot);
    newMoved = true;
  } catch (error) {
    const rollback: unknown[] = [];
    try { if (newMoved) await rm(outputRoot, { recursive: true, force: true }); } catch (cause) { rollback.push(cause); }
    try { if (oldMoved) await rename(backup, outputRoot); } catch (cause) { rollback.push(cause); }
    if (rollback.length > 0) {
      preserve = true;
      throw new AggregateError([error, ...rollback], `P6B/P7A rollback failed; recovery remains at ${staging}`);
    }
    throw error;
  } finally {
    if (!preserve) await rm(staging, { recursive: true, force: true });
  }
}

export async function writeP6bP7aCheckedOutputsTransactionally(
  repositoryRoot: string,
  outputs: readonly P6bP7aReviewOutput[],
): Promise<void> {
  const targets = resolveP6bP7aTransactionTargets(repositoryRoot);
  if (targets.checkedRoot !== resolve(repositoryRoot, P6B_P7A_CHECKED_ROOT)) {
    throw new Error("P6B/P7A checked target drifted");
  }
  await writeLeaf(repositoryRoot, P6B_P7A_CHECKED_ROOT, outputs);
}

export async function installP6bP7aDistTransactionally(
  repositoryRoot: string,
  outputs: readonly P6bP7aReviewOutput[],
): Promise<void> {
  const targets = resolveP6bP7aTransactionTargets(repositoryRoot);
  await access(resolve(repositoryRoot, "web/dist/index.html"));
  if (targets.distRoot !== resolve(repositoryRoot, "web/dist", P6B_P7A_DIST_ROUTE)) {
    throw new Error("P6B/P7A dist target drifted");
  }
  await writeLeaf(
    repositoryRoot,
    `web/dist/${P6B_P7A_DIST_ROUTE}`,
    outputs.map((output) => ({ ...output, path: `web/dist/${output.path}` })),
  );
}
