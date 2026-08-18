import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildP4aReviewOutputs,
  type P4aReviewOutput,
} from "./buildP4aReviewOutputs";

type Operation = "check" | "write";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const outputRootRelative = "ccsolver/fixtures/golden/p4a";
const outputRoot = resolve(repositoryRoot, outputRootRelative);

function parseArguments(arguments_: readonly string[]): Operation {
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  if (arguments_.length === 1 && arguments_[0] === "--write") return "write";
  throw new Error("choose exactly one of --check or --write");
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function outputRelativePath(path: string): string {
  const target = resolve(repositoryRoot, path);
  const insideOutputRoot = relative(outputRoot, target);
  if (
    insideOutputRoot.length === 0
    || insideOutputRoot === ".."
    || insideOutputRoot.startsWith("../")
    || insideOutputRoot.startsWith("..\\")
    || isAbsolute(insideOutputRoot)
  ) {
    throw new Error(`P4A output escapes its fixed generated root: ${path}`);
  }
  return insideOutputRoot;
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
  for (const entry of entries.sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ))) {
    const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      result.push(...await listFiles(resolve(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      result.push(relativePath);
    } else {
      throw new Error(`P4A generated root contains a non-file entry: ${relativePath}`);
    }
  }
  return result;
}

async function writeTransactionally(outputs: readonly P4aReviewOutput[]): Promise<void> {
  const stagingDirectory = await mkdtemp(resolve(repositoryRoot, ".p4a-output-"));
  const stagedRoot = resolve(stagingDirectory, "new");
  const backupRoot = resolve(stagingDirectory, "old");
  let oldMoved = false;
  let newPromoted = false;
  let preserveStagingDirectory = false;
  try {
    for (const output of outputs) {
      const stagedPath = resolve(stagedRoot, outputRelativePath(output.path));
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, output.content, "utf8");
    }
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
        `P4A output transaction and rollback failed; recovery files remain at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

async function checkOutputs(outputs: readonly P4aReviewOutput[]): Promise<void> {
  const expectedPaths = outputs.map(({ path }) => outputRelativePath(path)).sort();
  const checkedPaths = await listFiles(outputRoot);
  if (
    expectedPaths.length !== checkedPaths.length
    || expectedPaths.some((path, index) => path !== checkedPaths[index])
  ) {
    throw new Error(
      `checked P4A output file set drifted: expected ${expectedPaths.length}, received ${checkedPaths.length}`,
    );
  }
  for (const output of outputs) {
    let checked: string;
    try {
      checked = await readFile(resolve(repositoryRoot, output.path), "utf8");
    } catch (error) {
      throw new Error(`checked P4A output is missing: ${output.path}`, { cause: error });
    }
    if (checked !== output.content) {
      throw new Error(`checked P4A output drifted: ${output.path}`);
    }
  }
}

async function apply(operation: Operation): Promise<void> {
  const outputs = await buildP4aReviewOutputs(repositoryRoot);
  if (operation === "write") {
    await writeTransactionally(outputs);
  } else {
    await checkOutputs(outputs);
  }
  process.stdout.write(
    `${operation === "write" ? "Wrote" : "Verified"} ${outputs.length} P4A review outputs. Human review sidecars were read only.\n`,
  );
}

try {
  await apply(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(
    "Usage: npx vite-node src/ccsolver-runtime/compose/p4a-review/runP4aReviewOutputs.ts --check|--write\n",
  );
  process.exitCode = 1;
}
