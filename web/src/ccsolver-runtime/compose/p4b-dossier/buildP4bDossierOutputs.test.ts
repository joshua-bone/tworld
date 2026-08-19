import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  buildP4bDossierOutputs,
  P4B_CHECKED_OUTPUT_ROOT,
  P4B_LEVEL_ROUTE,
} from "./buildP4bDossierOutputs";
import {
  CHECKED_P5_MANIFEST_PATH,
  loadVerifiedP5DossierInput,
} from "./checkedP5DossierInput";
import {
  P4B_DOSSIER_CSS,
  P4B_DOSSIER_JS,
  renderP4bKeyPyramidPage,
} from "./p4bDossierPage";
import { createKeyPyramidWholeLevelView } from "./p4bDossierVisuals";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");
const decoder = new TextDecoder();

describe("P4B checked Key Pyramid dossier", () => {
  it("builds the complete static-first human review page only from checked P5 bytes", async () => {
    const result = await buildP4bDossierOutputs(repositoryRoot);
    const paths = result.distOutputs.map(({ path }) => path);
    const page = result.distOutputs.find(({ path }) => path === `${P4B_LEVEL_ROUTE}/index.html`);

    expect(result.sourceAudit).toEqual({
      checkedP5ManifestPath: "ccsolver/fixtures/golden/p5/cclp1-001/manifest.json",
      checkedP5FilesDeclared: 32,
      checkedP5FilesVerified: 32,
      p1Reads: 0,
      p3Reads: 0,
      engineRuns: 0,
    });
    expect(paths).toContain("ccsolver/index.html");
    expect(paths).toContain("ccsolver/routes.v1.json");
    expect(paths).toContain(`${P4B_LEVEL_ROUTE}/index.html`);
    expect(paths.filter((path) => /^ccsolver\/assets\/key-pyramid-(ms|lynx)-[a-f0-9]{64}\.svg$/u.test(path)))
      .toHaveLength(2);
    expect(paths.filter((path) => /^ccsolver\/assets\/boundary-(ms|lynx)-\d\d-[a-f0-9]{64}\.svg$/u.test(path)))
      .toHaveLength(14);
    expect(paths.filter((path) => path.startsWith("ccsolver/data/p5/"))).toHaveLength(33);
    expect(paths.filter((path) => path.endsWith(".tws") && path.startsWith("ccsolver/downloads/")))
      .toHaveLength(2);

    expect(page?.mediaType).toBe("text/html");
    const html = decoder.decode(page?.content);
    expect(html).toContain("Key Pyramid · verified whole-level dossier");
    expect(html).toContain("Human review: unreviewed");
    expect(html).toContain("This dossier is not donor-blind");
    expect(html).toContain("24 exact start/end panel instances");
    expect(html.match(/class="boundary-panel"/gu)).toHaveLength(24);
    expect(html.match(/class="subgoal-capsule"/gu)).toHaveLength(12);
    expect(html.match(/class="whole-map"/gu)).toHaveLength(2);
    expect(html).toContain("MS trigger/settled tick");
    expect(html).toContain("Lynx trigger/settled tick");
    expect(html).toContain("Exact same-run joins");
    expect(html).toContain("Terminal-first plan graph");
    expect(html).toContain("29 / 29 selected route events");
    expect(html).toContain("Candidate plan authority");
    expect(html).toContain("Solved-current outcome");
    expect(html).toContain("all 32 files listed by the P5 manifest");
    expect(html.match(/class="plan-node"/gu)).toHaveLength(58);
    expect(html).toContain("No tile or causal relationship is inferred by this page");
    expect(html).toContain("<noscript>This complete dossier does not require JavaScript.</noscript>");
    expect(html.match(/<input type="checkbox" checked/gu)).toHaveLength(4);
    expect(html).not.toMatch(/<input type="checkbox"(?! checked)/u);
    expect(html.match(/<input type="range"[^>]*value="100"/gu)).toHaveLength(2);
    expect(html).not.toContain("autoplay");
    expect(html).not.toContain("sitemap");
    expect(html).not.toMatch(/(?:href|src)=["'][^"']*(?:player|index-[^"']+\.js)/u);

    const checkedPaths = result.checkedOutputs.map(({ path }) => path);
    expect(checkedPaths).toEqual([
      `${P4B_CHECKED_OUTPUT_ROOT}/manifest.json`,
      `${P4B_CHECKED_OUTPUT_ROOT}/review.md`,
    ]);
    const checkedManifest = JSON.parse(decoder.decode(result.checkedOutputs[0]!.content));
    expect(checkedManifest.reviewState).toEqual({ status: "unreviewed", humanApproved: false });
    expect(checkedManifest.counts).toMatchObject({
      targets: 2,
      subgoalCapsules: 12,
      renderedPanelInstances: 24,
      uniqueBoundaryPanels: 14,
      fullMapViews: 2,
    });
  }, 30_000);

  it("toggles the hidden attribute on SVG overlay groups and restores checked visibility", () => {
    const attributes = new Set<string>();
    const svgOverlay = {
      toggleAttribute(name: string, force: boolean) {
        if (force) attributes.add(name);
        else attributes.delete(name);
      },
    };
    let change: (() => void) | undefined;
    const checkbox = {
      checked: true,
      getAttribute: (name: string) => name === "data-overlay-toggle" ? "plan-intent-route" : null,
      addEventListener: (event: string, listener: () => void) => {
        if (event === "change") change = listener;
      },
    };
    const map = {
      querySelectorAll: (selector: string) => selector === ".overlay--plan-intent-route"
        ? [svgOverlay]
        : [],
    };
    const documentLike = {
      documentElement: { classList: { add: () => undefined } },
      querySelectorAll: (selector: string) => {
        if (selector === "[data-overlay-toggle]") return [checkbox];
        if (selector === "[data-map-zoom]") return [];
        if (selector === ".whole-map") return [map];
        return [];
      },
      getElementById: () => null,
    };

    new Function("document", P4B_DOSSIER_JS)(documentLike);
    checkbox.checked = false;
    change?.();
    expect(attributes.has("hidden")).toBe(true);
    checkbox.checked = true;
    change?.();
    expect(attributes.has("hidden")).toBe(false);
  });

  it("renders a terminal-connected typed plan graph without promoting chronology", async () => {
    const source = await loadVerifiedP5DossierInput(repositoryRoot);
    const result = await buildP4bDossierOutputs(repositoryRoot);
    const page = result.distOutputs.find(({ path }) => path === `${P4B_LEVEL_ROUTE}/index.html`);
    const html = decoder.decode(page?.content);
    const edgePattern = /data-plan-target="(ms|lynx)" data-plan-edge-from="(\d+)" data-plan-edge-to="(\d+|initial-state)" data-plan-edge-kind="([^"]+)"/gu;
    const displayedEdges = [...html.matchAll(edgePattern)].map((match) => ({
      target: match[1]!,
      from: Number(match[2]),
      to: match[3] === "initial-state" ? null : Number(match[3]),
      kind: match[4]!,
    }));

    for (const target of source.targets) {
      const edges = displayedEdges.filter((edge) => edge.target === target.target);
      expect(edges).toHaveLength(target.plan.prerequisiteEdges.length);
      expect(edges.some(({ kind }) => kind === "selected-route-predecessor-state")).toBe(true);
      const reachable = new Set([28]);
      const pending = [28];
      while (pending.length > 0) {
        const from = pending.shift()!;
        for (const edge of edges.filter((candidate) => candidate.from === from)) {
          if (edge.to !== null && !reachable.has(edge.to)) {
            reachable.add(edge.to);
            pending.push(edge.to);
          }
        }
      }
      expect([...reachable].sort((left, right) => left - right)).toEqual(
        Array.from({ length: 29 }, (_, eventOrder) => eventOrder),
      );
    }
    expect(html).not.toMatch(/class="chronology"[^>]*data-plan-edge-/u);
    expect(html).toContain("Selected-route predecessor-state dependency");
  }, 30_000);

  it("rejects a presentation graph with a broken selected-route predecessor chain", async () => {
    const source = await loadVerifiedP5DossierInput(repositoryRoot);
    const ms = source.targets[0];
    const brokenMs = {
      ...ms,
      plan: {
        ...ms.plan,
        prerequisiteEdges: ms.plan.prerequisiteEdges.filter((edge: Record<string, any>) => !(
          edge.kind === "selected-route-predecessor-state"
          && edge.fromRouteEventOrder === 28
        )),
      },
    };
    const panelAssets = new Map<string, string>();
    for (const target of ["ms", "lynx"]) {
      for (let boundaryOrder = 0; boundaryOrder < 7; boundaryOrder += 1) {
        panelAssets.set(`${target}:${boundaryOrder}`, `${target}-${boundaryOrder}.svg`);
      }
    }

    expect(() => renderP4bKeyPyramidPage({
      source: { ...source, targets: [brokenMs, source.targets[1]] } as typeof source,
      cssAsset: "dossier.css",
      jsAsset: "dossier.js",
      fullMapSvgs: new Map([["ms", "<svg ></svg>"], ["lynx", "<svg ></svg>"]]),
      fullMapAssets: new Map([["ms", "ms.svg"], ["lynx", "lynx.svg"]]),
      panelAssets,
      twsDownloads: new Map([["ms", "ms.tws"], ["lynx", "lynx.tws"]]),
    })).toThrow(/exact 29-edge selected-route predecessor-state chain/u);
  }, 30_000);

  it("bounds plan-grid min-content width for narrow review viewports", () => {
    expect(P4B_DOSSIER_CSS).toContain(".plan-layout>*{min-width:0}");
    expect(P4B_DOSSIER_CSS).toContain(".plan-graph{min-width:0");
    expect(P4B_DOSSIER_CSS).toContain(".plan-node{min-width:0;overflow-wrap:anywhere");
    expect(P4B_DOSSIER_CSS).not.toContain("body{overflow-x:hidden");
  });

  it("binds each view and certified outcome through the checked candidate plan authority", async () => {
    const source = await loadVerifiedP5DossierInput(repositoryRoot);

    for (const target of source.targets) {
      expect(target.plan.status).toBe("candidate");
      expect(target.expandedPlan.payload.status).toBe("candidate");
      expect(target.expandedPlan.payload.document.content).toEqual(target.files.plan.content);
      expect(target.expandedPlan.payload.selectedImplementation.content).toEqual(
        target.files.route.content,
      );
      expect(target.plan.route.content).toEqual(target.files.route.content);
      expect(target.plan.backwardTrace).toHaveLength(29);
      expect(target.plan.terminalRootedTraversal).toMatchObject({
        allSelectedRouteEventsReachable: true,
        selectedRouteEventCount: 29,
      });
      expect(target.terminalTriggerTick).toBe(target.witness.terminal.nativeTick);
      expect(target.traceSettledTerminalTick).toBe(
        target.certification.verification.typescript.terminalTick,
      );

      const view = createKeyPyramidWholeLevelView(target);
      expect(view.bindings.planContent).toEqual(target.files.plan.content);
      expect(view.bindings.planContent).not.toEqual(target.files.route.content);
    }
  }, 30_000);

  it("fails closed when a self-consistent expanded-plan file stops binding the plan packet", async () => {
    const manifestPath = resolve(repositoryRoot, CHECKED_P5_MANIFEST_PATH);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const expandedPath = manifest.targets[0].files.expandedPlan.path as string;
    const expanded = JSON.parse(await readFile(resolve(repositoryRoot, expandedPath), "utf8"));
    expanded.payload.document.content = manifest.targets[0].files.route.content;
    const changedExpanded = new TextEncoder().encode(
      canonicalizeJson(expanded as CanonicalJsonValue),
    );
    const changedContent = {
      byteLength: changedExpanded.byteLength,
      digest: `sha256:${createHash("sha256").update(changedExpanded).digest("hex")}`,
    };
    manifest.targets[0].files.expandedPlan.content = changedContent;
    const listed = manifest.files.find((file: { readonly path: string }) => file.path === expandedPath);
    listed.content = changedContent;
    const changedManifest = new TextEncoder().encode(
      canonicalizeJson(manifest as CanonicalJsonValue),
    );

    await expect(loadVerifiedP5DossierInput(repositoryRoot, {
      readBytes: async (path) => {
        if (path === manifestPath) return changedManifest;
        if (path === resolve(repositoryRoot, expandedPath)) return changedExpanded;
        return new Uint8Array(await readFile(path));
      },
    })).rejects.toThrow(/expanded-plan document does not bind the exact planning packet/u);
  }, 30_000);

  it("fails closed when any P5 manifest-listed byte no longer matches its digest", async () => {
    const originalReadFile = async (path: string): Promise<Uint8Array> => (
      new Uint8Array(await readFile(path))
    );
    await expect(buildP4bDossierOutputs(repositoryRoot, {
      readBytes: async (path) => {
        const value = await originalReadFile(path);
        return path.endsWith("/ms/route.json")
          ? new Uint8Array([...value, 0x20])
          : value;
      },
    })).rejects.toThrow(/P5 checked file digest or length mismatch.*ms\/route\.json/u);
  }, 30_000);
});
