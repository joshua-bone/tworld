import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { buildP4aReviewOutputs } from "./buildP4aReviewOutputs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

const sha256 = (content: string): string => (
  `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`
);

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const p3Paths = [
  "ccsolver/fixtures/golden/p3/cclp1-001/lynx/red-key-witness.json",
  "ccsolver/fixtures/golden/p3/cclp1-001/lynx/terminal-plan.json",
  "ccsolver/fixtures/golden/p3/cclp1-001/ms/red-key-witness.json",
  "ccsolver/fixtures/golden/p3/cclp1-001/ms/terminal-plan.json",
] as const;

const reviewPaths = [
  "ccsolver/reviews/p4a/cclp1-001/lynx/red-key.review.v1.json",
  "ccsolver/reviews/p4a/cclp1-001/ms/red-key.review.v1.json",
  "ccsolver/reviews/p4a/synthetic-standard-failed-red-key.review.v1.json",
] as const;

async function copyInputs(destinationRoot: string): Promise<void> {
  for (const path of [...p3Paths, ...reviewPaths]) {
    const destination = resolve(destinationRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(repositoryRoot, path), destination);
  }
}

describe("checked P4A subgoal evidence review outputs", () => {
  it("projects exactly three canonical views and seven byte-addressed static panels", async () => {
    const outputs = await buildP4aReviewOutputs(repositoryRoot);
    const evidence = outputs.filter(({ path }) => path.endsWith("evidence.json"));
    const panels = outputs.filter(({ mediaType }) => mediaType === "image/svg+xml");
    const manifestOutput = outputs.find(({ path }) => path.endsWith("/manifest.json"));
    const htmlOutput = outputs.find(({ path }) => path.endsWith("/review.html"));

    expect(evidence).toHaveLength(3);
    expect(panels).toHaveLength(7);
    expect(manifestOutput).toBeDefined();
    expect(htmlOutput).toBeDefined();
    expect(outputs.some(({ path }) => path.startsWith("ccsolver/reviews/p4a/"))).toBe(false);

    const views = evidence.map(({ content }) => {
      expect(canonicalizeJson(JSON.parse(content))).toBe(content);
      return JSON.parse(content) as Record<string, any>;
    });
    expect(views.map(({ viewId }) => viewId).sort()).toEqual([
      "view:key-pyramid:lynx:adjacent-red-key",
      "view:key-pyramid:ms:adjacent-red-key",
      "view:synthetic:ms:failed-red-key-canary",
    ]);
    expect(views.filter(({ ending }) => ending.kind === "verified")).toHaveLength(2);
    expect(views.filter(({ ending }) => ending.kind === "failed")).toHaveLength(1);
    expect(views.every(({ motion }) => (
      motion.kind === "not-recommended"
      && motion.reason === "no-intermediate-semantic-scenes"
    ))).toBe(true);

    for (const panel of panels) {
      const digest = sha256(panel.content);
      expect(panel.path).toContain(digest.slice("sha256:".length));
      expect(panel.content).toContain("<svg");
      expect(panel.content).not.toContain("<script");
    }

    const manifest = JSON.parse(manifestOutput!.content) as Record<string, any>;
    expect(canonicalizeJson(manifest)).toBe(manifestOutput!.content);
    expect(manifest).toMatchObject({
      manifestType: "p4a-review-output-manifest",
      manifestVersion: 1,
      counts: { views: 3, svgPanels: 7 },
      motion: {
        recommendation: "not-recommended",
        reason: "no-intermediate-semantic-scenes",
        generatedAssets: [],
      },
    });
    expect(manifest.sources).toHaveLength(4);
    expect(manifest.views).toHaveLength(3);
    expect(manifest.assets).toHaveLength(7);
    expect(manifest.views.map(({ review }: Record<string, any>) => review.sourceState.status)).toEqual([
      "unreviewed",
      "unreviewed",
      "unreviewed",
    ]);
    expect(manifest.views.map(({ review }: Record<string, any>) => review.effectiveState.status)).toEqual([
      "unreviewed",
      "unreviewed",
      "unreviewed",
    ]);
  });

  it("uses checked P3 bytes without engines and keeps evidence bases honest", async () => {
    const outputs = await buildP4aReviewOutputs(repositoryRoot);
    const manifest = JSON.parse(
      outputs.find(({ path }) => path.endsWith("/manifest.json"))!.content,
    ) as Record<string, any>;
    const views = outputs
      .filter(({ path }) => path.endsWith("evidence.json"))
      .map(({ content }) => JSON.parse(content) as Record<string, any>);
    const realViews = views.filter(({ caseId }) => caseId === "cclp1-001");

    for (const source of manifest.sources) {
      const bytes = await readFile(resolve(repositoryRoot, source.path), "utf8");
      expect(source.content).toEqual({
        digest: sha256(bytes),
        byteLength: Buffer.byteLength(bytes, "utf8"),
      });
      expect(canonicalizeJson(JSON.parse(bytes))).toBe(bytes);
    }
    expect(manifest.provenance).toMatchObject({
      keyPyramidAuthority: "checked-p3-json",
      keyPyramidEnginesExecuted: false,
      syntheticCanaryAuthority: "bounded-fake-solver-runtime-port-through-p3b",
      networkAccess: false,
    });

    for (const view of realViews) {
      const checkedPlan = JSON.parse(await readFile(
        resolve(repositoryRoot, `ccsolver/fixtures/golden/p3/cclp1-001/${view.target}/terminal-plan.json`),
        "utf8",
      )) as Record<string, any>;
      const checkedWitness = JSON.parse(await readFile(
        resolve(repositoryRoot, `ccsolver/fixtures/golden/p3/cclp1-001/${view.target}/red-key-witness.json`),
        "utf8",
      )) as Record<string, any>;
      const manifestView = manifest.views.find(({ viewId }: Record<string, any>) => (
        viewId === view.viewId
      ));
      expect(view.plan).toEqual(checkedPlan.content);
      expect(view.witness).toEqual(checkedWitness.witness.content);
      expect(manifestView.witnessContent).toEqual(checkedWitness.witness.content);
      expect(manifestView.review.sourceState.binding.witnessContent).toEqual(
        checkedWitness.witness.content,
      );
      const bases = view.overlays.map(({ basis }: Record<string, any>) => basis);
      expect(bases).not.toContain("donor-evidence");
      expect(view.overlays.filter(({ kind }: Record<string, any>) => kind === "route")).toEqual([
        expect.objectContaining({ basis: "plan-intent" }),
      ]);
      expect(view.overlays).toEqual(expect.arrayContaining([
        expect.objectContaining({ basis: "regressed-requirement", role: "later-gate" }),
        expect.objectContaining({ basis: "backward-candidate", role: "selected-target" }),
        expect.objectContaining({ basis: "backward-candidate", role: "retained-alternative" }),
        expect.objectContaining({ basis: "observed-witness", role: "route-start" }),
        expect.objectContaining({ basis: "observed-witness", kind: "state-change" }),
      ]));
      expect(view.correctness).toEqual({
        fullWorldWitnessIsAuthority: true,
        croppedPanelsAreReviewOnly: true,
      });
    }

    const msView = realViews.find(({ target }) => target === "ms")!;
    const msStartCell = msView.starting.scene.cells.find(
      ({ coordinate }: Record<string, any>) => coordinate.x === 15 && coordinate.y === 19,
    );
    expect(msStartCell.items.map(({ semanticType }: Record<string, any>) => semanticType)).toEqual([
      "cc1:chip",
    ]);
  });

  it.each([
    { boundary: "entry", renderKey: "entryRender" },
    { boundary: "stop", renderKey: "stopRender" },
  ] as const)(
    "rejects canonical but tampered $boundary render scene bytes",
    async ({ boundary, renderKey }) => {
      const temporaryRoot = await mkdtemp(resolve(tmpdir(), "tworld-p4a-render-binding-"));
      const witnessPath = p3Paths[2];
      try {
        await copyInputs(temporaryRoot);
        const witness = JSON.parse(
          await readFile(resolve(temporaryRoot, witnessPath), "utf8"),
        ) as Record<string, any>;
        const render = witness.visualReview[renderKey] as Record<string, any>;
        const changedCellIndex = render.cells.findIndex(
          ({ items }: Record<string, any>) => items.length > 0,
        );
        expect(changedCellIndex).toBeGreaterThanOrEqual(0);
        render.cells[changedCellIndex] = {
          ...render.cells[changedCellIndex],
          items: [],
        };
        const tamperedBytes = canonicalizeJson(witness);
        expect(canonicalizeJson(JSON.parse(tamperedBytes))).toBe(tamperedBytes);
        await writeFile(resolve(temporaryRoot, witnessPath), tamperedBytes, "utf8");

        await expect(buildP4aReviewOutputs(temporaryRoot)).rejects.toThrow(
          `ms checked P3 ${boundary} render content binding disagrees`,
        );
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    },
  );

  it("shows a canonical standard-only failed witness without conflating expectation and observation", async () => {
    const outputs = await buildP4aReviewOutputs(repositoryRoot);
    const failed = JSON.parse(
      outputs.find(({ path }) => path.includes("synthetic-standard-failed-red-key/evidence.json"))!
        .content,
    ) as Record<string, any>;
    const manifest = JSON.parse(
      outputs.find(({ path }) => path.endsWith("/manifest.json"))!.content,
    ) as Record<string, any>;

    expect(failed.target).toBe("ms");
    expect(failed.ending).toMatchObject({
      kind: "failed",
      expected: { panelKind: "intended-ending", binding: { kind: "expected" } },
      actual: { panelKind: "actual-failure", binding: { kind: "observed" } },
      firstFailure: {
        code: "witness.postcondition",
        predicateId: "predicate:synthetic:red-key-inventory-one",
        detail: "Expected red-key inventory 1; observed 0.",
      },
    });
    expect(failed.starting.binding).not.toEqual(failed.ending.actual.binding);
    expect(manifest.syntheticCanary).toMatchObject({
      scope: "standard-only",
      claim: "synthetic-contextual-witness-not-gameplay-engine-evidence",
      expectedPredicate: {
        predicateId: "predicate:synthetic:red-key-inventory-one",
        expected: 1,
        actual: 0,
        passed: false,
      },
      join: {
        state: "exact",
        comparedDecisionCount: 1,
        firstDivergenceDecisionOrder: null,
      },
    });
    expect(manifest.syntheticCanary.expectedSceneContent.digest).toMatch(
      /^sha256:[0-9a-f]{64}$/u,
    );
    expect(manifest.syntheticCanary.witness.outcome.failure.code).toBe(
      "witness.postcondition",
    );
    expect(manifest.syntheticCanary.witness).toMatchObject({
      entry: {
        observation: {
          player: { coordinate: { x: 1, y: 1, z: 0 } },
          remainingRequirements: [{ resourceType: "cc1:icchip", count: 2 }],
        },
      },
      end: {
        observation: {
          player: { coordinate: { x: 1, y: 1, z: 0 } },
          remainingRequirements: [{ resourceType: "cc1:icchip", count: 1 }],
        },
      },
    });
    const expectedKeyCell = manifest.syntheticCanary.expectedScene.cells.find(
      ({ coordinate }: Record<string, any>) => coordinate.x === 2 && coordinate.y === 1,
    );
    expect(expectedKeyCell.items.map(({ semanticType }: Record<string, any>) => semanticType)).toEqual([
      "cc1:floor",
      "cc1:chip",
    ]);
  });

  it("emits a deterministic no-JS accessible review and stays inside output caps", async () => {
    const first = await buildP4aReviewOutputs(repositoryRoot);
    const second = await buildP4aReviewOutputs(repositoryRoot);
    expect(second).toEqual(first);

    const html = first.find(({ path }) => path.endsWith("/review.html"))!.content;
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toMatch(/<h1[^>]*>Key Pyramid P4A subgoal evidence review<\/h1>/u);
    expect(html.match(/<figure>/gu)).toHaveLength(7);
    expect(html.match(/class="panel-grid"/gu)).toHaveLength(2);
    expect(html).toContain("Cell-stack textual equivalent");
    expect(html).toContain("Cross-view comparison");
    expect(html).toContain("Full provenance");
    expect(html).not.toMatch(/<script|\.gif|<video|<canvas/iu);

    let total = 0;
    for (const output of first) {
      const byteLength = Buffer.byteLength(output.content, "utf8");
      expect(byteLength, output.path).toBeLessThanOrEqual(512 * 1024);
      total += byteLength;
    }
    expect(total).toBeLessThanOrEqual(2 * 1024 * 1024);

    const all = first.map(({ path, content }) => `${path}\n${content}`).join("\n");
    expect(all).not.toMatch(/\/Users\/|[A-Z]:\\/u);
    expect(all).not.toMatch(/(?:href|src)=["']https?:\/\/|url\(\s*["']?https?:\/\//iu);
    expect(all).not.toMatch(/generatedAt|createdAt|timestamp|rawTile|tileId/iu);
  });

  it("publishes every used overlay as visible per-panel annotation text", async () => {
    const outputs = await buildP4aReviewOutputs(repositoryRoot);
    const html = outputs.find(({ path }) => path.endsWith("/review.html"))!.content;
    const views = outputs
      .filter(({ path }) => path.endsWith("evidence.json"))
      .map(({ content }) => JSON.parse(content) as Record<string, any>);

    for (const view of views) {
      const panels = [
        view.starting,
        ...(view.ending.kind === "verified"
          ? [view.ending.observed]
          : [view.ending.expected, view.ending.actual]),
      ];
      for (const panel of panels) {
        const heading = `id="${panel.panelId}-heading"`;
        const headingIndex = html.indexOf(heading);
        expect(headingIndex, panel.panelId).toBeGreaterThanOrEqual(0);
        const articleStart = html.lastIndexOf("<article", headingIndex);
        const articleEnd = html.indexOf("</article>", headingIndex);
        const article = html.slice(articleStart, articleEnd);
        expect(article, panel.panelId).toContain('class="annotation-equivalents"');
        for (const overlayId of panel.overlayIds) {
          const overlay = view.overlays.find(
            ({ overlayId: candidateId }: Record<string, any>) => candidateId === overlayId,
          );
          expect(overlay, overlayId).toBeDefined();
          expect(article, overlayId).toContain(
            `<th scope="row">${escapeHtml(overlay.label)}</th>`,
          );
          expect(article, overlayId).toContain(
            `<td><code>${escapeHtml(overlay.basis)}</code></td>`,
          );
          expect(article, overlayId).toContain(
            `<td>${escapeHtml(overlay.textEquivalent)}</td>`,
          );
        }
      }
    }
  });

  it("preserves human sidecar bytes while exposing stale rebinds and rejects dangling overrides", async () => {
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), "tworld-p4a-review-"));
    const reviewPath = reviewPaths[1];
    try {
      await copyInputs(temporaryRoot);
      const original = JSON.parse(
        await readFile(resolve(temporaryRoot, reviewPath), "utf8"),
      ) as Record<string, any>;
      const reviewed = {
        ...original,
        binding: {
          ...original.binding,
          witnessContent: {
            byteLength: 1,
            digest: `sha256:${"9".repeat(64)}`,
          },
        },
        status: "reviewed",
        notes: [{ noteId: "note:retain", text: "Keep the red-key candidate visible." }],
        overlayOverrides: [{
          overrideId: "override:red-key-copy",
          overlayId: "overlay:key-pyramid:ms:selected-red-key",
          replacementText: "Selected red-key candidate",
          hidden: false,
        }],
        staleBinding: null,
      };
      const reviewedBytes = canonicalizeJson(reviewed);
      await writeFile(resolve(temporaryRoot, reviewPath), reviewedBytes, "utf8");

      const outputs = await buildP4aReviewOutputs(temporaryRoot);
      expect(await readFile(resolve(temporaryRoot, reviewPath), "utf8")).toBe(reviewedBytes);
      const manifest = JSON.parse(
        outputs.find(({ path }) => path.endsWith("/manifest.json"))!.content,
      ) as Record<string, any>;
      const ms = manifest.views.find(({ viewId }: Record<string, any>) => (
        viewId === "view:key-pyramid:ms:adjacent-red-key"
      ));
      expect(ms.review.sourceState).toEqual(reviewed);
      expect(ms.review.effectiveState).toMatchObject({
        status: "changes-requested",
        notes: reviewed.notes,
        overlayOverrides: reviewed.overlayOverrides,
        staleBinding: { reason: "bound-witness-changed" },
      });

      const dangling = {
        ...reviewed,
        overlayOverrides: [{
          ...reviewed.overlayOverrides[0],
          overlayId: "overlay:missing",
        }],
      };
      await writeFile(
        resolve(temporaryRoot, reviewPath),
        canonicalizeJson(dangling),
        "utf8",
      );
      await expect(buildP4aReviewOutputs(temporaryRoot)).rejects.toThrow(
        /names an unknown overlay/u,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
