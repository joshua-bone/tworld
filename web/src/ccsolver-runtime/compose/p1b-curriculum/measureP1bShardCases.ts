import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { CorpusSourcePort } from "../p1a-corpus/types";
import type { P1bMeasuredCorpusCaseV1 } from "./curriculumManifest";
import type { P1bMeasurementShardRequestV1 } from "./measuredCorpusShardContract";
import { measureP1bCorpusOccurrences } from "./measuredCorpusReport";

function sourcePort(repositoryRoot: string): CorpusSourcePort {
  const root = resolve(repositoryRoot);
  return {
    async readBytes(path) {
      const absolute = resolve(root, path);
      const relativePath = relative(root, absolute);
      if (relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath)) {
        throw new Error(`corpus source escapes repository root: ${path}`);
      }
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink() || !stat.isFile() || await realpath(absolute) !== absolute) {
        throw new Error(`corpus source is not a direct regular file: ${path}`);
      }
      return new Uint8Array(await readFile(absolute));
    },
  };
}

/** Measures one independently verified request with one live paired analysis. */
export async function measureP1bShardCases(input: {
  readonly repositoryRoot: string;
  readonly request: P1bMeasurementShardRequestV1;
  readonly sha256: Sha256Port;
}): Promise<readonly P1bMeasuredCorpusCaseV1[]> {
  return measureP1bCorpusOccurrences({
    ...input.request.measurement,
    occurrences: input.request.occurrences,
    source: sourcePort(input.repositoryRoot),
    sha256: input.sha256,
    maxConcurrency: 1,
  });
}
