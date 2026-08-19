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
import {
  P4B_CHECKED_OUTPUT_ROOT,
  type P4bDossierOutput,
} from "./buildP4bDossierOutputs";
import { createP4bStaticFallbackScript } from "./p4bStaticRoutes";

const FALLBACK_ATTRIBUTE = "data-ccsolver-dossier-fallback";
const FALLBACK_PATTERN = /<script data-ccsolver-dossier-fallback>[\s\S]*?<\/script>/u;

export type P4bTransactionTargets = {
  readonly repositoryCcsolverRoot: string;
  readonly checkedOutputRoot: string;
  readonly distOutputRoot: string;
};

/** Exact mutation roots for audit and safety tests. */
export function resolveP4bTransactionTargets(repositoryRoot: string): P4bTransactionTargets {
  const root = resolve(repositoryRoot);
  const repositoryCcsolverRoot = resolve(root, "ccsolver");
  const checkedOutputRoot = resolve(root, P4B_CHECKED_OUTPUT_ROOT);
  const distOutputRoot = resolve(root, "web/dist/ccsolver");
  const expectedCheckedSuffix = ["fixtures", "golden", "p4b", "cclp1-001"].join(sep);
  const expectedDistSuffix = "ccsolver";
  if (
    checkedOutputRoot === repositoryCcsolverRoot
    || distOutputRoot === repositoryCcsolverRoot
    || relative(repositoryCcsolverRoot, checkedOutputRoot) !== expectedCheckedSuffix
    || relative(resolve(root, "web/dist"), distOutputRoot) !== expectedDistSuffix
  ) {
    throw new Error("P4B transaction target scope invariant failed");
  }
  return { repositoryCcsolverRoot, checkedOutputRoot, distOutputRoot };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function rawCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeRelative(root: string, target: string, label: string): string {
  const inside = relative(root, target);
  if (
    inside.length === 0
    || inside === ".."
    || inside.startsWith("../")
    || inside.startsWith("..\\")
    || isAbsolute(inside)
  ) {
    throw new Error(`${label} escapes its fixed output root`);
  }
  return inside;
}

function outputInsideRoot(
  repositoryRoot: string,
  outputRootRelative: string,
  outputPath: string,
): string {
  const root = resolve(repositoryRoot, outputRootRelative);
  const target = resolve(repositoryRoot, outputPath);
  return safeRelative(root, target, `P4B output ${outputPath}`);
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
      throw new Error(`P4B output root contains a non-file entry: ${entryPath}`);
    }
  }
  return result;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

async function stageOutputs(
  repositoryRoot: string,
  outputRootRelative: string,
  stagingRoot: string,
  outputs: readonly P4bDossierOutput[],
): Promise<void> {
  const paths = new Set<string>();
  for (const output of outputs) {
    const relativePath = outputInsideRoot(repositoryRoot, outputRootRelative, output.path);
    if (paths.has(relativePath)) throw new Error(`P4B duplicate output path: ${output.path}`);
    paths.add(relativePath);
    const stagedPath = resolve(stagingRoot, relativePath);
    safeRelative(stagingRoot, stagedPath, `P4B staged output ${output.path}`);
    await mkdir(dirname(stagedPath), { recursive: true });
    await writeFile(stagedPath, output.content);
  }
}

export async function checkExactOutputTree(
  repositoryRoot: string,
  outputRootRelative: string,
  outputs: readonly P4bDossierOutput[],
): Promise<void> {
  const outputRoot = resolve(repositoryRoot, outputRootRelative);
  const expected = outputs.map(({ path }) => (
    outputInsideRoot(repositoryRoot, outputRootRelative, path)
  )).sort(rawCompare);
  const actual = await listFiles(outputRoot);
  if (
    expected.length !== actual.length
    || expected.some((path, index) => path !== actual[index])
  ) {
    throw new Error(
      `checked P4B output file set drifted: expected ${expected.length}, received ${actual.length}`,
    );
  }
  for (const output of outputs) {
    let checked: Uint8Array;
    try {
      checked = new Uint8Array(await readFile(resolve(repositoryRoot, output.path)));
    } catch (error) {
      throw new Error(`checked P4B output is missing: ${output.path}`, { cause: error });
    }
    if (!bytesEqual(checked, output.content)) {
      throw new Error(`checked P4B output drifted: ${output.path}`);
    }
  }
}

export async function writeOutputTreeTransactionally(
  repositoryRoot: string,
  outputRootRelative: string,
  outputs: readonly P4bDossierOutput[],
): Promise<void> {
  if (outputs.length === 0) throw new Error("P4B output transaction requires at least one file");
  const outputRoot = resolve(repositoryRoot, outputRootRelative);
  if (outputRoot === resolve(repositoryRoot, "ccsolver")) {
    throw new Error("P4B refuses to replace the repository ccsolver root");
  }
  safeRelative(resolve(repositoryRoot), outputRoot, "P4B fixed output root");
  const stagingDirectory = await mkdtemp(resolve(repositoryRoot, ".p4b-output-"));
  const stagedRoot = resolve(stagingDirectory, "new");
  const backupRoot = resolve(stagingDirectory, "old");
  let oldMoved = false;
  let newPromoted = false;
  let preserveStagingDirectory = false;
  try {
    await stageOutputs(repositoryRoot, outputRootRelative, stagedRoot, outputs);
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
        `P4B output transaction and rollback failed; recovery files remain at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

export async function writeP4bCheckedOutputsTransactionally(
  repositoryRoot: string,
  outputs: readonly P4bDossierOutput[],
): Promise<void> {
  const targets = resolveP4bTransactionTargets(repositoryRoot);
  if (targets.checkedOutputRoot !== resolve(repositoryRoot, P4B_CHECKED_OUTPUT_ROOT)) {
    throw new Error("P4B checked output target drifted");
  }
  await writeOutputTreeTransactionally(repositoryRoot, P4B_CHECKED_OUTPUT_ROOT, outputs);
}

export function injectP4bFallback(existing404: string): string {
  const fallback = `<script ${FALLBACK_ATTRIBUTE}>${createP4bStaticFallbackScript()}</script>`;
  if (FALLBACK_PATTERN.test(existing404)) return existing404.replace(FALLBACK_PATTERN, fallback);
  const head = /<head(?:\s[^>]*)?>/iu;
  if (!head.test(existing404)) throw new Error("P4B Pages fallback requires an existing HTML head");
  return existing404.replace(head, (match) => `${match}${fallback}`);
}

export async function installP4bDistTransactionally(
  repositoryRoot: string,
  outputs: readonly P4bDossierOutput[],
): Promise<void> {
  if (outputs.length === 0) throw new Error("P4B dist transaction requires at least one file");
  const distRoot = resolve(repositoryRoot, "web/dist");
  const dossierRoot = resolve(distRoot, "ccsolver");
  const targets = resolveP4bTransactionTargets(repositoryRoot);
  if (dossierRoot !== targets.distOutputRoot) {
    throw new Error("P4B dist output target drifted");
  }
  const indexPath = resolve(distRoot, "index.html");
  const fallbackPath = resolve(distRoot, "404.html");
  await access(indexPath);
  const existingFallback = await readFile(fallbackPath, "utf8");
  const nextFallback = injectP4bFallback(existingFallback);
  const stagingDirectory = await mkdtemp(resolve(repositoryRoot, ".p4b-dist-"));
  const stagedDossier = resolve(stagingDirectory, "new-ccsolver");
  const stagedFallback = resolve(stagingDirectory, "new-404.html");
  const backupDossier = resolve(stagingDirectory, "old-ccsolver");
  const backupFallback = resolve(stagingDirectory, "old-404.html");
  let oldDossierMoved = false;
  let newDossierPromoted = false;
  let oldFallbackMoved = false;
  let newFallbackPromoted = false;
  let preserveStagingDirectory = false;
  try {
    // Dist output paths are relative to web/dist (for example
    // `ccsolver/index.html`), so validate their logical `ccsolver` root before
    // staging that subtree beneath the already-built dist directory.
    await stageOutputs(repositoryRoot, "ccsolver", stagedDossier, outputs);
    await writeFile(stagedFallback, nextFallback, "utf8");
    try {
      await rename(dossierRoot, backupDossier);
      oldDossierMoved = true;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    await rename(stagedDossier, dossierRoot);
    newDossierPromoted = true;
    await rename(fallbackPath, backupFallback);
    oldFallbackMoved = true;
    await rename(stagedFallback, fallbackPath);
    newFallbackPromoted = true;
  } catch (error) {
    const rollbackFailures: unknown[] = [];
    for (const rollback of [
      async () => { if (newFallbackPromoted) await rm(fallbackPath, { force: true }); },
      async () => { if (oldFallbackMoved) await rename(backupFallback, fallbackPath); },
      async () => { if (newDossierPromoted) await rm(dossierRoot, { recursive: true, force: true }); },
      async () => { if (oldDossierMoved) await rename(backupDossier, dossierRoot); },
    ]) {
      try {
        await rollback();
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    if (rollbackFailures.length > 0) {
      preserveStagingDirectory = true;
      throw new AggregateError(
        [error, ...rollbackFailures],
        `P4B dist transaction and rollback failed; recovery files remain at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}
