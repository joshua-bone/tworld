import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyP2aRuntimeReviewOutputs,
  buildP2aRuntimeReviewOutputs,
  type P2aRuntimeReviewOutput,
} from "./buildP2aRuntimeReviewOutputs";

const temporaryRoots: string[] = [];
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "tworld-p2a-review-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )));
});

const outputs: readonly P2aRuntimeReviewOutput[] = [
  {
    path: "ccsolver/fixtures/golden/p2a/example/ms/runtime-review.json",
    content: '{"previewVersion":1}',
    mediaType: "application/json",
  },
  {
    path: "ccsolver/fixtures/golden/p2a/example/review.md",
    content: "# Review\n",
    mediaType: "text/markdown",
  },
];

describe("checked P2A runtime review outputs", () => {
  it("writes deterministic bytes and then verifies them exactly", async () => {
    const root = await temporaryRoot();
    await applyP2aRuntimeReviewOutputs(root, "write", outputs);
    await expect(applyP2aRuntimeReviewOutputs(root, "check", outputs)).resolves.toBeUndefined();
    expect(await readFile(resolve(root, outputs[0]!.path), "utf8"))
      .toBe(outputs[0]!.content);
    expect(await readFile(resolve(root, outputs[1]!.path), "utf8"))
      .toBe(outputs[1]!.content);
  });

  it("rejects missing and stale checked evidence", async () => {
    const root = await temporaryRoot();
    await expect(applyP2aRuntimeReviewOutputs(root, "check", outputs))
      .rejects.toThrow("checked P2A runtime review output is missing");

    await applyP2aRuntimeReviewOutputs(root, "write", outputs);
    await writeFile(resolve(root, outputs[0]!.path), "stale", "utf8");
    await expect(applyP2aRuntimeReviewOutputs(root, "check", outputs))
      .rejects.toThrow("checked P2A runtime review output is stale");
  });

  it("rolls back every predecessor when a multi-file write cannot commit", async () => {
    const root = await temporaryRoot();
    await writeFile(resolve(root, "existing.json"), "old", "utf8");
    await writeFile(resolve(root, "blocked"), "still-here", "utf8");

    await expect(applyP2aRuntimeReviewOutputs(root, "write", [
      { path: "existing.json", content: "new", mediaType: "application/json" },
      { path: "blocked/new.json", content: "new", mediaType: "application/json" },
    ])).rejects.toThrow();

    expect(await readFile(resolve(root, "existing.json"), "utf8")).toBe("old");
    expect(await readFile(resolve(root, "blocked"), "utf8")).toBe("still-here");
    expect((await readdir(root)).filter((entry) => entry.startsWith(".p2a-review-output-")))
      .toEqual([]);
  });

  it("refuses output paths outside the repository root", async () => {
    const root = await temporaryRoot();
    await expect(applyP2aRuntimeReviewOutputs(root, "write", [{
      path: "../escaped.json",
      content: "{}",
      mediaType: "application/json",
    }])).rejects.toThrow("P2A output escapes the repository root");
  });

  it("builds the four real bounded packets from exact level and donor sources", async () => {
    const real = await buildP2aRuntimeReviewOutputs(repositoryRoot);
    expect(real.map(({ path }) => path)).toEqual([
      "ccsolver/fixtures/golden/p2a/cclp1-001/lynx/runtime-review.json",
      "ccsolver/fixtures/golden/p2a/cclp1-001/ms/runtime-review.json",
      "ccsolver/fixtures/golden/p2a/cclp1-001/review.md",
      "ccsolver/fixtures/golden/p2a/intro-008/lynx/runtime-review.json",
      "ccsolver/fixtures/golden/p2a/intro-008/ms/runtime-review.json",
      "ccsolver/fixtures/golden/p2a/intro-008/review.md",
    ]);

    const jsonOutputs = real.filter(({ mediaType }) => mediaType === "application/json");
    for (const { content } of jsonOutputs) {
      expect(canonicalizeJson(JSON.parse(content))).toBe(content);
    }
    const packets = jsonOutputs
      .map(({ content }) => JSON.parse(content) as Record<string, any>);
    for (const packet of packets) {
      expect(packet.reviewPoints).toHaveLength(3);
      expect(packet.source).toMatchObject({
        repositoryRevision: "42c78d0db343621f887fefce581315479d9a8be3",
        mapContent: { digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) },
        seriesContent: { digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) },
      });
      expect(packet.reviewPoints.every((point: any) => (
        point.observation.cells.length === 1_024 && point.render.cells.length === 1_024
      ))).toBe(true);
      expect(packet.reviewPoints.every((point: any) => (
        point.observation.provenance.engineRevision
          === "49cf63da3dda99e65dff5136fbabd0f7a09ce72f"
        && point.observation.provenance.adapterRevision
          === `ccsolver:tworld-${packet.target}-solver-runtime:p2a-v1`
      ))).toBe(true);
    }

    const keyMs = packets.find(({ caseId, target }) => caseId === "cclp1-001" && target === "ms")!;
    const keyLynx = packets.find(({ caseId, target }) => caseId === "cclp1-001" && target === "lynx")!;
    expect(keyMs).toMatchObject({
      donor: {
        fileContent: {
          digest: "sha256:2ace452b2857b9a9a74b3895c50396e4885641a9fbf2e19b0667d4fb75bde12f",
          byteLength: 46_980,
        },
        entryContent: {
          digest: "sha256:e51673644f7689900b590b8cecd864563039cfe93a490bf0296a925be7f10e7c",
          byteLength: 72,
        },
      },
      searchBounds: {
        resourceChangeMaximumAdvanceTicks: 1,
        resourceChangeObservedAfterAdvanceTicks: 1,
      },
    });
    expect(keyLynx).toMatchObject({
      donor: {
        fileContent: {
          digest: "sha256:5bda2f73f3be57d93761aa891a361f57c71f34be03fc364a3f718b9b3339c109",
          byteLength: 101_014,
        },
        entryContent: {
          digest: "sha256:e4cafdf60950a7bfd05d2760ff63cebd460ba28fae41f97217b79921628d87a2",
          byteLength: 72,
        },
      },
      searchBounds: {
        resourceChangeMaximumAdvanceTicks: 4,
        resourceChangeObservedAfterAdvanceTicks: 4,
      },
    });
    expect([keyMs, keyLynx].every((packet) => (
      packet.reviewPoints.slice(1).every((point: any) => (
        point.evidenceRole === "donor-runtime-characterization"
      ))
    ))).toBe(true);

    const intros = packets.filter(({ caseId }) => caseId === "intro-008");
    expect(intros.every((packet) => packet.reviewPoints[1].trigger.interpretation
      === "blocked-movement-observation-not-button-evidence")).toBe(true);
    expect(intros.every((packet) => packet.reviewPoints[1].observation.player.coordinate.x === 4
      && packet.reviewPoints[1].observation.player.coordinate.y === 4)).toBe(true);
  }, 60_000);
});
