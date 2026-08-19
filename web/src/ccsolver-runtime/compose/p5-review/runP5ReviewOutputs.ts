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
  buildP5ReviewOutputs,
  type P5ReviewOutput,
} from "./buildP5ReviewOutputs";

type Operation = "check" | "write";

type Arguments = {
  readonly operation: Operation;
  readonly oraclePath: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const outputRootRelative = "ccsolver/fixtures/golden/p5/cclp1-001";
const outputRoot = resolve(repositoryRoot, outputRootRelative);

function parseArguments(arguments_: readonly string[]): Arguments {
  let operation: Operation | undefined;
  let oraclePath: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--check" || argument === "--write") {
      const candidate = argument.slice(2) as Operation;
      if (operation !== undefined) throw new Error("choose exactly one of --check or --write");
      operation = candidate;
      continue;
    }
    if (argument === "--oracle") {
      if (oraclePath !== undefined) throw new Error("provide --oracle exactly once");
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--oracle requires an executable path");
      }
      oraclePath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--oracle=")) {
      if (oraclePath !== undefined) throw new Error("provide --oracle exactly once");
      oraclePath = argument.slice("--oracle=".length);
      continue;
    }
    throw new Error(`unknown P5 argument: ${argument}`);
  }
  if (operation === undefined) throw new Error("choose exactly one of --check or --write");
  if (oraclePath === undefined || oraclePath.trim().length === 0) {
    throw new Error("--oracle is required; P5 never skips native certification");
  }
  return {
    operation,
    oraclePath: resolve(process.cwd(), oraclePath),
  };
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
    throw new Error(`P5 output escapes its fixed generated root: ${path}`);
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
      throw new Error(`P5 generated root contains a non-file entry: ${relativePath}`);
    }
  }
  return result;
}

async function writeTransactionally(outputs: readonly P5ReviewOutput[]): Promise<void> {
  const relativePaths = outputs.map(({ path }) => outputRelativePath(path));
  if (new Set(relativePaths).size !== relativePaths.length) {
    throw new Error("P5 output composition contains a duplicate path");
  }
  const stagingDirectory = await mkdtemp(resolve(repositoryRoot, ".p5-output-"));
  const stagedRoot = resolve(stagingDirectory, "new");
  const backupRoot = resolve(stagingDirectory, "old");
  let oldMoved = false;
  let newPromoted = false;
  let preserveStagingDirectory = false;
  try {
    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index]!;
      const stagedPath = resolve(stagedRoot, relativePaths[index]!);
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, output.content);
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
        `P5 output transaction and rollback failed; recovery files remain at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

async function checkOutputs(outputs: readonly P5ReviewOutput[]): Promise<void> {
  const expectedPaths = outputs.map(({ path }) => outputRelativePath(path)).sort();
  const checkedPaths = await listFiles(outputRoot);
  if (
    expectedPaths.length !== checkedPaths.length
    || expectedPaths.some((path, index) => path !== checkedPaths[index])
  ) {
    throw new Error(
      `checked P5 output file set drifted: expected ${expectedPaths.length}, `
      + `received ${checkedPaths.length}`,
    );
  }
  for (const output of outputs) {
    let checked: Buffer;
    try {
      checked = await readFile(resolve(repositoryRoot, output.path));
    } catch (error) {
      throw new Error(`checked P5 output is missing: ${output.path}`, { cause: error });
    }
    const expected = Buffer.from(
      typeof output.content === "string" ? new TextEncoder().encode(output.content) : output.content,
    );
    if (!checked.equals(expected)) {
      throw new Error(`checked P5 output drifted: ${output.path}`);
    }
  }
}

async function apply({ operation, oraclePath }: Arguments): Promise<void> {
  // The builder performs the native-oracle executable preflight before any
  // source loading or output mutation. The transaction starts only after both
  // targets have completed continuous execution and exact-file certification.
  const outputs = await buildP5ReviewOutputs(repositoryRoot, { oraclePath });
  if (operation === "write") {
    await writeTransactionally(outputs);
  } else {
    await checkOutputs(outputs);
  }
  process.stdout.write(
    `${operation === "write" ? "Wrote" : "Verified"} ${outputs.length} P5 review outputs; `
    + "12 target-specific subgoal capsules / 24 panel instances are bound to 14 exact scenes.\n",
  );
}

try {
  await apply(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(
    "Usage: npx vite-node src/ccsolver-runtime/compose/p5-review/runP5ReviewOutputs.ts "
    + "--check|--write --oracle <path-to-tworld-oracle>\n",
  );
  process.exitCode = 1;
}
