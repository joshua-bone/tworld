import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { P6A_TERMINAL_TRIGGER_TICK_HEADING } from "./buildP6aReviewOutputs";
import { loadVerifiedP6aInputs } from "./checkedP6aInputs";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");

describe("checked P6A source boundary", () => {
  it("labels the causal terminal latch as the trigger tick", () => {
    expect(P6A_TERMINAL_TRIGGER_TICK_HEADING).toBe("Terminal trigger tick");
    expect(P6A_TERMINAL_TRIGGER_TICK_HEADING).not.toBe("Terminal tick");
  });

  it("verifies non-TWS P5 bytes and reads the byte-held P4B inputs", async () => {
    const source = await loadVerifiedP6aInputs(repositoryRoot);

    expect(source.sourceAudit).toMatchObject({
      checkedP5FilesDeclared: 32,
      checkedP5FilesVerified: 30,
      checkedP4bFilesRead: 2,
      checkedP4bP5ManifestBindingMatched: true,
      donorReplayReads: 0,
    });
    expect(source.sourceAudit).not.toHaveProperty("checkedP4bFilesVerified");
    expect(source.baseline.some(({ path }) => path.endsWith(".tws"))).toBe(false);
    expect(source.routes.ms.events).toHaveLength(29);
    expect(source.routes.lynx.events).toHaveLength(29);
    expect(source.observerDisabledBaselines.ms).toMatchObject({
      source: "checked-p5-final-boundary-observation",
      terminal: { kind: "won", nativeTick: 644 },
    });
    expect(source.observerDisabledBaselines.lynx).toMatchObject({
      source: "checked-p5-final-boundary-observation",
      terminal: { kind: "won", nativeTick: 647 },
    });
  }, 30_000);

  it("rejects a stale or forged P4B binding to the checked P5 manifest", async () => {
    const forgedRoot = await mkdtemp(resolve(tmpdir(), "tworld-p6a-p4b-binding-"));
    const p5Path = "ccsolver/fixtures/golden/p5/cclp1-001/manifest.json";
    const p4bPath = "ccsolver/fixtures/golden/p4b/cclp1-001/manifest.json";
    const p4bReviewPath = "ccsolver/fixtures/golden/p4b/cclp1-001/review.md";
    try {
      const [p5Bytes, p4bText, p4bReviewBytes] = await Promise.all([
        readFile(resolve(repositoryRoot, p5Path)),
        readFile(resolve(repositoryRoot, p4bPath), "utf8"),
        readFile(resolve(repositoryRoot, p4bReviewPath)),
      ]);
      const forgedP4b = JSON.parse(p4bText) as Record<string, any>;
      forgedP4b.source.checkedP5Manifest.content.digest = `sha256:${"0".repeat(64)}`;
      for (const [path, bytes] of [
        [p5Path, p5Bytes],
        [p4bPath, new TextEncoder().encode(canonicalizeJson(forgedP4b))],
        [p4bReviewPath, p4bReviewBytes],
      ] as const) {
        const absolute = resolve(forgedRoot, path);
        await mkdir(resolve(absolute, ".."), { recursive: true });
        await writeFile(absolute, bytes);
      }

      await expect(loadVerifiedP6aInputs(forgedRoot)).rejects.toThrow(
        "checked P4B manifest has a stale P5 manifest binding",
      );
    } finally {
      await rm(forgedRoot, { recursive: true, force: true });
    }
  });
});
