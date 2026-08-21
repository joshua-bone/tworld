import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkP7TrainingPresentationRunManifest,
  prepareP7TrainingPresentationRunManifest,
} from "./p7TrainingPresentationRunManifest";
import { referenceP7TrainingPresentationRunnerBinary } from "./p7TrainingPresentationRunnerBinary";

const sha256 = new WebCryptoSha256();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("P7 presentation runner transport manifest", () => {
  it("rejects a tampered presentation bundle and a foreign run binding", async () => {
    const artifactRoot = await mkdtemp(resolve(tmpdir(), "tworld-p7-presentation-run-"));
    roots.push(artifactRoot);
    const executable = resolve(artifactRoot, "presentation.mjs");
    await writeFile(executable, "export const revision = 1;\n", "utf8");
    const runner = await referenceP7TrainingPresentationRunnerBinary({ executablePath: executable, sha256 });
    const binding = { headSha: "a".repeat(40), runId: "123", runAttempt: 1 } as const;
    await prepareP7TrainingPresentationRunManifest({ artifactRoot, binding, runner, sha256 });
    await expect(checkP7TrainingPresentationRunManifest({
      artifactRoot,
      binding,
      runner,
      sha256,
    })).resolves.toMatchObject({ manifest: { binding, runner } });
    await expect(checkP7TrainingPresentationRunManifest({
      artifactRoot,
      binding: { ...binding, runAttempt: 2 },
      runner,
      sha256,
    })).rejects.toThrow("binding drifted");

    const manifestPath = resolve(artifactRoot, "presentation-run.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    ((manifest.runner as Record<string, unknown>).content as Record<string, unknown>).digest =
      `sha256:${"0".repeat(64)}`;
    await writeFile(manifestPath, canonicalizeJson(manifest as CanonicalJsonValue), "utf8");
    await expect(checkP7TrainingPresentationRunManifest({
      artifactRoot,
      binding,
      runner,
      sha256,
    })).rejects.toThrow("runner content drifted");
  });
});
