import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import type { CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import type { P7bTrainingPackBuildResult } from "../p7b-training-review/buildP7bTrainingPackOutputs";
import { P7B_TRAINING_PACK_CHECKED_PARENT } from "../p7b-training-review/p7TrainingPackPaths";
import {
  buildP7TrainingPresentationLeaf,
  buildP7TrainingPresentationAuthority,
  assertP7TrainingPresentationLeafRunner,
  canonicalizeP7TrainingPresentationAuthority,
  canonicalizeP7TrainingPresentationLeaf,
  parseP7TrainingPresentationLeaf,
} from "./p7TrainingPresentationContract";

const sha256 = new WebCryptoSha256();
const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/cclp1`;

describe("P7 presentation leaf contract", () => {
  it("binds attested manifest, authority, graph, and exact output bytes", async () => {
    const manifestBytes = new TextEncoder().encode("manifest");
    const executionBytes = new TextEncoder().encode("execution");
    const manifestContent = await referenceSourceBytes(manifestBytes, sha256);
    const executionIndexContent = await referenceSourceBytes(executionBytes, sha256);
    const built = {
      outputs: [
        { path: `${root}/manifest.json`, mediaType: "application/json", content: manifestBytes },
        { path: `${root}/execution-index.json`, mediaType: "application/json", content: executionBytes },
      ],
      manifestContent,
    } as unknown as P7bTrainingPackBuildResult;
    const presentationRunner = {
      path: "runner/p7-training-presentation-runner.mjs" as const,
      content: { digest: `sha256:${"9".repeat(64)}` as const, byteLength: 999 },
    };
    const leaf = await buildP7TrainingPresentationLeaf({
      binding: { headSha: "a".repeat(40), runId: "123", runAttempt: 1 },
      presentationRunner,
      packId: "cclp1",
      reducedContent: { digest: `sha256:${"1".repeat(64)}`, byteLength: 1 },
      executionIndexContent,
      playerGraphContent: { digest: `sha256:${"2".repeat(64)}`, byteLength: 2 },
      built,
      sha256,
    });
    const canonical = canonicalizeP7TrainingPresentationLeaf(leaf);
    expect(parseP7TrainingPresentationLeaf(canonical)).toEqual(leaf);
    expect(() => assertP7TrainingPresentationLeafRunner(leaf, {
      ...presentationRunner,
      content: { ...presentationRunner.content, byteLength: 1_000 },
    })).toThrow("runner content drifted");
    const repeatedRun = {
      ...leaf,
      binding: { headSha: "b".repeat(40), runId: "999", runAttempt: 7 },
      reducedContent: { digest: `sha256:${"3".repeat(64)}` as const, byteLength: 333 },
    };
    expect(canonicalizeP7TrainingPresentationAuthority(
      buildP7TrainingPresentationAuthority(repeatedRun),
    )).toBe(canonicalizeP7TrainingPresentationAuthority(
      buildP7TrainingPresentationAuthority(leaf),
    ));

    const mutation = structuredClone(leaf) as unknown as Record<string, unknown>;
    (mutation.executionIndexContent as Record<string, unknown>).byteLength = 999;
    expect(() => parseP7TrainingPresentationLeaf(
      canonicalizeJson(mutation as CanonicalJsonValue),
    )).toThrow("execution-index output binding drifted");
  });
});
