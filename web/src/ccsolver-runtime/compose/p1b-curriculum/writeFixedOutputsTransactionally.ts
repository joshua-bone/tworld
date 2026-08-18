import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { CanonicalJson } from "@tworld/ccsolver/domain";

export interface FixedCanonicalOutput {
  readonly path: string;
  readonly canonicalJson: CanonicalJson;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function resolveFixedOutput(repositoryRoot: string, path: string): string {
  const target = resolve(repositoryRoot, path);
  const targetRelative = relative(repositoryRoot, target);
  if (
    targetRelative.length === 0
    || targetRelative === ".."
    || targetRelative.startsWith("../")
    || targetRelative.startsWith("..\\")
    || isAbsolute(targetRelative)
  ) {
    throw new Error(`fixed output escapes repository root: ${path}`);
  }
  return target;
}

/**
 * Stages every byte before touching checked files. A commit-time failure rolls
 * promoted files back and restores their exact predecessors. Recovery data is
 * intentionally retained if rollback itself ever fails.
 */
export async function writeFixedOutputsTransactionally(
  repositoryRoot: string,
  outputs: readonly FixedCanonicalOutput[],
): Promise<void> {
  const stagingDirectory = await mkdtemp(resolve(repositoryRoot, ".p1b-output-"));
  const staged: string[] = [];
  const targets: string[] = [];
  const backups = new Map<number, string>();
  const promoted = new Set<number>();
  let preserveStagingDirectory = false;
  try {
    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index]!;
      const target = resolveFixedOutput(repositoryRoot, output.path);
      const stagedPath = resolve(stagingDirectory, "new", String(index));
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, output.canonicalJson, "utf8");
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
        if (promoted.has(index)) {
          await rm(targets[index]!, { force: true });
        }
        const backup = backups.get(index);
        if (backup !== undefined) {
          await rename(backup, targets[index]!);
        }
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    if (rollbackFailures.length > 0) {
      preserveStagingDirectory = true;
      throw new AggregateError(
        [error, ...rollbackFailures],
        `fixed output transaction and rollback both failed; recovery files remain at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}
