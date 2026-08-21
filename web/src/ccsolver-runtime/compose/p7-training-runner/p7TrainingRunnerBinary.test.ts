import { mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  P7_TRAINING_ENGINE_RUNNER_MAX_BYTES,
  referenceP7TrainingEngineRunnerBinary,
} from "./p7TrainingRunnerBinary";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("P7 bundled runner identity", () => {
  it("hashes a bounded regular file and rejects symlinks and oversized files", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7-runner-binary-"));
    roots.push(root);
    const regular = resolve(root, "runner.mjs");
    await writeFile(regular, "export {};\n", "utf8");
    await expect(referenceP7TrainingEngineRunnerBinary({
      executablePath: regular,
      sha256: new WebCryptoSha256(),
    })).resolves.toMatchObject({
      path: "runner/p7-training-engine-runner.mjs",
      content: { byteLength: 11 },
    });

    const linked = resolve(root, "linked.mjs");
    await symlink(regular, linked);
    await expect(referenceP7TrainingEngineRunnerBinary({
      executablePath: linked,
      sha256: new WebCryptoSha256(),
    })).rejects.toThrow("non-symlink");

    const oversized = resolve(root, "oversized.mjs");
    await writeFile(oversized, new Uint8Array());
    await truncate(oversized, P7_TRAINING_ENGINE_RUNNER_MAX_BYTES + 1);
    await expect(referenceP7TrainingEngineRunnerBinary({
      executablePath: oversized,
      sha256: new WebCryptoSha256(),
    })).rejects.toThrow("byte bound");
  });
});
