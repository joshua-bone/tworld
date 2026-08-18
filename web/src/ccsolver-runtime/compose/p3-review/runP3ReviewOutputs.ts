import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildP3ReviewOutputs,
  type P3ReviewOutput,
} from "./buildP3ReviewOutputs";

type Operation = "check" | "write";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

function parseArguments(arguments_: readonly string[]): Operation {
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  if (arguments_.length === 1 && arguments_[0] === "--write") return "write";
  throw new Error("choose exactly one of --check or --write");
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function resolveOutput(path: string): string {
  const target = resolve(repositoryRoot, path);
  const targetRelative = relative(repositoryRoot, target);
  if (
    targetRelative.length === 0
    || targetRelative === ".."
    || targetRelative.startsWith("../")
    || targetRelative.startsWith("..\\")
    || isAbsolute(targetRelative)
  ) {
    throw new Error(`P3 output escapes repository root: ${path}`);
  }
  return target;
}

async function writeTransactionally(outputs: readonly P3ReviewOutput[]): Promise<void> {
  const stagingDirectory = await mkdtemp(resolve(repositoryRoot, ".p3-output-"));
  const staged: string[] = [];
  const targets: string[] = [];
  const backups = new Map<number, string>();
  const promoted = new Set<number>();
  let preserveStagingDirectory = false;
  try {
    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index]!;
      const target = resolveOutput(output.path);
      const stagedPath = resolve(stagingDirectory, "new", String(index));
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, output.content, "utf8");
      staged.push(stagedPath);
      targets.push(target);
    }
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      const backup = resolve(stagingDirectory, "old", String(index));
      await mkdir(dirname(target), { recursive: true });
      await mkdir(dirname(backup), { recursive: true });
      try {
        await rename(target, backup);
        backups.set(index, backup);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      await rename(staged[index]!, target);
      promoted.add(index);
    }
  } catch (error) {
    const rollbackFailures: unknown[] = [];
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      try {
        if (promoted.has(index)) await rm(targets[index]!, { force: true });
        const backup = backups.get(index);
        if (backup !== undefined) await rename(backup, targets[index]!);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    if (rollbackFailures.length > 0) {
      preserveStagingDirectory = true;
      throw new AggregateError(
        [error, ...rollbackFailures],
        `P3 output transaction and rollback failed; recovery files remain at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

async function apply(operation: Operation): Promise<void> {
  const outputs = await buildP3ReviewOutputs(repositoryRoot);
  if (operation === "write") {
    await writeTransactionally(outputs);
  }
  for (const output of outputs) {
    const absolutePath = resolve(repositoryRoot, output.path);
    if (operation === "write") continue;
    let checked: string;
    try {
      checked = await readFile(absolutePath, "utf8");
    } catch (error) {
      throw new Error(`checked P3 output is missing: ${output.path}`, { cause: error });
    }
    if (checked !== output.content) {
      throw new Error(`checked P3 output drifted: ${output.path}`);
    }
  }
  process.stdout.write(
    `${operation === "write" ? "Wrote" : "Verified"} ${outputs.length} P3 review outputs.\n`,
  );
}

try {
  await apply(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(
    "Usage: npx vite-node src/ccsolver-runtime/compose/p3-review/runP3ReviewOutputs.ts --check|--write\n",
  );
  process.exitCode = 1;
}
