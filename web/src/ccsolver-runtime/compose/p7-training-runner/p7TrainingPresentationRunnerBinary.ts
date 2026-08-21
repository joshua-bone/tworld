import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import type { BlobReferenceV1 } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";

export const P7_TRAINING_PRESENTATION_RUNNER_PATH =
  "runner/p7-training-presentation-runner.mjs" as const;
export const P7_TRAINING_PRESENTATION_RUNNER_MAX_BYTES = 16 * 1024 * 1024;

export interface P7TrainingPresentationRunnerBinaryV1 {
  readonly path: typeof P7_TRAINING_PRESENTATION_RUNNER_PATH;
  readonly content: BlobReferenceV1;
}

export async function referenceP7TrainingPresentationRunnerBinary(input: {
  readonly executablePath: string;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingPresentationRunnerBinaryV1> {
  const executablePath = resolve(input.executablePath);
  const details = await lstat(executablePath);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new Error("P7 bundled presentation runner must be a regular non-symlink file");
  }
  if (details.size > P7_TRAINING_PRESENTATION_RUNNER_MAX_BYTES) {
    throw new Error("P7 bundled presentation runner exceeds its byte bound");
  }
  const bytes = new Uint8Array(await readFile(executablePath));
  if (bytes.byteLength !== details.size) {
    throw new Error("P7 bundled presentation runner changed while read");
  }
  return {
    path: P7_TRAINING_PRESENTATION_RUNNER_PATH,
    content: await referenceSourceBytes(bytes, input.sha256),
  };
}
