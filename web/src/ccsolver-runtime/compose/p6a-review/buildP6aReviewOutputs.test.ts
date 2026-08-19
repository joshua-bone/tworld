import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { P6A_LEVEL_ROUTE } from "./buildP6aReviewOutputs";
import { loadCheckedP6aDistOutputs } from "./p6aReviewIo";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");
const decoder = new TextDecoder();
const checkedOutputs = loadCheckedP6aDistOutputs(repositoryRoot);

function readJson(
  outputs: Awaited<typeof checkedOutputs>,
  suffix: string,
): Record<string, any> {
  return JSON.parse(decoder.decode(
    outputs.find(({ path }) => path.endsWith(suffix))!.content,
  ));
}

describe("checked P2B/P6A Key Pyramid causal alignment", () => {
  it("loads complete target journals, a paired alignment, and a hidden public review", async () => {
    const outputs = await checkedOutputs;
    const manifest = readJson(outputs, "/manifest.json");

    expect(outputs.map(({ path }) => path)).toEqual([
      `${P6A_LEVEL_ROUTE}/alignment.json`,
      `${P6A_LEVEL_ROUTE}/index.html`,
      `${P6A_LEVEL_ROUTE}/lynx/causal-journal.json`,
      `${P6A_LEVEL_ROUTE}/manifest.json`,
      `${P6A_LEVEL_ROUTE}/ms/causal-journal.json`,
      `${P6A_LEVEL_ROUTE}/portfolio.json`,
      `${P6A_LEVEL_ROUTE}/review.md`,
    ]);
    expect(manifest.sourceAudit).toMatchObject({
      checkedP5ManifestPath: "ccsolver/fixtures/golden/p5/cclp1-001/manifest.json",
      checkedP4bManifestPath: "ccsolver/fixtures/golden/p4b/cclp1-001/manifest.json",
      checkedP4bFilesRead: 2,
      checkedP4bP5ManifestBindingMatched: true,
      checkedP4bInputsHeldByteStable: true,
      checkedP5Mutations: 0,
      donorReplayReads: 0,
    });
    expect(manifest.sourceAudit).not.toHaveProperty("checkedP4bFilesVerified");
    expect(manifest.sourceAudit).not.toHaveProperty("checkedP4bMutations");

    const page = outputs.find(
      ({ path }) => path === `${P6A_LEVEL_ROUTE}/index.html`,
    );
    const html = decoder.decode(page?.content);
    expect(html).toContain("Key Pyramid causal alignment");
    expect(html).toContain("Back to the whole-level dossier");
    expect(html).toContain("29 semantic milestones");
    expect(html).toContain("6 subgoals");
    expect(html).toContain("MS tick");
    expect(html).toContain("Lynx tick");
    expect(html).toContain("Download machine evidence");
    expect((html.match(/<details class="subgoal"/gu) ?? [])).toHaveLength(6);
    expect((html.match(/class="milestone"/gu) ?? [])).toHaveLength(29);
    expect(html).not.toContain("sha256:");
    expect(html).not.toContain("placement:");
    expect(html).not.toContain("font-family:'Cooper");

    const markdown = decoder.decode(outputs.find(
      ({ path }) => path.endsWith("/review.md"),
    )?.content);
    expect(markdown).toContain("held both checked P4B input files byte-stable");
    expect(markdown).not.toContain("digest-verified both checked P4B files");
  });

  it("retains authoritative causal milestones and refuses coordinate-only hard anchors", async () => {
    const outputs = await checkedOutputs;
    const ms = readJson(outputs, "ms/causal-journal.json");
    const lynx = readJson(outputs, "lynx/causal-journal.json");
    const alignment = readJson(outputs, "alignment.json");

    for (const journal of [ms, lynx]) {
      expect(journal).toMatchObject({
        journalType: "p2b-key-pyramid-causal-journal",
        journalVersion: 1,
        caseId: "cclp1-001",
        mode: "replay",
        integrity: { kind: "complete" },
        checkpointRestoreSuffixEqual: true,
        observerGameplayParity: true,
        deterministicRerunEqual: true,
      });
      expect(journal.events.length).toBeGreaterThan(29);
      expect(journal.events.some(
        ({ kind }: Record<string, any>) => kind === "movement-completed",
      )).toBe(true);
      expect(journal.events.some(
        ({ kind }: Record<string, any>) => kind === "resource-collected",
      )).toBe(true);
      expect(journal.events.some(
        ({ kind }: Record<string, any>) => kind === "map-mutated",
      )).toBe(true);
      expect(journal.events.some(
        ({ kind }: Record<string, any>) => kind === "terminal-reached",
      )).toBe(true);
    }

    expect(alignment).toMatchObject({
      alignmentType: "p6a-key-pyramid-causal-alignment",
      alignmentVersion: 1,
      caseId: "cclp1-001",
      leftTarget: "ms",
      rightTarget: "lynx",
      status: "aligned",
      overflow: null,
    });
    expect(alignment.hardAnchors.length).toBeGreaterThanOrEqual(29);
    expect(alignment.hardAnchors.every((anchor: Record<string, any>) => (
      anchor.basis !== "coordinate"
      && anchor.leftPlacementId === anchor.rightPlacementId
    ))).toBe(true);
    expect(alignment.summary.nativeTimingDifferences).toBeGreaterThan(0);
    expect(alignment.capabilities).toMatchObject({
      oneToManySpans: true,
      repeatedCoordinateOrdinals: true,
      coordinateOnlyHardAnchors: false,
    });
  });
});
