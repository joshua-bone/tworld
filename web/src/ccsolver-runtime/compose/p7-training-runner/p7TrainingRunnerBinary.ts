import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  P7_TRAINING_ENGINE_RUNNER_PATH,
  type P7TrainingRunnerBinaryV1,
} from "./p7TrainingRunnerContract";

export const P7_TRAINING_ENGINE_RUNNER_MAX_BYTES = 16 * 1024 * 1024;

export async function referenceP7TrainingEngineRunnerBinary(input: {
  readonly executablePath: string;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingRunnerBinaryV1> {
  const executablePath = resolve(input.executablePath);
  const details = await lstat(executablePath);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new Error("P7 bundled engine runner must be a regular non-symlink file");
  }
  if (details.size > P7_TRAINING_ENGINE_RUNNER_MAX_BYTES) {
    throw new Error("P7 bundled engine runner exceeds its byte bound");
  }
  const bytes = new Uint8Array(await readFile(executablePath));
  if (bytes.byteLength !== details.size) {
    throw new Error("P7 bundled engine runner changed while read");
  }
  return {
    path: P7_TRAINING_ENGINE_RUNNER_PATH,
    content: await referenceSourceBytes(bytes, input.sha256),
  };
}
