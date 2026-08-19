import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  assertP6aOutputPath,
  loadCheckedP6aDistOutputs,
  resolveP6aTransactionTargets,
} from "./p6aReviewIo";

const checkedRoot = "ccsolver/fixtures/golden/p6a/cclp1-001";
const encoder = new TextEncoder();

describe("P6A destructive-operation scope", () => {
  it("can replace only the exact checked and causal-alignment leaves", () => {
    const repositoryRoot = "/workspace/tworld";
    const targets = resolveP6aTransactionTargets(repositoryRoot);

    expect(targets).toEqual({
      repositoryRoot: resolve(repositoryRoot),
      repositoryCcsolverRoot: resolve(repositoryRoot, "ccsolver"),
      checkedOutputRoot: resolve(
        repositoryRoot,
        "ccsolver/fixtures/golden/p6a/cclp1-001",
      ),
      distOutputRoot: resolve(
        repositoryRoot,
        "web/dist/dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment",
      ),
    });
    expect(targets.checkedOutputRoot).not.toBe(targets.repositoryCcsolverRoot);
    expect(targets.distOutputRoot).not.toBe(resolve(repositoryRoot, "web/dist/dev/ccsolver"));
  });

  it("rejects traversal, absolute paths, and output paths outside the selected leaf", () => {
    const repositoryRoot = "/workspace/tworld";

    expect(() => assertP6aOutputPath(
      repositoryRoot,
      checkedRoot,
      `${checkedRoot}/alignment.json`,
    )).not.toThrow();
    for (const unsafe of [
      `${checkedRoot}/../p5/manifest.json`,
      "/tmp/alignment.json",
      "ccsolver/fixtures/golden/p5/cclp1-001/manifest.json",
      `${checkedRoot}\\alignment.json`,
    ]) {
      expect(() => assertP6aOutputPath(repositoryRoot, checkedRoot, unsafe)).toThrow();
    }
  });

  it("validates and maps the exact checked leaf without executing a builder", async () => {
    const repositoryRoot = await mkdtemp(resolve(tmpdir(), "tworld-p6a-dist-"));
    const payloads = [
      ["alignment.json", "application/json", encoder.encode(canonicalizeJson({ kind: "alignment" }))],
      ["lynx/causal-journal.json", "application/json", encoder.encode(canonicalizeJson({ kind: "lynx-journal" }))],
      ["ms/causal-journal.json", "application/json", encoder.encode(canonicalizeJson({ kind: "ms-journal" }))],
      ["portfolio.json", "application/json", encoder.encode(canonicalizeJson({ kind: "portfolio" }))],
      ["review.html", "text/html", encoder.encode("<!doctype html><title>review</title>\n")],
      ["review.md", "text/markdown", encoder.encode("# Review\n")],
    ] as const;
    try {
      const sha256 = new WebCryptoSha256();
      const files = await Promise.all(payloads.map(async ([suffix, mediaType, content]) => ({
        path: `${checkedRoot}/${suffix}`,
        mediaType,
        content: await referenceSourceBytes(content, sha256),
      })));
      const manifest = encoder.encode(canonicalizeJson({
        manifestType: "p6a-key-pyramid-causal-review-manifest",
        manifestVersion: 1,
        caseId: "cclp1-001",
        proof: { retention: "complete" },
        filesOrder: "path",
        files,
      }));
      for (const [suffix, , content] of payloads) {
        const path = resolve(repositoryRoot, checkedRoot, suffix);
        await mkdir(resolve(path, ".."), { recursive: true });
        await writeFile(path, content);
      }
      await writeFile(resolve(repositoryRoot, checkedRoot, "manifest.json"), manifest);

      const dist = await loadCheckedP6aDistOutputs(repositoryRoot);
      expect(dist.map(({ path }) => path)).toEqual([
        "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment/alignment.json",
        "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment/index.html",
        "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment/lynx/causal-journal.json",
        "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment/manifest.json",
        "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment/ms/causal-journal.json",
        "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment/portfolio.json",
        "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment/review.md",
      ]);

      await writeFile(
        resolve(repositoryRoot, checkedRoot, "review.md"),
        encoder.encode("# Mutated review\n"),
      );
      await expect(loadCheckedP6aDistOutputs(repositoryRoot)).rejects.toThrow(
        "manifest payload drifted",
      );
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
});
