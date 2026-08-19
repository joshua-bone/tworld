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
import {
  P6A_CHECKED_OUTPUT_ROOT,
  P6A_LEVEL_ROUTE,
  type P6aReviewOutput,
} from "./buildP6aReviewOutputs";

export type P6aTransactionTargets = {
  readonly repositoryRoot: string;
  readonly repositoryCcsolverRoot: string;
  readonly checkedOutputRoot: string;
  readonly distOutputRoot: string;
};

const CHECKED_FILE_LAYOUT = [
  ["alignment.json", "application/json"],
  ["lynx/causal-journal.json", "application/json"],
  ["manifest.json", "application/json"],
  ["ms/causal-journal.json", "application/json"],
  ["portfolio.json", "application/json"],
  ["review.html", "text/html"],
  ["review.md", "text/markdown"],
] as const satisfies readonly (readonly [string, P6aReviewOutput["mediaType"]])[];

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function rawCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

export function resolveP6aTransactionTargets(repositoryRoot: string): P6aTransactionTargets {
  const root = resolve(repositoryRoot);
  const repositoryCcsolverRoot = resolve(root, "ccsolver");
  const checkedOutputRoot = resolve(root, P6A_CHECKED_OUTPUT_ROOT);
  const distOutputRoot = resolve(root, "web/dist", P6A_LEVEL_ROUTE);
  const expectedCheckedSuffix = ["fixtures", "golden", "p6a", "cclp1-001"].join(sep);
  const expectedDistSuffix = [
    "dev",
    "ccsolver",
    "levels",
    "cclp1",
    "001-key-pyramid",
    "causal-alignment",
  ].join(sep);
  if (
    checkedOutputRoot === repositoryCcsolverRoot
    || relative(repositoryCcsolverRoot, checkedOutputRoot) !== expectedCheckedSuffix
    || relative(resolve(root, "web/dist"), distOutputRoot) !== expectedDistSuffix
  ) {
    throw new Error("P6A transaction target scope invariant failed");
  }
  return {
    repositoryRoot: root,
    repositoryCcsolverRoot,
    checkedOutputRoot,
    distOutputRoot,
  };
}

export function assertP6aOutputPath(
  repositoryRoot: string,
  outputRootRelative: string,
  outputPath: string,
): string {
  if (
    isAbsolute(outputPath)
    || outputPath.includes("\\")
    || outputPath.split("/").includes("..")
  ) {
    throw new Error(`P6A unsafe output path: ${outputPath}`);
  }
  const root = resolve(repositoryRoot, outputRootRelative);
  const target = resolve(repositoryRoot, outputPath);
  return safeDescendant(root, target, `P6A output ${outputPath}`);
}

async function listFiles(directory: string, prefix = ""): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
  const result: string[] = [];
  for (const entry of entries.sort((left, right) => rawCompare(left.name, right.name))) {
    const entryPath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      result.push(...await listFiles(resolve(directory, entry.name), entryPath));
    } else if (entry.isFile()) {
      result.push(entryPath);
    } else {
      throw new Error(`P6A output leaf contains a non-file entry: ${entryPath}`);
    }
  }
  return result;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((byte, index) => byte === right[index]);
}

export async function loadCheckedP6aDistOutputs(
  repositoryRoot: string,
): Promise<readonly P6aReviewOutput[]> {
  resolveP6aTransactionTargets(repositoryRoot);
  const checkedRoot = resolve(repositoryRoot, P6A_CHECKED_OUTPUT_ROOT);
  const actual = await listFiles(checkedRoot);
  const expected = CHECKED_FILE_LAYOUT.map(([path]) => path);
  if (
    actual.length !== expected.length
    || expected.some((path, index) => path !== actual[index])
  ) {
    throw new Error(
      `checked P6A dist source file set drifted: expected ${expected.length}, received ${actual.length}`,
    );
  }
  const checkedOutputs = await Promise.all(CHECKED_FILE_LAYOUT.map(
    async ([suffix, mediaType]): Promise<P6aReviewOutput> => {
      const path = `${P6A_CHECKED_OUTPUT_ROOT}/${suffix}`;
      const content = new Uint8Array(await readFile(resolve(repositoryRoot, path)));
      if (mediaType === "application/json") {
        const text = new TextDecoder().decode(content);
        const parsed: unknown = JSON.parse(text);
        if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
          throw new Error(`checked P6A JSON is not canonical: ${path}`);
        }
      }
      return { path, mediaType, content };
    },
  ));
  const manifestOutput = checkedOutputs.find(({ path }) => path.endsWith("/manifest.json"))!;
  const manifest = JSON.parse(new TextDecoder().decode(manifestOutput.content)) as Record<string, any>;
  const payloads = checkedOutputs.filter(({ path }) => !path.endsWith("/manifest.json"));
  if (
    manifest.manifestType !== "p6a-key-pyramid-causal-review-manifest"
    || manifest.manifestVersion !== 1
    || manifest.caseId !== "cclp1-001"
    || manifest.proof?.retention !== "complete"
    || manifest.filesOrder !== "path"
    || !Array.isArray(manifest.files)
    || manifest.files.length !== payloads.length
  ) {
    throw new Error("checked P6A manifest is not an authoritative complete Key Pyramid leaf");
  }
  const sha256 = new WebCryptoSha256();
  for (let index = 0; index < payloads.length; index += 1) {
    const output = payloads[index]!;
    const declared = manifest.files[index] as Record<string, any> | undefined;
    const actualReference = await referenceSourceBytes(output.content, sha256);
    if (
      declared?.path !== output.path
      || declared.mediaType !== output.mediaType
      || declared.content?.digest !== actualReference.digest
      || declared.content?.byteLength !== actualReference.byteLength
    ) {
      throw new Error(`checked P6A manifest payload drifted: ${output.path}`);
    }
  }
  return checkedOutputs.map((output) => {
    const suffix = output.path.slice(`${P6A_CHECKED_OUTPUT_ROOT}/`.length);
    return {
      ...output,
      path: `${P6A_LEVEL_ROUTE}/${suffix === "review.html" ? "index.html" : suffix}`,
    };
  }).sort((left, right) => rawCompare(left.path, right.path));
}

async function stageOutputs(
  repositoryRoot: string,
  outputRootRelative: string,
  stagingRoot: string,
  outputs: readonly P6aReviewOutput[],
): Promise<void> {
  const paths = new Set<string>();
  for (const output of outputs) {
    const relativePath = assertP6aOutputPath(
      repositoryRoot,
      outputRootRelative,
      output.path,
    );
    if (paths.has(relativePath)) throw new Error(`P6A duplicate output path: ${output.path}`);
    paths.add(relativePath);
    const stagedPath = resolve(stagingRoot, relativePath);
    safeDescendant(stagingRoot, stagedPath, `P6A staged output ${output.path}`);
    await mkdir(dirname(stagedPath), { recursive: true });
    await writeFile(stagedPath, output.content);
  }
}

export async function checkP6aOutputTree(
  repositoryRoot: string,
  outputRootRelative: string,
  outputs: readonly P6aReviewOutput[],
): Promise<void> {
  const outputRoot = resolve(repositoryRoot, outputRootRelative);
  const expected = outputs.map(({ path }) => (
    assertP6aOutputPath(repositoryRoot, outputRootRelative, path)
  )).sort(rawCompare);
  const actual = await listFiles(outputRoot);
  if (
    expected.length !== actual.length
    || expected.some((path, index) => path !== actual[index])
  ) {
    throw new Error(
      `checked P6A output file set drifted: expected ${expected.length}, received ${actual.length}`,
    );
  }
  for (const output of outputs) {
    const checked = new Uint8Array(await readFile(resolve(repositoryRoot, output.path)));
    if (!bytesEqual(checked, output.content)) {
      throw new Error(`checked P6A output drifted: ${output.path}`);
    }
  }
}

async function writeLeafTransactionally(
  repositoryRoot: string,
  outputRootRelative: string,
  outputs: readonly P6aReviewOutput[],
): Promise<void> {
  if (outputs.length === 0) throw new Error("P6A output transaction requires at least one file");
  const root = resolve(repositoryRoot);
  const outputRoot = resolve(root, outputRootRelative);
  safeDescendant(root, outputRoot, "P6A fixed output root");
  const stagingDirectory = await mkdtemp(resolve(root, ".p6a-output-"));
  const stagedRoot = resolve(stagingDirectory, "new");
  const backupRoot = resolve(stagingDirectory, "old");
  let oldMoved = false;
  let newPromoted = false;
  let preserveStagingDirectory = false;
  try {
    await stageOutputs(root, outputRootRelative, stagedRoot, outputs);
    await mkdir(dirname(outputRoot), { recursive: true });
    try {
      await rename(outputRoot, backupRoot);
      oldMoved = true;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    await rename(stagedRoot, outputRoot);
    newPromoted = true;
  } catch (error) {
    const rollbackFailures: unknown[] = [];
    try {
      if (newPromoted) await rm(outputRoot, { recursive: true, force: true });
    } catch (rollbackError) {
      rollbackFailures.push(rollbackError);
    }
    try {
      if (oldMoved) await rename(backupRoot, outputRoot);
    } catch (rollbackError) {
      rollbackFailures.push(rollbackError);
    }
    if (rollbackFailures.length > 0) {
      preserveStagingDirectory = true;
      throw new AggregateError(
        [error, ...rollbackFailures],
        `P6A transaction and rollback failed; recovery files remain at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

export async function writeP6aCheckedOutputsTransactionally(
  repositoryRoot: string,
  outputs: readonly P6aReviewOutput[],
): Promise<void> {
  const targets = resolveP6aTransactionTargets(repositoryRoot);
  if (targets.checkedOutputRoot !== resolve(repositoryRoot, P6A_CHECKED_OUTPUT_ROOT)) {
    throw new Error("P6A checked output target drifted");
  }
  await writeLeafTransactionally(repositoryRoot, P6A_CHECKED_OUTPUT_ROOT, outputs);
}

export async function installP6aDistTransactionally(
  repositoryRoot: string,
  outputs: readonly P6aReviewOutput[],
): Promise<void> {
  const targets = resolveP6aTransactionTargets(repositoryRoot);
  const distRoot = resolve(repositoryRoot, "web/dist");
  await access(resolve(distRoot, "index.html"));
  if (targets.distOutputRoot !== resolve(distRoot, P6A_LEVEL_ROUTE)) {
    throw new Error("P6A dist output target drifted");
  }
  await writeLeafTransactionally(
    repositoryRoot,
    `web/dist/${P6A_LEVEL_ROUTE}`,
    outputs.map((output) => ({
      ...output,
      path: `web/dist/${output.path}`,
    })),
  );
}
