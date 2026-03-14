import { basename, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parseSolutionFile } from "@content/api/solution-file";
import type { LoadedSolutionFile, SolutionFileRepository } from "@replay-verifier/ports/SolutionFileRepository";

export class NodeSolutionFileRepository implements SolutionFileRepository {
  async loadSolutionFile(path: string): Promise<LoadedSolutionFile> {
    const resolvedPath = resolve(path);
    const bytes = new Uint8Array(await readFile(resolvedPath));

    return {
      path: resolvedPath,
      label: basename(resolvedPath),
      file: parseSolutionFile(bytes),
    };
  }
}
