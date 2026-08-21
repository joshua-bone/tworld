import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import { afterEach, describe, expect, it } from "vitest";
import type { P7bTrainingPackBuildResult } from "../p7b-training-review/buildP7bTrainingPackOutputs";
import { P7B_TRAINING_PACK_CHECKED_PARENT } from "../p7b-training-review/p7TrainingPackPaths";
import {
  buildP7TrainingPresentationAuthority,
  buildP7TrainingPresentationLeaf,
  canonicalizeP7TrainingPresentationAuthority,
} from "./p7TrainingPresentationContract";
import {
  loadCheckedP7TrainingPresentationAuthorities,
  p7TrainingPresentationAuthorityPath,
  writeP7TrainingPresentationAuthoritiesTransactionally,
} from "./p7TrainingPresentationAuthorityIo";

const sha256 = new WebCryptoSha256();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("P7 checked presentation authority IO", () => {
  it("rejects a canonical authority transplanted under another pack filename", async () => {
    const repositoryRoot = await mkdtemp(resolve(tmpdir(), "tworld-p7-presentation-authority-"));
    roots.push(repositoryRoot);
    const manifest = new TextEncoder().encode("manifest");
    const execution = new TextEncoder().encode("execution");
    const manifestContent = await referenceSourceBytes(manifest, sha256);
    const executionIndexContent = await referenceSourceBytes(execution, sha256);
    const outputRoot = `${P7B_TRAINING_PACK_CHECKED_PARENT}/cclp1`;
    const built = {
      outputs: [
        { path: `${outputRoot}/manifest.json`, mediaType: "application/json", content: manifest },
        { path: `${outputRoot}/execution-index.json`, mediaType: "application/json", content: execution },
      ],
      manifestContent,
    } as unknown as P7bTrainingPackBuildResult;
    const leaf = await buildP7TrainingPresentationLeaf({
      binding: { headSha: "a".repeat(40), runId: "1", runAttempt: 1 },
      presentationRunner: {
        path: "runner/p7-training-presentation-runner.mjs",
        content: { digest: `sha256:${"9".repeat(64)}`, byteLength: 999 },
      },
      packId: "cclp1",
      reducedContent: { digest: `sha256:${"1".repeat(64)}`, byteLength: 1 },
      executionIndexContent,
      playerGraphContent: { digest: `sha256:${"2".repeat(64)}`, byteLength: 2 },
      built,
      sha256,
    });
    const authority = buildP7TrainingPresentationAuthority(leaf);
    const canonicalJson = canonicalizeP7TrainingPresentationAuthority(authority);
    await writeP7TrainingPresentationAuthoritiesTransactionally({
      repositoryRoot,
      authorities: [{
        packId: "cclp1",
        authority,
        canonicalJson,
        content: await referenceCanonicalJson(canonicalJson, sha256),
      }],
      sha256,
    });
    const cclp1 = resolve(repositoryRoot, p7TrainingPresentationAuthorityPath("cclp1"));
    const cclp4 = resolve(repositoryRoot, p7TrainingPresentationAuthorityPath("cclp4"));
    await writeFile(cclp4, await readFile(cclp1));
    await expect(loadCheckedP7TrainingPresentationAuthorities({
      repositoryRoot,
      packIds: ["cclp1"],
      sha256,
    })).rejects.toThrow("filename identity drifted");
  });
});
