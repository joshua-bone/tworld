import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  P6B_P7A_CHECKED_ROOT,
  assertP6bP7aOutputPath,
  loadCheckedP6bP7aDistOutputs,
  resolveP6bP7aTransactionTargets,
} from "./p6bP7aReviewIo";

const encoder = new TextEncoder();

describe("P6B/P7A output safety and attestation", () => {
  it("can replace only the exact checked and hidden dist leaves", () => {
    const root = "/workspace/tworld";
    const targets = resolveP6bP7aTransactionTargets(root);
    expect(targets.checkedRoot).toBe(resolve(root, "ccsolver/fixtures/golden/p7a/phase-a-key-door"));
    expect(targets.distRoot).toBe(resolve(root, "web/dist/dev/ccsolver/experiments/phase-a/key-door/tactic-realization"));
    expect(targets.checkedRoot).not.toBe(targets.ccsolverRoot);
    expect(targets.distRoot).not.toBe(resolve(root, "web/dist/dev/ccsolver"));
  });

  it("rejects traversal, absolute paths, backslashes, and sibling leaves", () => {
    const root = "/workspace/tworld";
    expect(() => assertP6bP7aOutputPath(root, P6B_P7A_CHECKED_ROOT, `${P6B_P7A_CHECKED_ROOT}/fixture.json`)).not.toThrow();
    for (const unsafe of [
      `${P6B_P7A_CHECKED_ROOT}/../phase-a-other/fixture.json`,
      "/tmp/fixture.json",
      "ccsolver/fixtures/golden/p6a/cclp1-001/manifest.json",
      `${P6B_P7A_CHECKED_ROOT}\\fixture.json`,
    ]) {
      expect(() => assertP6bP7aOutputPath(root, P6B_P7A_CHECKED_ROOT, unsafe)).toThrow();
    }
  });

  it("attests the exact checked leaf without running either engine and rejects mutation", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p6b-p7a-"));
    const payloads = [
      ["assets/standard-artwork-lynx.png", "image/png", Uint8Array.of(1, 2, 3)],
      ["assets/standard-artwork-ms.png", "image/png", Uint8Array.of(4, 5, 6)],
      ["fixture.json", "application/json", encoder.encode(canonicalizeJson({ fixture: "key-door" }))],
      ["lynx/replay-certificate.json", "application/json", encoder.encode(canonicalizeJson({ target: "lynx", result: "won" }))],
      ["lynx/tactic-realization.json", "application/json", encoder.encode(canonicalizeJson({ target: "lynx", result: "won" }))],
      ["ms/replay-certificate.json", "application/json", encoder.encode(canonicalizeJson({ target: "ms", result: "won" }))],
      ["ms/tactic-realization.json", "application/json", encoder.encode(canonicalizeJson({ target: "ms", result: "won" }))],
      ["portfolio-canaries.json", "application/json", encoder.encode(canonicalizeJson({ canaries: 5 }))],
      ["review.html", "text/html", encoder.encode("<!doctype html><title>review</title>\n")],
      ["review.md", "text/markdown", encoder.encode("# Review\n")],
    ] as const;
    try {
      const sha256 = new WebCryptoSha256();
      const files = await Promise.all(payloads.map(async ([suffix, mediaType, content]) => ({
        path: `${P6B_P7A_CHECKED_ROOT}/${suffix}`,
        mediaType,
        content: await referenceSourceBytes(content, sha256),
      })));
      for (const [suffix, , content] of payloads) {
        const path = resolve(root, P6B_P7A_CHECKED_ROOT, suffix);
        await mkdir(resolve(path, ".."), { recursive: true });
        await writeFile(path, content);
      }
      const manifestPath = resolve(root, P6B_P7A_CHECKED_ROOT, "manifest.json");
      const manifest = {
        manifestType: "p6b-p7a-standard-tactic-review-manifest",
        manifestVersion: 1,
        caseId: "phase-a-key-door",
        proof: {
          standardOnly: true,
          expandedTiles: "excluded",
          sourceScopePolicy:
            "ccsolver-source-scope:no-expanded-cc1-tiles:dattools-68be18aca0dc42fa3929ff8160c6c8acea8c18e5:v1",
          sourceEligibilityReceipts: 5,
          portfolioClaims: "proposal-not-proven",
          realEngineEvaluation: true,
          checkpointRestore: "exact",
          replayCertification: "fresh-runtime",
          donorInputRead: false,
          nativeOracleParityClaimed: false,
        },
        filesOrder: "path",
        files,
      };
      await writeFile(manifestPath, encoder.encode(canonicalizeJson(manifest)));

      const dist = await loadCheckedP6bP7aDistOutputs(root);
      expect(dist).toHaveLength(11);
      expect(dist.map(({ path }) => path)).toContain(
        "dev/ccsolver/experiments/phase-a/key-door/tactic-realization/index.html",
      );
      await writeFile(manifestPath, encoder.encode(canonicalizeJson({
        ...manifest,
        proof: { ...manifest.proof, nativeOracleParityClaimed: true },
      })));
      await expect(loadCheckedP6bP7aDistOutputs(root)).rejects.toThrow(
        "complete bounded proof leaf",
      );
      await writeFile(manifestPath, encoder.encode(canonicalizeJson({
        ...manifest,
        proof: { ...manifest.proof, nativeOracleCertificate: "claimed" },
      })));
      await expect(loadCheckedP6bP7aDistOutputs(root)).rejects.toThrow(
        "complete bounded proof leaf",
      );
      await writeFile(manifestPath, encoder.encode(canonicalizeJson(manifest)));
      await writeFile(resolve(root, P6B_P7A_CHECKED_ROOT, "review.md"), "# Mutated\n");
      await expect(loadCheckedP6bP7aDistOutputs(root)).rejects.toThrow("manifest payload drifted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
