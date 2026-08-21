import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  attestP7TrainingPresentationPacks,
  type P7TrainingCheckedPresentationOperations,
} from "./p7TrainingPresentationRunnerCore";

const sha256 = new WebCryptoSha256();

describe("P7 checked-only presentation attestation", () => {
  it("uses no engine/artifact operation and rejects stale checked presentation bytes", async () => {
    const executionJson = canonicalizeJson({ authority: "execution" } as CanonicalJsonValue);
    const graphJson = canonicalizeJson({ authority: "graph" } as CanonicalJsonValue);
    const executionContent = await referenceCanonicalJson(executionJson, sha256);
    const graphContent = await referenceCanonicalJson(graphJson, sha256);
    const manifestBytes = new TextEncoder().encode("manifest");
    const manifestContent = await referenceSourceBytes(manifestBytes, sha256);
    const presentationContent = await referenceCanonicalJson(
      canonicalizeJson({ authority: "presentation" } as CanonicalJsonValue),
      sha256,
    );
    let engineCalls = 0;
    let proofCalls = 0;
    let stale = false;
    const operations = {
      loadExecutionAuthorities: async () => [{
        packId: "cclp1",
        artifact: {
          index: { authority: "execution" },
          canonicalJson: executionJson,
          content: executionContent,
          evidenceOutputs: [],
        },
      }],
      loadPresentationAuthorities: async () => [{
        packId: "cclp1",
        authority: {
          packId: "cclp1",
          executionIndexContent: executionContent,
          playerGraphContent: graphContent,
          manifestContent,
          outputs: [{
            path: "ccsolver/fixtures/golden/p7b/training-packs/cclp1/manifest.json",
            content: manifestContent,
          }],
        },
        canonicalJson: canonicalizeJson({ authority: "presentation" } as CanonicalJsonValue),
        content: presentationContent,
      }],
      loadPlayerGraph: async () => ({ graphAttestation: { authority: "graph" } }),
      attestCheckedPack: async () => ({
        executionIndex: { authority: "execution" },
        manifestContent,
        outputs: [{
          path: "ccsolver/fixtures/golden/p7b/training-packs/cclp1/manifest.json",
          mediaType: "application/json",
          content: stale ? new TextEncoder().encode("stale") : manifestBytes,
        }],
      }),
      assertProofReceiptCurrent: async () => { proofCalls += 1; },
      canonicalizeExecutionIndex: () => executionJson,
      canonicalizePlayerGraph: () => graphJson,
      attestEngineAuthorities: async () => { engineCalls += 1; },
    } as unknown as P7TrainingCheckedPresentationOperations;

    await expect(attestP7TrainingPresentationPacks({
      repositoryRoot: "/fixture-with-no-artifact-root",
      packIds: ["cclp1"],
      sha256,
      operations,
    })).resolves.toMatchObject([{ packId: "cclp1", outputCount: 1 }]);
    expect(engineCalls).toBe(0);
    expect(proofCalls).toBe(1);

    stale = true;
    await expect(attestP7TrainingPresentationPacks({
      repositoryRoot: "/fixture-with-no-artifact-root",
      packIds: ["cclp1"],
      sha256,
      operations,
    })).rejects.toThrow("output tree drifted");
    expect(engineCalls).toBe(0);
  });
});
